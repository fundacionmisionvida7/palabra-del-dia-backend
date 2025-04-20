// api/send-notification.js
import admin from "../firebaseAdmin.js";

export default async function handler(req, res) {
  const { title, body } = req.body;
  if (!title || !body) return res.status(400).json({ error: "Faltan title/body" });

  // 1) Recupera todos los tokens
  const snapshot = await admin.firestore().collection("fcmTokens").get();
  const tokens = snapshot.docs.map(d => d.id);

  if (tokens.length === 0) {
    return res.json({ ok: false, message: "No hay tokens registrados" });
  }

  // 2) Envía en lote
  const response = await admin.messaging().sendMulticast({
    notification: { title, body },
    tokens
  });

  res.json({ ok: true, successCount: response.successCount, failureCount: response.failureCount });
}
