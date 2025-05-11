// api/subscribe-topic.js
import admin from "../firebaseAdmin.js";

export default async function handler(req, res) {
  // CORS si lo necesitas…
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }
  const { token, topic } = req.body || {};
  if (!token || !topic) {
    return res.status(400).json({ error: "Faltan token o topic" });
  }
  try {
    const response = await admin.messaging().subscribeToTopic(token, topic);
    console.log(`✅ Token suscrito a topic "${topic}"`, response);
    return res.status(200).json({ ok: true, response });
  } catch (err) {
    console.error("❌ Error suscribiendo al topic:", err);
    return res.status(500).json({ error: err.message });
  }
}
