import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

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

// FIX: en vez de adivinar a qué hora bibliaon.com rota su contenido
// (se probó con las 20:00 hora Argentina y no fue exacto, rota en
// horarios variables), ahora se lee la fecha que la PROPIA página
// dice tener (ej: "JUEVES, 9 DE JULIO DE 2026", justo arriba del
// título). Así siempre se guarda con la fecha real y verdadera del
// contenido, sin adivinar nada.
const MESES_ES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12
};

function quitarAcentos(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Busca un patrón tipo "9 DE JULIO DE 2026" en el texto de la página
// y lo convierte a "2026-07-09". Devuelve null si no lo encuentra.
function extraerFechaDePagina(texto) {
  const match = quitarAcentos(texto).match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/i);
  if (!match) return null;

  const dia = parseInt(match[1], 10);
  const mes = MESES_ES[match[2].toLowerCase()];
  const anio = parseInt(match[3], 10);

  if (!mes) return null;

  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

async function guardarEnSupabase(devotionalResult) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('Falta configurar la variable de entorno SUPABASE_SERVICE_ROLE_KEY en Vercel');
  }

  // La fecha del snapshot es la fecha REAL del contenido (la que la
  // propia página declaró), no una calculada por nosotros.
  const today = devotionalResult.date;
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

    // 2. Extraer título REAL, buscando primero DENTRO del contenido
    //    (para poder borrarlo del cuerpo y que no salga duplicado más
    //    abajo, junto con el título destacado que arma la app)
    let title;
    let elementoTitulo = null;

    const encabezadosDentro = Array.from(mainContent.querySelectorAll('h1, h2, h3, h4'));
    for (const h of encabezadosDentro) {
      const txt = h.textContent.trim();
      if (!txt || /^Palabra de (Hoy|Ayer|Anteayer)$/i.test(txt)) continue;
      title = txt;
      elementoTitulo = h;
      break;
    }

    if (!title) {
      // Respaldo: buscar en toda la página (comportamiento anterior,
      // por si el título no está dentro del contenedor principal)
      const h2s = Array.from(document.querySelectorAll('h2'));
      for (const h2 of h2s) {
        const txt = h2.textContent.trim();
        if (/^Palabra de (Hoy|Ayer|Anteayer)$/i.test(txt)) continue;
        title = txt;
        break;
      }
    }
    if (!title) {
      title = document.querySelector('h1')?.textContent.trim() || 'Palabra del Día';
    }

    // 3. Eliminar elementos no deseados (enlaces, scripts, anuncios, etc.)
    const unwanted = [
      'script', 'style', '.ads', '.sharedaddy', '.post-tags', 'div[class*="promo"]',
      'p > a', 'a'
    ];
    mainContent.querySelectorAll(unwanted.join(',')).forEach(el => el.remove());
    // Eliminar listas vacías o de recomendación
    mainContent.querySelectorAll('ul, li').forEach(el => el.remove());

    // FIX: eliminar el título del cuerpo del texto (si estaba adentro),
    // para que no aparezca duplicado (una vez como título destacado y
    // otra vez repetido dentro del contenido)
    if (elementoTitulo && elementoTitulo.parentNode) {
      elementoTitulo.remove();
    }

    // FIX: eliminar el bloque final "Lee también" y todo lo que venga
    // después — es una llamada a otros artículos relacionados, no es
    // parte del devocional en sí.
    const bloques = Array.from(mainContent.querySelectorAll('p, div'));
    for (const el of bloques) {
      if (/lee\s+tambi[eé]n/i.test(el.textContent)) {
        let actual = el;
        while (actual) {
          const siguiente = actual.nextElementSibling;
          actual.remove();
          actual = siguiente;
        }
        break;
      }
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

    // 5. Fecha REAL del contenido: se busca en el texto de la página
    //    (ej: "JUEVES, 9 DE JULIO DE 2026") en vez de calcularla con el
    //    reloj del servidor. Si por algún motivo no se encuentra ese
    //    texto (cambió el diseño de la página, etc.), se usa como
    //    respaldo la fecha del servidor para no romper todo.
    const fechaDeLaPagina = extraerFechaDePagina(document.body.textContent || '');
    const formattedDate = fechaDeLaPagina || new Date().toISOString().split('T')[0];

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
