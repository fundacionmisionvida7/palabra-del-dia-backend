// api/test-notification.js
import admin from "../firebaseAdmin.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // Obtener tokens FCM
    const tokensSnapshot = await admin.firestore().collection("fcmTokens").get();
    let tokens = tokensSnapshot.docs.map(doc => doc.data().token || doc.id);
    
    // También buscar en users (como respaldo)
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

    if (tokens.length === 0) {
      return res.status(200).json({ 
        ok: false, 
        message: "No hay tokens registrados" 
      });
    }

    console.log(`Enviando notificación a ${tokens.length} dispositivos`);

    // Mensaje para prueba
    const message = {
      notification: { 
        title: "Prueba de notificación", 
        body: "Esta es una notificación de prueba enviada a las " + new Date().toLocaleTimeString() 
      },
      data: { url: "/" },
      tokens: tokens.slice(0, 500) // FCM tiene un límite de 500 tokens por envío
    };

    // Enviar notificaciones
    const response = await admin.messaging().sendMulticast(message);

    // Responder con resultados
    return res.status(200).json({
      ok: true,
      tokens: tokens.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses
    });

  } catch (error) {
    console.error("Error al enviar notificación:", error);
    return res.status(500).json({ 
      error: "Error interno", 
      details: error.message 
    });
  }
}
