// api/send-notification.js
import admin from "../firebaseAdmin.js";

export default async function handler(req, res) {
  // ==================== CORS ====================
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight
  if (req.method === "OPTIONS") return res.status(200).end();

  console.log("🔄 Procesando solicitud de notificación...");

  // ==================== Inicializar Firebase Admin ====================
  if (!admin.apps.length) {
    console.error("❌ Firebase Admin no está inicializado");
    return res.status(500).json({ error: "Error de configuración: Firebase Admin no está inicializado" });
  }

  // ==================== Verificar conexión a Firestore ====================
  try {
    const db = admin.firestore();
    await db.collection("healthcheck").doc("ping").set({ time: Date.now() });
    await db.collection("healthcheck").doc("ping").delete();
    console.log("✅ Conexión a Firestore verificada");
  } catch (err) {
    console.error("❌ Error al acceder a Firestore:", err);
    return res.status(500).json({ error: "Error de conexión con Firestore", details: err.message });
  }

  // ==================== Preparar datos de notificación ====================
  let notificationData = {};
  if (req.method === "POST") {
    console.log("📩 Solicitud POST recibida");
    notificationData = req.body || {};
  } else if (req.method === "GET") {
    console.log("📩 Solicitud GET recibida");
    const { type } = req.query;
    console.log(`🔔 Tipo de notificación: ${type}`);
    if (type === "daily") {
      notificationData = { title: "📖 Palabra del Día", body: "¡Tu devocional de hoy ya está disponible!", url: "/" };
    } else if (type === "verse") {
      notificationData = { title: "¡Nuevo versículo del día!", body: "No te lo pierdas, ya está disponible", url: "/versiculo" };
    } else if (type === "event") {
      notificationData = { title: "¡Nuevo evento!", body: "¡Ya está disponible el nuevo evento para ver!", url: "/eventos" };
    } else if (type === "test") {
      notificationData = { title: "🧪 Notificación de prueba", body: `Esta es una notificación de prueba (${new Date().toLocaleString()})`, url: "/" };
    } else {
      return res.status(400).json({ error: "Tipo de notificación no válido. Use 'daily', 'verse', 'event' o 'test'" });
    }
  } else {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { title, body, url } = notificationData;
  if (!title || !body) {
    return res.status(400).json({ error: "Faltan campos: title y body son obligatorios" });
  }

  try {
    // ==================== 1) Envío via FCM (fcmTokens) ====================
    const tokensSnap = await admin.firestore().collection("fcmTokens").get();
    let tokens = tokensSnap.docs.map(doc => doc.id).filter(token => typeof token === 'string' && token.includes(':'));

    // Si hay pocos tokens, buscar también en users
    if (tokens.length < 5) {
      const usersSnap = await admin.firestore().collection("users").get();
      usersSnap.forEach(doc => {
        const data = doc.data();
        if (Array.isArray(data.tokens)) {
          data.tokens.forEach(t => { if (t.includes(':')) tokens.push(t); });
        }
        if (data.fcmToken && typeof data.fcmToken === 'string' && data.fcmToken.includes(':')) {
          tokens.push(data.fcmToken);
        }
      });
    }

    // Dedupe tokens
    tokens = [...new Set(tokens)];

    if (tokens.length === 0) {
      return res.status(200).json({ ok: false, message: "No hay tokens FCM registrados" });
    }

    // Enviar en lotes de hasta 500
    const chunkSize = 500;
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < tokens.length; i += chunkSize) {
      const chunk = tokens.slice(i, i + chunkSize);
      const response = await admin.messaging().sendMulticast({
        tokens: chunk,
        notification: { title, body },
        data: { url, title, body }
      });

      successCount += response.successCount;
      failureCount += response.failureCount;

      // Eliminar tokens inválidos
      response.responses.forEach((resp, idx) => {
        if (resp.error) {
          const code = resp.error.code;
          if ([
            'messaging/invalid-registration-token',
            'messaging/registration-token-not-registered'
          ].includes(code)) {
            const badToken = chunk[idx];
            admin.firestore().collection("fcmTokens").doc(badToken).delete()
              .then(() => console.log(`🗑️ Token inválido eliminado: ${badToken}`))
              .catch(e => console.error("❌ Error eliminando token inválido:", e));
          }
        }
      });
    }

    console.log(`✅ Notificación procesada FCM: ${successCount} éxitos, ${failureCount} fallos, total ${tokens.length}`);
    return res.status(200).json({ ok: true, successCount, failureCount, total: tokens.length });

  } catch (error) {
    console.error("❌ Error general al procesar notificaciones:", error);
    return res.status(500).json({ error: "Error interno al procesar notificaciones", details: error.message });
  }
}
