// api/send-notification.js
import admin from "../firebaseAdmin.js";
import { promises as fs } from "fs";
import { getFirestore } from "firebase-admin/firestore";

// Obtener versión del Service Worker remoto
async function getSWVersion() {
  try {
    const url = 'https://mision-vida-app.web.app/service-worker.js';
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const code = await resp.text();
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

  // Inicializar Firestore
  const db = getFirestore();

  let notificationData = {};

  if (req.method === "POST") {
    notificationData = req.body || {};

  } else if (req.method === "GET") {
    const { type } = req.query;
    console.log("📩 Solicitud GET recibida");
    console.log(`🔔 Tipo de notificación: ${type}`);

    switch (type) {
      case "daily":
        notificationData = {
          title: "📖 Palabra del Día",
          body:  "¡Tu devocional de hoy ya está disponible!",
          url:   "/",
          type:  "daily"
        };
        break;

      case "verse": {
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
            verseText:   verse.texto,
            verseReference: verse.referencia,
            version:     verse.version || verse.versionName || "RVR1960"
          };
        } catch (err) {
          console.error("❌ Error leyendo versiculos.json:", err);
          return res.status(500).json({ error: "Error al leer versiculos.json" });
        }
        break;
      }

      case "event":
        notificationData = {
          title: "🎉 ¡Nuevo evento!",
          body:  "¡Ya está disponible el nuevo evento para ver!",
          url:   "#eventos",
          type:  "event"
        };
        break;

      case "news":
        notificationData = {
          title: "📰 ¡Atención, atención!",
          body:  "¡Hay nuevas noticias!",
          url:   "#noticias",
          type:  "news"
        };
        break;

      case "update": {
        const version = await getSWVersion();
        notificationData = {
          title:   "⚙️ ¡Nueva versión disponible!",
          body:    `Se ha publicado la versión ${version}.`,
          url:     "/",
          type:    "update",
          version,
        };
        break;
      }

      case "live": {
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

        let liveLink = "#live";
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

        notificationData = {
          title: "🎥 ¡Estamos en vivo!",
          body:  "Únete a la transmisión del culto ahora mismo.",
          url:   liveLink,
          type:  "live"
        };
        break;
      }

      case "Culto":
        notificationData = {
          title: "🏚️ ¡Hoy hay culto!",
          body:  "¡Hoy nos vemos en casa, te esperamos!",
          url:   "#Culto",
          type:  "Culto"
        };
        break;

      case "CultoEspecial":
        notificationData = {
          title: "⛪ ¡Hoy hay culto especial!",
          body:  "¡Hoy tenemos reunión especial, te esperamos!",
          url:   "#CultoEspecial",
          type:  "CultoEspecial"
        };
        break;

      case "Contacto":
        notificationData = {
          title: "📬 Nueva solicitud de contacto",
          body:  "Un usuario ha completado el formulario de contacto.",
          url:   "misionvida://Mensajes",
          type:  "Contacto"
        };
        break;

      case "Oracion":
        notificationData = {
          title: "🙏 Nueva petición de oración",
          body:  "Un usuario ha enviado una petición de oración.",
          url:   "misionvida://Pedidos",
          type:  "Oracion"
        };
        break;

      default:
        return res.status(400).json({ error: `Tipo de notificación inválido: ${type}` });
    }

  } else {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { title, body, type: notifType } = notificationData;

  // Mapeo de tipo → topic (solo para los que siguen topics)
  const topicMap = {
    daily:           "daily",
    verse:           "verse",
    event:           "event",
    live:            "live",
    news:            "news",
    update:          "updates",
    Culto:           "Culto",
    CultoEspecial:   "CultoEspecial"
  };

  // Si es Contacto u Oración, envío directo a admins
  if (["Contacto", "Oracion"].includes(notifType)) {
    const adminsSnap = await db.collection('users')
      .where('role', '==', 'admin')
      .get();

    const tokens = [];
    adminsSnap.forEach(doc => {
      const userTokens = doc.data().tokens || [];
      tokens.push(...userTokens);
    });

    if (tokens.length === 0) {
      return res.status(200).json({ ok: false, message: 'No hay admins suscritos a notificaciones' });
    }

    const dataPayload = {
      title,
      body,
      icon:      "https://mision-vida-app.web.app/icon.png",
      url:       notificationData.url || "/",
      type:      notifType,
      timestamp: Date.now().toString(),
      ...(notificationData.verseText    && { verseText: notificationData.verseText }),
      ...(notificationData.verseReference && { verseReference: notificationData.verseReference })
    };

    try {
      console.log(`🚀 Enviando "${notifType}" a ${tokens.length} admins…`);
      const batchResponse = await admin.messaging().sendEachForMulticast({ tokens, data: dataPayload });
      return res.status(200).json({ ok: true, type: notifType, response: batchResponse });
    } catch (err) {
      console.error(`❌ Error enviando a admins:`, err);
      return res.status(500).json({ error: err.message });
    }
  }

  // Resto: enví­o por topic
  const topic = topicMap[notifType];
  if (!topic) {
    return res.status(400).json({ error: `Tipo no válido para topic: ${notifType}` });
  }

  const dataPayload = {
    title,
    body,
    icon:      "https://mision-vida-app.web.app/icon.png",
    url:       notificationData.url || "/",
    type:      notifType,
    timestamp: Date.now().toString(),
    ...(notificationData.verseText    && { verseText: notificationData.verseText }),
    ...(notificationData.verseReference && { verseReference: notificationData.verseReference })
  };

  try {
    console.log(`🚀 Enviando a topic "${topic}"…`);
    const response = await admin.messaging().send({ topic, data: dataPayload });
    return res.status(200).json({ ok: true, topic, response });
  } catch (err) {
    console.error(`❌ Error enviando al topic:`, err);
    return res.status(500).json({ error: err.message });
  }
};
