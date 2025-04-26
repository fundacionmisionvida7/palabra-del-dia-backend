// api/send-notification.js (versión combinada)
import admin from "../firebaseAdmin.js";

export default async function handler(req, res) {
  // Permitir CORS (del viejo)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight (del viejo)
  if (req.method === "OPTIONS") return res.status(200).end();

  console.log("🔄 Procesando solicitud de notificación..."); // Del viejo

  // Verificar que Firebase Admin esté disponible (del viejo)
  if (!admin.apps.length) {
    console.error("❌ Firebase Admin no está inicializado");
    return res.status(500).json({ 
      error: "Error de configuración: Firebase Admin no está inicializado" 
    });
  }

  // Verificar acceso a Firestore (del viejo completo)
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

  // Manejar tanto POST como GET (combinación)
  let notificationData = {};
  
  if (req.method === "POST") {
    console.log("📩 Solicitud POST recibida"); // Del viejo
    notificationData = req.body || {};
  } else if (req.method === "GET") {
    console.log("📩 Solicitud GET recibida"); // Del viejo
    const { type } = req.query;
    console.log(`🔔 Tipo de notificación: ${type}`); // Del viejo
    
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
        url: "/eventos"
      };
    } else if (type === "test") { // Del viejo
      notificationData = {
        title: "🧪 Notificación de prueba",
        body: "Esta es una notificación de prueba (" + new Date().toLocaleString() + ")",
        url: "/"
      };
    } else {
      return res.status(400).json({ 
        error: "Tipo de notificación no válido. Use 'daily', 'verse', 'event' o 'test'" // Del viejo
      });
    }
  } else {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { title, body, url } = notificationData;

  // Validar campos (del viejo)
  if (!title || !body) {
    return res.status(400).json({ 
      error: "Faltan campos: title y body son obligatorios" 
    });
  }

  try {
    // ——————————————————————
    // 1) WEB-PUSH (combinación de ambos)
    // ——————————————————————
    console.log("🔍 Buscando tokens de dispositivo..."); // Del viejo
    try {
      const webSubsSnap = await admin.firestore().collection("pushSubscriptions").get();
      
      if (!webSubsSnap.empty) {
        console.log(`🌐 Encontrados ${webSubsSnap.size} tokens web push`); // Del viejo
        
        const webPush = (await import('web-push')).default;
        webPush.setVapidDetails(
          'mailto:contacto@misionvida.com',
          process.env.VAPID_PUBLIC_KEY,
          process.env.VAPID_PRIVATE_KEY
        );
        
        const payload = JSON.stringify({
          title,
          body,
          icon: '/icon-192x192.png',
          url: url || '/'
        });
        
        const webPushResults = await Promise.all(webSubsSnap.docs.map(doc => {
          const sub = { endpoint: doc.id, keys: doc.data().keys };
          return webPush.sendNotification(sub, payload)
            .then(() => ({ status: 'success', type: 'web' }))
            .catch(err => {
              console.error('❌ Error en web push:', err.message);
              return { status: 'error', type: 'web', error: err.message };
            });
        }));
        
        const webSuccessCount = webPushResults.filter(r => r.status === 'success').length;
        console.log(`✅ Enviadas ${webSuccessCount} notificaciones web push`); // Del viejo
      }
    } catch (webPushError) {
      console.error("❌ Error al enviar notificaciones web push:", webPushError); // Del viejo
    }
    
    // ——————————————————————
    // 2) FCM (combinación de ambos)
    // ——————————————————————
    const fcmSnap = await admin.firestore().collection("fcmTokens").get();
    let tokens = fcmSnap.docs.map(d => d.id).filter(t => t.length > 10); // Del nuevo
    
    console.log(`📱 Encontrados ${tokens.length} tokens FCM iniciales`); // Del viejo
    
    // Buscar también en users (del viejo)
    if (tokens.length < 5) {
      const usersSnapshot = await admin.firestore().collection("users").get();
      
      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        if (userData.tokens && Array.isArray(userData.tokens)) {
          userData.tokens.forEach(token => {
            if (token && typeof token === 'string' && token.length > 10) {
              tokens.push(token);
            }
          });
        }
        
        if (userData.fcmToken && typeof userData.fcmToken === 'string' && userData.fcmToken.length > 10) {
          tokens.push(userData.fcmToken);
        }
      });
      
      // Eliminar duplicados
      tokens = [...new Set(tokens)];
      console.log(`📱 Total de tokens FCM después de buscar en users: ${tokens.length}`); // Del viejo
    }

    if (tokens.length === 0) {
      return res.status(200).json({ 
        ok: false, 
        message: "No hay tokens FCM registrados" // Del viejo
      });
    }

    // Enviar en lotes de 500 con sendAll (del nuevo con manejo de errores del viejo)
    const chunks = [];
    for (let i = 0; i < tokens.length; i += 500) {
      chunks.push(tokens.slice(i, i + 500));
    }
    
    let successCount = 0, failureCount = 0;
    const results = []; // Del viejo
    
    for (const chunk of chunks) {
      console.log(`🔄 Procesando grupo de ${chunk.length} tokens...`); // Del viejo
      
      const resp = await admin.messaging().sendAll({
        tokens: chunk,
        notification: { title, body },
        data: { url, title, body },
        android: { // Del viejo
          notification: {
            icon: 'ic_notification',
            color: '#F57C00',
            sound: 'default'
          },
          priority: 'high'
        },
        apns: { // Del viejo
          headers: {
            'apns-priority': '10'
          },
          payload: {
            aps: {
              sound: 'default',
              category: 'DEVOTIONAL'
            }
          }
        }
      });
      
      successCount += resp.successCount;
      failureCount += resp.failureCount;
      
      resp.responses.forEach((r, idx) => {
        if (r.error) {
          const token = chunk[idx];
          console.error(`❌ Token ${token.substring(0,8)}... error:`, r.error.message);
          results.push({ // Del viejo
            status: 'error', 
            tokenPrefix: token.substring(0, 8), 
            error: r.error.message 
          });
          
          // Limpiar tokens inválidos (del viejo)
          if (r.error.code === 'messaging/invalid-argument' || 
              r.error.code === 'messaging/invalid-registration-token' || 
              r.error.code === 'messaging/registration-token-not-registered') {
            try {
              // Eliminar de fcmTokens
              admin.firestore().collection("fcmTokens").doc(token).delete()
                .then(() => console.log(`🗑️ Token eliminado de fcmTokens: ${token.substring(0,8)}...`))
                .catch(err => console.error('Error eliminando token:', err));
              
              // Eliminar de users
              admin.firestore().collection("users")
                .where('fcmToken', '==', token)
                .get()
                .then(snapshot => {
                  snapshot.forEach(doc => {
                    doc.ref.update({ fcmToken: admin.firestore.FieldValue.delete() })
                      .then(() => console.log(`🗑️ Token eliminado de users: ${token.substring(0,8)}...`))
                      .catch(err => console.error('Error eliminando token de user:', err));
                  });
                });
            } catch (deleteError) {
              console.error(`❌ Error al eliminar token inválido:`, deleteError);
            }
          }
        } else {
          results.push({ status: 'success', tokenPrefix: chunk[idx].substring(0, 8) }); // Del viejo
        }
      });
    }

    console.log(`✅ Notificación "${title}" procesada: ${successCount} éxitos, ${failureCount} fallos`); // Del viejo

    // Responder con resultados (combinación)
    return res.status(200).json({
      ok: true,
      successCount,
      failureCount,
      total: tokens.length,
      sampleResults: results.slice(0, 10) // Del viejo
    });

  } catch (error) {
    console.error("❌ Error general al procesar notificaciones:", error); // Del viejo
    return res.status(500).json({ 
      error: "Error interno al procesar notificaciones", 
      details: error.message,
      stack: error.stack // Del viejo
    });
  }
}
