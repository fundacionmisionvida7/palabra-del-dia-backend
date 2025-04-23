// api/send-notification.js
import admin from "../firebaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { title, body, url = "/#palabra-del-dia" } = req.body;
  if (!title || !body) {
    return res.status(400).json({ error: "Faltan title y/o body" });
  }

  try {
    const usersSnap = await admin.firestore().collection("users").get();
    const tokens = usersSnap.docs.flatMap(doc => doc.data().tokens || []);

    if (tokens.length === 0) {
      return res.json({ ok: false, message: "No hay tokens registrados" });
    }

    // Enviar notificación a todos los tokens
    const response = await admin.messaging().sendMulticast({
      notification: { title, body },
      data: { url }, // esto permite redirección desde el SW
      tokens
    });

    // Limpieza de tokens fallidos
    const failedTokens = [];
    response.responses.forEach((r, idx) => {
      if (!r.success) failedTokens.push(tokens[idx]);
    });

    if (failedTokens.length > 0) {
      const batch = admin.firestore().batch();
      for (const doc of usersSnap.docs) {
        const userTokens = doc.data().tokens || [];
        const toRemove = userTokens.filter(t => failedTokens.includes(t));
        if (toRemove.length > 0) {
          batch.update(doc.ref, {
            tokens: admin.firestore.FieldValue.arrayRemove(...toRemove)
          });
        }
      }
      await batch.commit();
    }

    return res.json({
      ok: true,
      sent: response.successCount,
      failed: response.failureCount,
      cleanedTokens: failedTokens.length
    });
  } catch (error) {
    console.error("❌ Error enviando notificación:", error);
    return res.status(500).json({ error: "Fallo interno", details: error.message });
  }
          }
