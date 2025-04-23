// api/send-notification.js
import admin from "../firebaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { title, body } = req.body || {};
  if (!title || !body) {
    return res.status(400).json({ error: "Faltan campos title o body" });
  }

  try {
    const snapshot = await admin.firestore().collection("fcmTokens").get();
    const tokens = snapshot.docs.map(d => d.id);

    if (tokens.length === 0) {
      return res.status(200).json({ ok: false, message: "No hay tokens registrados" });
    }

    const response = await admin.messaging().sendMulticast({
      notification: { title, body },
      tokens
    });

    res.status(200).json({
      ok: true,
      successCount: response.successCount,
      failureCount: response.failureCount
    });
  } catch (error) {
    console.error("Error al enviar notificación:", error);
    res.status(500).json({ error: "Error en el servidor", details: error.message });
  }
      }
