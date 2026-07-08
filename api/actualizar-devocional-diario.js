import fetch from 'node-fetch';

// --------------------------------------------------------------------
// Este endpoint lo llama Vercel Cron una vez por día, a las 00:00 hora
// Argentina (ver "crons" en vercel.json). Su trabajo es simple:
//
//   1) Pedirle el devocional al mismo endpoint de siempre
//      (nuevo-palabra-del-dia-backend.vercel.app/api/devotional).
//   2) Guardarlo en Supabase Storage con la fecha REAL de Argentina,
//      para que la app tenga un "devocional de hoy" estable, sin
//      importar a qué hora esa fuente original decida rotar su
//      contenido (se detectó que lo hace a las 20:00 hora Argentina,
//      4 horas antes de la medianoche real).
//
// La app (12-devotional.js) va a leer este archivo de Supabase primero,
// y solo si no está disponible (o todavía no corrió el cron ese día),
// pide el devocional directo a la fuente original como plan B.
// --------------------------------------------------------------------

const SUPABASE_URL = 'https://ltwglqcqflakkjuuyhrg.supabase.co';
const SUPABASE_BUCKET = 'devocionales';
const SUPABASE_FILE = 'hoy.json';
const DEVOTIONAL_SOURCE_URL = 'https://nuevo-palabra-del-dia-backend.vercel.app/api/devotional';

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Protección simple: solo Vercel Cron (que manda este mismo secreto
  // automáticamente si configurás la variable CRON_SECRET) puede
  // disparar esto. Si no configuraste CRON_SECRET, no se exige nada
  // (para no romper si todavía no lo agregaste).
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers['authorization'] || '';
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'No autorizado' });
    }
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return res.status(500).json({
      error: 'Falta configurar la variable de entorno SUPABASE_SERVICE_ROLE_KEY en Vercel'
    });
  }

  try {
    // 1) Traer el devocional real (el mismo endpoint que ya usa la app)
    const response = await fetch(DEVOTIONAL_SOURCE_URL);
    if (!response.ok) {
      throw new Error(`Error HTTP al pedir el devocional: ${response.status}`);
    }

    const devotional = await response.json();
    if (!devotional || !devotional.html || !devotional.title) {
      throw new Error('El devocional recibido no tiene el formato esperado');
    }

    // 2) Armar el snapshot con la fecha REAL de Argentina
    const today = getArgentinaDateString();
    const snapshot = {
      date: today,
      title: devotional.title,
      html: devotional.html,
      updatedAt: new Date().toISOString()
    };

    // 3) Subir/sobreescribir el archivo en Supabase Storage
    //    (x-upsert: true = si ya existe, lo reemplaza en vez de fallar)
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

    console.log(`✅ Devocional del ${today} guardado en Supabase`);
    return res.status(200).json({ ok: true, date: today });

  } catch (error) {
    console.error('Error en actualizar-devocional-diario:', error);
    return res.status(500).json({
      error: 'No se pudo actualizar el devocional',
      details: error.message
    });
  }
}
