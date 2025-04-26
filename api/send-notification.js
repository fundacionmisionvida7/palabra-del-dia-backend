// api/send-notification.js (versión mejorada)
import admin from "../firebaseAdmin.js";

export default async function handler(req, res) {
  // Permitir CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight
  if (req.method === "OPTIONS") return res.status(200).end();

  // Manejar tanto POST como GET
  let notificationData = {};
  
  if (req.method === "POST") {
    // Si es POST, usar los datos del body
    notificationData = req.body || {};
  } else if (req.method === "GET") {
    // Si es GET, verificar el tipo de notificación solicitada
    const { type } = req.query;
    
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
      // Para eventos intentamos obtener el título desde Firebase
      try {
        const FILES = await fetch('https://firebasestorage.googleapis.com/v0/b/mision-vida-app.appspot.com/o?prefix=eventos/EventosNuevos&alt=json').then(r => r.json());
        const LAST = FILES.items[FILES.items.length - 1].name;
        const TITLE = decodeURIComponent(LAST.split('/').pop().replace(/\.[^.]+$/, '').replace(/%20/g, ' '));
        
        notificationData = {
          title: `¡Nuevo evento! ${TITLE}`,
          body: "¡Ya está disponible el nuevo evento para ver!",
          url: "/eventos"
        };
      } catch (error) {
        console.error("Error al obtener evento:", error);
        notificationData = {
          title: "¡Nuevo evento!",
          body: "¡Ya está disponible el nuevo evento para ver!",
          url: "/eventos"
        };
      }
    } else {
      return res.status(400).json({ 
        error: "Tipo de notificación no válido. Use 'daily', 'verse' o 'event'" 
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
    // Obtener tokens FCM de la colección fcmTokens
    const tokensSnapshot = await admin.firestore().collection("fcmTokens").get();
    let tokens = tokensSnapshot.docs.map(doc => doc.data().token || doc.id);
    
    // Si no hay suficientes tokens, buscar también en la colección users
    if (tokens.length < 5) {
      const usersSnapshot = await admin.firestore().collection("users").get();
      const userTokens = [];
      usersSnapshot.docs.forEach(doc => {
        const userData = doc.data();
        if (userData.tokens && Array.isArray(userData.tokens)) {
          userTokens.push(...userData.tokens);
        }
      });
      
      // Combinar tokens sin duplicados
      tokens = [...new Set([...tokens, ...userTokens])];
    }

    if (tokens.length === 0) {
      return res.status(200).json({ 
        ok: false, 
        message: "No hay tokens registrados" 
      });
    }

    // Configurar mensaje
    const message = {
      notification: { title, body },
      data: url ? { url } : {},
      tokens
    };

    // Enviar notificaciones
    const response = await admin.messaging().sendMulticast(message);

    // Registrar éxito en logs
    console.log(`✅ Notificación enviada: "${title}" a ${response.successCount} dispositivos`);

    // Responder con resultados
    res.status(200).json({
      ok: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses // Para detalles de cada envío
    });

  } catch (error) {
    console.error("❌ Error al enviar notificación:", error);
    res.status(500).json({ 
      error: "Error interno", 
      details: error.message 
    });
  }
}
