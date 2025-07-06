// api/send-notification.js

import admin from "../firebaseAdmin.js";
import { promises as fs } from "fs";            // ← para leer versículos
const db = admin.firestore();

// Función para obtener versión de SW
async function getSWVersion() {
  try {
    const url  = 'https://mision-vida-app.web.app/service-worker.js';
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const code = await resp.text();
    const m    = code.match(/const\s+SW_VERSION\s*=\s*['"]([^'"]+)['"]/);
    return m ? m[1] : 'desconocida';
  } catch {
    return 'desconocida';
  }
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "GET") 
    return res.status(405).json({ error: "Método no permitido" });

  const { type } = req.query;
  let notificationData;

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
      // Versículo diario usa fs
      try {
        const file = await fs.readFile(new URL("./data/versiculos.json", import.meta.url), "utf-8");
        const list = JSON.parse(file).versiculos;
        const verse = list[Math.floor(Math.random() * list.length)];
        notificationData = {
          title:          "🙏 ¡Nuevo versículo del día!",
          body:           verse.texto,
          url:            "#versiculo",
          type:           "verse",
          verseText:      verse.texto,
          verseReference: verse.referencia,
          version:        verse.version || "RVR1960"
        };
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "No pude leer versículos" });
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
        title: "📰 ¡Hay noticias nuevas!",
        body:  "Visita la sección de noticias para más información.",
        url:   "#noticias",
        type:  "news"
      };
      break;

    case "update": {
      // update ya no usa fs, usa getSWVersion
      const version = await getSWVersion();
      notificationData = {
        title:   "⚙️ ¡Nueva versión disponible!",
        body:    `Se ha publicado la versión ${version}.`,
        url:     "/",
        type:    "update",
        version
      };
      break;
    }

    case "live": {
      const YT_API_KEY = process.env.YOUTUBE_API_KEY;
      const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
      let liveLink     = "#live";
      try {
        const ytRes  = await fetch(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CHANNEL_ID}&eventType=live&type=video&key=${YT_API_KEY}`
        );
        const ytData = await ytRes.json();
        if (ytData.items?.length) {
          liveLink = `https://www.youtube.com/watch?v=${ytData.items[0].id.videoId}`;
        }
      } catch (e) {
        console.warn(e);
      }
      notificationData = {
        title: "🎥 ¡Estamos en vivo!",
        body:  "Únete a la transmisión del culto ahora mismo.",
        url:   liveLink,
        type:  "live"
      };
      break;
    }

    case "Contacto":
      notificationData = {
        title: "📩 Nuevo mensaje de contacto",
        body:  "Tienes un nuevo mensaje desde la web.",
        url:   "#contacto",
        type:  "Contacto"
      };
      break;

    case "Oracion":
      notificationData = {
        title: "📬 Nuevo Pedido de Oración",
        body:  "Tienes un nuevo pedido de oración.",
        url:   "#oracion",
        type:  "Oracion"
      };
      break;

    default:
      return res.status(400).json({ error: "Tipo de notificación inválido" });
  }

  // Mapear topic (si necesitas usar topic)
  const topicMap = {
    daily:   "daily",
    verse:   "verse",
    event:   "event",
    live:    "live",
    news:    "news",
    update:  "updates",
    Contacto: "Contacto",
    Oracion: "Oracion"
  };
  const topic = topicMap[notificationData.type];
  if (!topic) return res.status(400).json({ error: "Topic no configurado" });

  // Obtener tokens de admins
  try {
    const adminsSnap = await db
      .collection("users")
      .where("role", "==", "admin")
      .get();

    let tokens = [];
    adminsSnap.forEach(doc => {
      const u = doc.data();
      if (Array.isArray(u.tokens)) tokens.push(...u.tokens);
    });
    tokens = [...new Set(tokens)];
    console.log("Tokens admin a enviar:", tokens);

    if (!tokens.length)
      return res.status(200).json({ message: "No hay tokens de admin." });

    // Enviar en lotes de 500
    const BATCH_SIZE = 500;
    let allResults = [];

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const chunk = tokens.slice(i, i + BATCH_SIZE);
      console.log(`Enviando lote ${i/BATCH_SIZE + 1} (${chunk.length} tokens)…`);
      const resp = await admin.messaging().sendToDevice(chunk, {
        notification: {
          title: notificationData.title,
          body:  notificationData.body
        },
        data: {
          url:      notificationData.url,
          type:     notificationData.type,
          timestamp: Date.now().toString(),
          ...(notificationData.verseText    && { verseText: notificationData.verseText }),
          ...(notificationData.verseReference && { verseReference: notificationData.verseReference })
        }
      });
      allResults = allResults.concat(resp.results);
    }

    return res.status(200).json({
      ok:          true,
      totalTokens: tokens.length,
      batches:     Math.ceil(tokens.length / BATCH_SIZE),
      results:     allResults
    });

  } catch (err) {
    console.error("❌ Error enviando notificación a admins:", err);
    return res.status(500).json({ error: err.message });
  }
}
