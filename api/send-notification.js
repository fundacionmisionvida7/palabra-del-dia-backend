// api/send-notification.js

import admin from "../firebaseAdmin.js";
// import fs from "fs/promises"; // para leer tu JSON localmente
import { promises as fs } from "fs"; // para leer tu JSON localmente



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
    notificationData = req.body || {};

  } else if (req.method === "GET") {
    // ─────────── IMPORTANTE ───────────
    // Aquí extrajimos `type` de los query params
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
      // Lectura JSON desde api/data/versiculos.json
      let list;
      try {
        const jsonUrl = new URL("./data/versiculos.json", import.meta.url);
        const file    = await fs.readFile(jsonUrl, "utf-8");
        list = JSON.parse(file).versiculos;
      } catch (err) {
        console.error("❌ No pude leer api/data/versiculos.json:", err);
        return res.status(500).json({ error: "Error al leer versiculos.json" });
      }
      const idx   = Math.floor(Math.random() * list.length);
      const verse = list[idx];

      notificationData = {
        title:          "🙏 ¡Nuevo versículo del día!",
        body:           verse.texto,
        url:            "#versiculo",
        type:           "verse",
        verseText:      verse.texto,
        verseReference: verse.referencia
      };

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
      return res.status(400).json({
        error: "Tipo de notificación no válido. Usa 'daily', 'verse', 'event', 'live' o 'test'"
      });
    }

  } else {
    return res.status(405).json({ error: "Método no permitido" });
  }


// Después de haber calculado notificationData:
  const { title, body, url, type: notifType } = notificationData;

// —— AÑADE AQUÍ ——
// Construimos dataPayload SÓLO con strings:
  const dataPayload = {
    url:       String(url),
    type:      String(notifType),
    timestamp: Date.now().toString()
  };
  if (notificationData.verseText) {
    dataPayload.verseText = String(notificationData.verseText);
    dataPayload.verseReference = String(notificationData.verseReference);
  }


// —— FIN DEL BLOQUE ——

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

const messages = tokens.map(token => ({
  token,
  // 1) sólo data, incluyendo title/body si quieres
  data: {
    title,
    body,
    ...dataPayload
  },
  // 2) configuración Android custom
  android: {
    notification: {
      icon: 'ic_notification',
      color: '#F57C00',
      sound: 'default'
    }
  },
  // 3) configuración iOS custom
  apns: {
    payload: {
      aps: {
        alert: { title, body },
        sound: 'default',
        category: 'YOUR_CATEGORY'
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
