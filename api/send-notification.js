// api/send-notification.js

import admin from "../firebaseAdmin.js";

export default async function handler(req, res) {
  // Permitir CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight
  if (req.method === "OPTIONS") return res.status(200).end();

  console.error("🔄 Procesando solicitud de notificación...");

  // Verificar que Firebase Admin esté disponible
  if (!admin.apps.length) {
    console.error("❌ Firebase Admin no está inicializado");
    return res.status(500).json({ 
      error: "Error de configuración: Firebase Admin no está inicializado" 
    });
  }

  // Verificar acceso a Firestore
  try {
    const db = admin.firestore();
    await db.collection("test").doc("test").set({ test: true });
    await db.collection("test").doc("test").delete();
    console.log("✅ Conexión a Firestore verificada");
  } catch (error) {
    console.error("❌ Error al acceder a Firestore:", error);
    return res.status(500).json({ 
      error: "Error de conexión con Firestore",
      details: error.message 
    });
  }

  // Manejar tanto POST como GET
  let notificationData = {};
  
  if (req.method === "POST") {
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
        url: "/" // Ruta específica
      };
    } else if (type === "verse") {
      notificationData = {
        title: "🙏 ¡Nuevo versículo del día!",
        body: "No te lo pierdas, ya está disponible",
        url: "#versiculo",    // Cambiado a hash
        type: "verse"         // ← incluimos el type aquí
      };
    } else if (type === "event") {
        notificationData = {
            title: "¡Nuevo evento!",
            body: "¡Ya está disponible el nuevo evento para ver!",
            url: "#eventos",      // ← coma añadida
            type: "event"         // ← type ahora va bien      
      };
    } else if (type === "live") {
        notificationData = {
            title: "🎥¡Estamos en vivo!",
            body: "Únete a la transmisión del culto ahora mismo.",
            url: "#live",         // ← coma añadida
            type: "live"          // ← type correcto
      };
    } else if (type === "test") {  // <<< Llave correctamente cerrada
      notificationData = {
        title: "🧪 Notificación de prueba",
        body: "Esta es una notificación de prueba (" + new Date().toLocaleString() + ")",
        url: "/"
      };
    } else {
      return res.status(400).json({ 
        error: "Tipo de notificación no válido. Use 'daily', 'verse', 'event' o 'test'" 
      });
    }
  } else {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { title, body, url } = notificationData;

  // Validar campos
  if (!title || !body) {
    return res.status(400).json({ 
      error: "Faltan campos: title y body son obligatorios" 
    });
  }

  try {
    console.log("🔍 Buscando tokens de dispositivo...");
    // ---- 🧹 NUEVO CÓDIGO ----
// Limpiar tokens expirados
console.log("🧹 Eliminando tokens caducados...");
const expiredTokens = await admin.firestore().collection("fcmTokens")
  .where("expiresAt", "<", new Date())
  .get();

const batch = admin.firestore().batch();
expiredTokens.docs.forEach(doc => batch.delete(doc.ref));
await batch.commit();
console.log(`🗑️ Eliminados ${expiredTokens.size} tokens expirados`);
// ---- FIN DEL NUEVO CÓDIGO ----

    
    // Obtener tokens FCM de la colección fcmTokens
// ✅ Código corregido:
const tokensSet = new Set();

// Solo de fcmTokens
const fcmTokensSnapshot = await admin.firestore().collection("fcmTokens").get();
fcmTokensSnapshot.forEach(doc => {
  const data = doc.data();
  if (data.token) tokensSet.add(data.token);
});
       


const tokens = Array.from(tokensSet).filter(t =>  // Línea 9
  typeof t === 'string' &&  // Línea 10
  t.length > 10 &&  // Línea 11
  !t.includes(' ') // Línea 12
); // Línea 13
       
       
       console.log(`📱 Tokens FCM válidos: ${tokens.length}`);
   
       if (tokens.length === 0) {
         return res.status(200).json({ 
           ok: false, 
           message: "No hay tokens FCM registrados" 
         });
       }
   
       // 🚀 Enviar notificaciones en lotes
       console.log("🚀 Enviando notificaciones en lotes...");

try {
  // Crear mensajes
  const messages = tokens.map(token => ({
    token,
    notification: { title, body },
    data: {
      url: url || "#",
      type: notificationData.type || 'general',
      timestamp: Date.now().toString()
    },
    android: { 
      notification: { 
        icon: 'ic_notification', 
        color: '#F57C00', 
        sound: 'default' 
      } 
    },
    apns: { 
      headers: { 'apns-priority': '10' }, 
      payload: { 
        aps: { 
          sound: 'default',
          category: 'DEVOTIONAL'
        } 
      } 
    }
  }));

  // Dividir en lotes de 500
  const chunks = [];
  while (messages.length > 0) {
    chunks.push(messages.splice(0, 500));
  }

  let successCount = 0;
  let failureCount = 0;

  // Procesar cada lote
  for (const chunk of chunks) {
    try {
      const response = await admin.messaging().sendEach(chunk);
      successCount += response.successCount;
      failureCount += response.failureCount;

      // Eliminar tokens fallidos
      const deadTokens = response.responses
        .filter((r, idx) => !r.success)
        .map((r, idx) => chunk[idx].token);

      const batch = admin.firestore().batch();
      deadTokens.forEach(token => {
        batch.delete(admin.firestore().collection("fcmTokens").doc(token));
      });
      await batch.commit();

    } catch (error) {
      failureCount += chunk.length;
      console.error("❌ Error en lote:", error);
    }
  }

  console.log(`✅ Notificación "${title}" procesada: ${successCount} éxitos, ${failureCount} fallos`);

  // Respuesta exitosa
  return res.status(200).json({
    ok: true,
    successCount,
    failureCount,
    total: tokens.length
  });

} catch (error) {
  console.error("❌ Error crítico:", error);
  return res.status(500).json({ 
    error: "Error interno del servidor",
    details: error.message 
  });
}
   

   
     } catch (error) {
       console.error("❌ Error general al procesar notificaciones:", error);
       return res.status(500).json({ 
         error: "Error interno al procesar notificaciones", 
         details: error.message,
         stack: error.stack
       });
     }
   }
