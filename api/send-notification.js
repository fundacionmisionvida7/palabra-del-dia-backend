// api/send-notification.js
import admin from "../firebaseAdmin.js";

export default async function handler(req, res) {
  // ==================== CORS ====================
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

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

  // ==================== Preparar payload de notificación ====================
  let notificationData = {};

  if (req.method === "POST") {
    // Soporta cuerpo JSON para pruebas
    console.log("📩 Solicitud POST recibida");
    notificationData = req.body || {};
  } else if (req.method === "GET") {
    console.log("📩 Solicitud GET recibida");
    const { type } = req.query;
    console.log(`🔔 Tipo de notificación: ${type}`);

    if (type === "daily") {
      notificationData = {
        title: "📖 Palabra del Día",
        body: "¡Tu devocional de hoy ya está disponible!",
        url: "/"
      };
    } else if (type === "verse") {
      notificationData = {
        title: "¡Nuevo versículo del día!",
        body: "No te lo pierdas, ya está disponible",
        url: "/versiculo"
      };
    } else if (type === "event") {
      notificationData = {
        title: "¡Nuevo evento!",
        body: "¡Ya está disponible el nuevo evento para ver!",
        url: "/eventos/EventosNuevos"
      };
    } else if (type === "test") {
      notificationData = {
        title: "🧪 Notificación de prueba",
        body: `Esta es una notificación de prueba (${new Date().toLocaleString()})`,
        url: "/"
      };
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
    // ==================== 1) Web-Push (pushSubscriptions) ====================
    const webSubsSnap = await admin.firestore().collection("pushSubscriptions").get();
    if (!webSubsSnap.empty) {
      const webPush = (await import('web-push')).default;
      webPush.setVapidDetails(
        'mailto:contacto@misionvida.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
      const payload = JSON.stringify({ title, body, icon: '/icon-192x192.png', url });
      await Promise.all(webSubsSnap.docs.map(doc => {
        const sub = { endpoint: doc.id, keys: doc.data().keys };
        return webPush.sendNotification(sub, payload)
          .then(() => console.log(`✅ Web push enviado a ${doc.id}`))
          .catch(err => console.error(`❌ Error web-push (${doc.id}):`, err.message));
      }));
    }

    // ==================== 2) FCM (fcmTokens) ====================
    const fcmSnap = await admin.firestore().collection("fcmTokens").get();
    const tokens = fcmSnap.docs.map(d => d.id).filter(t => t && t.length > 10);
    if (tokens.length === 0) {
      return res.status(200).json({ ok: false, message: "No hay tokens FCM registrados" });
    }

    // Dividir en grupos de 500
    const chunkSize = 500;
    const tokenChunks = [];
    for (let i = 0; i < tokens.length; i += chunkSize) {
      tokenChunks.push(tokens.slice(i, i + chunkSize));
    }

    let successCount = 0;
    let failureCount = 0;

    for (const chunk of tokenChunks) {
      const response = await admin.messaging().sendAll({
        tokens: chunk,
        notification: { title, body },
        data: { url, title, body }
      });

      successCount += response.successCount;
      failureCount += response.failureCount;

      response.responses.forEach((resp, idx) => {
        if (resp.error) {
          console.error(`❌ FCM error token ${chunk[idx].slice(0,8)}...:`, resp.error.message);
          // Eliminar token inválido
          const code = resp.error.code;
          if ([
            'messaging/invalid-registration-token',
            'messaging/registration-token-not-registered'
          ].includes(code)) {
            admin.firestore().collection("fcmTokens").doc(chunk[idx]).delete()
              .then(() => console.log(`🗑️ Token inválido eliminado: ${chunk[idx]}`))
              .catch(e => console.error("❌ Error eliminando token inválido:", e));
          }
        }
      });
    }

    console.log(`✅ Notificación procesada: ${successCount} éxitos, ${failureCount} fallos`);
    return res.status(200).json({ ok: true, successCount, failureCount, total: tokens.length });

  } catch (error) {
    console.error("❌ Error general al procesar notificaciones:", error);
    return res.status(500).json({ error: "Error interno al procesar notificaciones", details: error.message });
  }
}
