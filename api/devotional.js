import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
// //
// --------------------------------------------------------------------
// NOTA: la tarea diaria que guarda el devocional en Supabase (para
// tener una fecha estable de Argentina) NO vive en un archivo aparte,
// porque el plan gratuito de Vercel permite como máximo 12 funciones
// y ya estaban todas ocupadas. En cambio, esa lógica se agregó ACÁ
// mismo: cuando Vercel Cron llama a este mismo endpoint (se reconoce
// por el header "Authorization" con el secreto de CRON_SECRET), además
// de devolver el devocional como siempre, lo guarda en Supabase Storage.
// --------------------------------------------------------------------

const SUPABASE_URL = 'https://ltwglqcqflakkjuuyhrg.supabase.co';
const SUPABASE_BUCKET = 'devocionales';
const SUPABASE_FILE = 'hoy.json';

// Fecha de HOY en Argentina, sin importar en qué huso horario esté
// corriendo el servidor de Vercel (normalmente corre en UTC).
function getArgentinaDateString() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`; // "YYYY-MM-DD"
}

async function guardarEnSupabase(devotionalResult) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('Falta configurar la variable de entorno SUPABASE_SERVICE_ROLE_KEY en Vercel');
  }

  const today = getArgentinaDateString();
  const snapshot = {
    date: today,
    title: devotionalResult.title,
    html: devotionalResult.html,
    updatedAt: new Date().toISOString()
  };

  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${SUPABASE_FILE}`;
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      'x-upsert': 'true'
    },
    body: JSON.stringify(snapshot)
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Error al guardar en Supabase: ${uploadRes.status} ${errText}`);
  }

  return today;
}

export default async function handler(req, res) {
  // Configuración CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const sourceUrl = 'https://www.bibliaon.com/es/palabra_del_dia/';
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

  // ¿Es Vercel Cron el que está llamando? (manda automáticamente este
  // header si configuraste la variable de entorno CRON_SECRET en Vercel)
  const cronSecret = process.env.CRON_SECRET;
  const esLlamadaDeCron = Boolean(cronSecret) && req.headers['authorization'] === `Bearer ${cronSecret}`;

  try {
    const response = await fetch(sourceUrl, { headers: { 'User-Agent': userAgent } });
    if (!response.ok) throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);

    const html = await response.text();
    const { document } = new JSDOM(html).window;

    // 1. Contenedor principal del devocional
    const mainContent = document.querySelector('.daily-content') || document.querySelector('.entry-content');
    if (!mainContent) throw new Error('Estructura de contenido no encontrada');

    // 2. Eliminar elementos no deseados (enlaces, scripts, anuncios, etc.)
    const unwanted = [
      'script', 'style', '.ads', '.sharedaddy', '.post-tags', 'div[class*="promo"]',
      'p > a', 'a'
    ];
    mainContent.querySelectorAll(unwanted.join(',')).forEach(el => el.remove());
    // Eliminar listas vacías o de recomendación
    mainContent.querySelectorAll('ul, li').forEach(el => el.remove());

    // 3. Extraer título real (saltando encabezados genéricos)
    let title;
    const h2s = Array.from(document.querySelectorAll('h2'));
    for (const h2 of h2s) {
      const txt = h2.textContent.trim();
      if (/^Palabra de (Hoy|Ayer|Anteayer)$/i.test(txt)) continue;
      title = txt;
      break;
    }
    if (!title) {
      title = document.querySelector('h1')?.textContent.trim() || 'Palabra del Día';
    }

    // 4. Limpiar HTML restante (quitar clases, estilos, puntos suspensivos)
    let cleanHTML = mainContent.innerHTML
      .replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1')
      .replace(/class="[^"]*"/g, '')
      .replace(/style="[^"]*"/g, '')
      .replace(/…/g, '');

    if (cleanHTML.length < 150) {
      throw new Error('Contenido insuficiente después de la limpieza');
    }

    // 5. Fecha formateada (YYYY-MM-DD) — la del servidor (UTC), se
    //    mantiene igual que antes para no romper nada que ya la use.
    const formattedDate = new Date().toISOString().split('T')[0];

    const devotionalResult = {
      title,
      date: formattedDate,
      html: cleanHTML,
      source: sourceUrl
    };

    // 6. Si es la tarea programada (Vercel Cron) la que llama, además
    //    de responder como siempre, guardar el snapshot en Supabase
    //    con la fecha REAL de Argentina.
    if (esLlamadaDeCron) {
      const fechaGuardada = await guardarEnSupabase(devotionalResult);
      console.log(`✅ [cron] Devocional del ${fechaGuardada} guardado en Supabase`);
      return res.status(200).json({ ok: true, guardadoEnSupabase: true, date: fechaGuardada });
    }

    // 7. Respuesta normal (la que ya usa la app)
    return res.status(200).json(devotionalResult);

  } catch (error) {
    console.error('Error en devotional.js:', error);
    return res.status(500).json({
      error: 'El devocional no está disponible temporalmente',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
}
