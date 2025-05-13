// api/send-notification.js
import admin from "../firebaseAdmin.js";
import { promises as fs } from "fs";

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
          title:          "🙏 ¡Nuevo versículo del día!",
          body:           verse.texto,
          url:            "#versiculo",
          type:           "verse",
          verseText:      verse.texto,
          verseReference: verse.referencia
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

    } else if (type === "live") {
      notificationData = {
        title: "🎥 ¡Estamos en vivo!",
        body:  "Únete a la transmisión del culto ahora mismo.",
        url:   "#live",
        type:  "live"
      };

    } else if (type === "test") {
      notificationData = {
        title: "🧪 Notificación de prueba",
        body:  `Esta es una notificación de prueba (${new Date().toLocaleString()})`,
        url:   "/",
        type:  "test"
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
  test:  "test"
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
