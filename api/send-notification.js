// api/send-notification.js
import admin from "../firebaseAdmin.js";
import { promises as fs } from "fs";


// Al principio de send-notification.js
async function getSWVersion() {
  try {
    // 1) URL pública de tu Service Worker en Firebase Hosting:
    const url = 'https://mision-vida-app.web.app/service-worker.js';
    // 2) Fetch remoto
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const code = await resp.text();
    // 3) Extraer la versión con regex
    const m = code.match(/const\s+SW_VERSION\s*=\s*['"]([^'"]+)['"]/);
    return m ? m[1] : 'desconocida';
  } catch (e) {
    console.warn('No pude leer service-worker.js remoto:', e);
    return 'desconocida';
  }
}



export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  let notificationData = {};

  if (req.method === "POST") {
    notificationData = req.body || {};
  } else if (req.method === "GET") {
    const { type } = req.query;
    console.log("📩 Solicitud GET recibida");
    console.log(`🔔 Tipo de notificación: ${type}`);

    if (type === "daily") {
      notificationData = {
        title: "📖 Palabra del Día",
        body:  "¡Tu devocional de hoy ya está disponible!",
        url:   "/",
        type:  "daily"
      };

    } else if (type === "verse") {
      try {
        const jsonUrl = new URL("./data/versiculos.json", import.meta.url);
        const file = await fs.readFile(jsonUrl, "utf-8");
        const list = JSON.parse(file).versiculos;
        const idx = Math.floor(Math.random() * list.length);
        const verse = list[idx];

notificationData = {
  title:       "🙏 ¡Nuevo versículo del día!",
  body:        verse.texto,
  url:         "#versiculo",
  type:        "verse",
  // El texto del versículo
  verseText:   verse.texto,
  // Clave para la referencia, coincidente con tu cliente
  referencia:  verse.referencia,
  // Y muy importante: la versión de la Biblia
  version:     verse.version  || verse.versionName  || "RVR1960"
};

      } catch (err) {
        console.error("❌ Error leyendo versiculos.json:", err);
        return res.status(500).json({ error: "Error al leer versiculos.json" });
      }

    } else if (type === "event") {
      notificationData = {
        title: "🎉 ¡Nuevo evento!",
        body:  "¡Ya está disponible el nuevo evento para ver!",
        url:   "#eventos",
        type:  "event"
      };

      
     } else if (type === "news") {
      notificationData = {
        title: "📰 Atencion, Atencion!",
        body:  `Hay nuevas noticias!`,
        url:   "#noticias",
        type:  "news"
      };


} else if (type === "update") {
  const version = await getSWVersion();

  notificationData = {
    title:   "⚙️ ¡Nueva versión disponible!",
    body:    `Se ha publicado la versión ${version}.`,
    url:     "/",
    type:    "update",
    version,
  };




     

 } else if (type === "live") {
    // ─────────── OJO AQUÍ ───────────
    // 1) Consultar a YouTube si hay live
    const YT_API_KEY = process.env.YT_API_KEY;
    const CHANNEL_ID = process.env.YT_CHANNEL_ID;
    const ytUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    ytUrl.search = new URLSearchParams({
      part:       'snippet',
      channelId:  CHANNEL_ID,
      eventType:  'live',
      type:       'video',
      key:        YT_API_KEY
    }).toString();

    let liveLink = "#live";  // fallback al ancla
    try {
      const ytRes  = await fetch(ytUrl);
      const ytData = await ytRes.json();
      if (ytRes.ok && ytData.items?.length > 0) {
        const vid = ytData.items[0].id.videoId;
        liveLink = `https://www.youtube.com/watch?v=${vid}`;
      }
    } catch (err) {
      console.error('Error al consultar YouTube:', err);
    }

    // 2) Ahora sí armar notificationData usando liveLink dinámico
    notificationData = {
      title: "🎥 ¡Estamos en vivo!",
      body:  "Únete a la transmisión del culto ahora mismo.",
      url:   liveLink,        // ← aquí va la URL real o el ancla
      type:  "live"
    };


    } else {
      return res.status(400).json({ error: "Tipo de notificación inválido" });
    }

  } else {
    return res.status(405).json({ error: "Método no permitido" });
  }

 const { title, body, type: notifType } = notificationData;

// Mapeo de tipo → topic
const topicMap = {
  daily: "daily",
  verse: "verse",
  event: "event",
  live:  "live",
  news:  "news",
  update: "updates"    // <— agregamos aquí
};
const topic = topicMap[notifType];
if (!topic) {
  return res.status(400).json({ error: `Tipo no válido para topic: ${notifType}` });
}

// Armado del dataPayload (incluimos aquí también icon y demás)
const dataPayload = {
  title:     String(title),
  body:      String(body),
  icon:      "https://mision-vida-app.web.app/icon.png",
  url:       String(notificationData.url || "/"),
  type:      String(notificationData.type || "unknown"),
  timestamp: Date.now().toString()
};
if (notificationData.verseText) {
  dataPayload.verseText = String(notificationData.verseText);
}
if (notificationData.verseReference) {
  dataPayload.verseReference = String(notificationData.verseReference);
}

try {
  const message = {
    topic,
    data: dataPayload
};



  console.log(`🚀 Enviando notificación a topic "${topic}" vía HTTP v1…`);
  const response = await admin.messaging().send(message);
  console.log(`✅ Notificación enviada correctamente:`, response);

  return res.status(200).json({ ok: true, topic, response });

} catch (err) {
  console.error("❌ Error enviando al topic:", err);
  return res.status(500).json({ error: err.message });
}
};
