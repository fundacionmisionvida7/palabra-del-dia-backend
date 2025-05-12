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

  // ——————————————————————————————————
  //  Envío por Topic Messaging en un solo llamado
  // ——————————————————————————————————
  

   try {
    // 1) Mapea type → topic
    const topicMap = {
      daily: "daily",
      verse: "verse",
      event: "event",
      live:  "live",
      test:  "test"
    };
    const topic = topicMap[notificationData.type];
    if (!topic) {
      return res
        .status(400)
        .json({ error: `Tipo no válido para topic: ${notificationData.type}` });
    }

    // 2) Construye payload sólo con 'notification' y 'data'
    const payload = {
      notification: {
        title,
        body
      },
      data: {
        url:       dataPayload.url,
        type:      dataPayload.type,
        timestamp: dataPayload.timestamp,
        ...(dataPayload.verseText      && { verseText: dataPayload.verseText }),
        ...(dataPayload.verseReference && { verseReference: dataPayload.verseReference })
      }
    };

    console.log(`🚀 Enviando notificación al topic "${topic}"…`);
    // 3) Envío correcto a topic
    const response = await admin.messaging().sendToTopic(topic, payload);
    console.log(`✅ Notificación enviada al topic "${topic}"`, response);

    // 4) Respuesta al cliente
    return res.status(200).json({
      ok:       true,
      topic,
      response
    });

  } catch (err) {
    console.error("❌ Error enviando al topic:", err);
    return res.status(500).json({ error: err.message });
  }


};
