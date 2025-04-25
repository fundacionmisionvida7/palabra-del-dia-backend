import admin from "../firebaseAdmin.js";

export default async function handler(req, res) {
  // Permitir CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight
  if (req.method === "OPTIONS") return res.status(200).end();

  // Solo POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { title, body, url } = req.body || {};

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
