// api/send-notification.js
import admin from "../firebaseAdmin.js";
import { promises as fs } from "fs";

export default async function handler(req, res) {
  // CORS…
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Sólo GET en este endpoint
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { type } = req.query;
  if (!["daily","verse","event","live","test"].includes(type)) {
    return res.status(400).json({ error: "Tipo no válido" });
  }

  // 1) Prepara el notificationData según type
  let notificationData = {};
  if (type === "daily") {
    notificationData = {
      title: "📖 Palabra del Día",
      body:  "¡Tu devocional de hoy ya está disponible!",
      url:   "/#daily"
    };
  } else if (type === "verse") {
    // lee tu JSON de versículos
    const file   = await fs.readFile(new URL("../data/versiculos.json", import.meta.url), "utf-8");
    const { versiculos } = JSON.parse(file);
    const v      = versiculos[Math.floor(Math.random() * versiculos.length)];
    notificationData = {
      title:          "🙏 ¡Nuevo versículo del día!",
      body:           v.texto,
      url:            "/#versiculo",
      verseText:      v.texto,
      verseReference: v.referencia
    };
  } else if (type === "event") {
    notificationData = {
      title: "🎉 ¡Nuevo evento!",
      body:  "¡No te pierdas nuestro próximo evento!",
      url:   "/#eventos"
    };
  } else if (type === "live") {
    notificationData = {
      title: "🎥 ¡Estamos en vivo!",
      body:  "Únete ahora a nuestra transmisión.",
      url:   "/#live"
    };
  } else {  // test
    notificationData = {
      title: "🧪 Notificación de prueba",
      body:  `Prueba de notificación (${new Date().toLocaleString()})`,
      url:   "/"
    };
  }

  // 2) Construir el payload FCM
  const { title, body, url, verseText, verseReference } = notificationData;
  const dataPayload = {
    action: type,
    url,
    timestamp: Date.now().toString()
  };
  if (verseText)      dataPayload.verseText      = verseText;
  if (verseReference) dataPayload.verseReference = verseReference;

// … ya tienes title, body, dataPayload …
const payload = {
  notification: { title, body },
  data:         dataPayload
};

try {
  // Enviar al topic dinámico
  const resp = await admin.messaging().sendToTopic(type, payload);
  console.log(`✅ Notificación tipo="${type}" enviada al topic "${type}"`, resp);
  return res.status(200).json({ ok: true, resp });
} catch (err) {
  console.error("❌ Error enviando a topic:", err);
  return res.status(500).json({ error: err.message });
}

}
