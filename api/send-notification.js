// api/send-notification.js
const admin = require("../firebaseAdmin");

async function handler(req, res) {
  // Permitir CORS en todas las solicitudes
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Manejar preflight
  if (req.method === "OPTIONS") return res.status(200).end();

  // Solo permitir POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { title, body, url } = req.body || {};

  if (!title || !body) {
    return res.status(400).json({ error: "Faltan campos: title y body son obligatorios" });
  }

  try {
    const snapshot = await admin.firestore().collection("fcmTokens").get();
    const tokens = snapshot.docs.map(doc => doc.id);

    if (tokens.length === 0) {
      return res.status(200).json({ ok: false, message: "No hay tokens registrados" });
    }

    const message = {
      notification: { title, body },
      data: url ? { url } : {},
      tokens
    };

    const response = await admin.messaging().sendMulticast(message);

    res.status(200).json({
      ok: true,
      successCount: response.successCount,
      failureCount: response.failureCount
    });

  } catch (error) {
    console.error("❌ Error al enviar notificación:", error);
    res.status(500).json({ error: "Error interno", details: error.message });
  }
}

module.exports = handler;
