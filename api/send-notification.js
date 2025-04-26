// api/send-notification.js (versión final)
import admin from "../firebaseAdmin.js";

export default async function handler(req, res) {
  // Permitir CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight
  if (req.method === "OPTIONS") return res.status(200).end();

  console.log("🔄 Procesando solicitud de notificación...");

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
    } else if (type === "test") {
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
    // Primero probar con la colección pushSubscriptions (para web push)
    try {
      const webPushTokens = [];
      const pushSnapshot = await admin.firestore().collection("pushSubscriptions").get();
      
      if (!pushSnapshot.empty) {
        pushSnapshot.forEach(doc => {
          const data = doc.data();
          if (data.endpoint) {
            webPushTokens.push(data);
          }
        });
        
        if (webPushTokens.length > 0) {
          console.log(`🌐 Encontrados ${webPushTokens.length} tokens web push`);
          
          // Importar web-push solo si es necesario
          const webPush = (await import('web-push')).default;
          
          webPush.setVapidDetails(
            'mailto:contacto@misionvida.com',
            process.env.VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY
          );
          
          const webPushResults = await Promise.all(webPushTokens.map(async sub => {
            try {
              const payload = JSON.stringify({
                title,
                body,
                icon: '/icon-192x192.png',
                url: url || '/'
              });
              
              await webPush.sendNotification(sub, payload);
              return { status: 'success', type: 'web' };
            } catch (err) {
              console.error(`❌ Error en web push:`, err.message);
              return { status: 'error', type: 'web', error: err.message };
            }
          }));
          
          const webSuccessCount = webPushResults.filter(r => r.status === 'success').length;
          console.log(`✅ Enviadas ${webSuccessCount} notificaciones web push`);
        }
      }
    } catch (webPushError) {
      console.error("❌ Error al enviar notificaciones web push:", webPushError);
      // Continuar con FCM aunque falle web push
    }
    
    // Obtener tokens FCM de la colección fcmTokens
    const tokensSnapshot = await admin.firestore().collection("fcmTokens").get();
    let tokens = [];
    
    tokensSnapshot.forEach(doc => {
      const data = doc.data();
      const token = data.token || data.fcmToken || doc.id;
      if (token && typeof token === 'string' && token.length > 10) {
        tokens.push(token);
      }
    });
    
    console.log(`📱 Encontrados ${tokens.length} tokens FCM iniciales`);
    
    // Si no hay suficientes tokens, buscar también en la colección users
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
      console.log(`📱 Total de tokens FCM después de buscar en users: ${tokens.length}`);
    }

    if (tokens.length === 0) {
      return res.status(200).json({ 
        ok: false, 
        message: "No hay tokens FCM registrados" 
      });
    }

    // Dividir los tokens en grupos para evitar sobrecargar Firebase
    const chunkSize = 500;
    const tokenChunks = [];
    
    for (let i = 0; i < tokens.length; i += chunkSize) {
      tokenChunks.push(tokens.slice(i, i + chunkSize));
    }
    
    console.log(`📱 Tokens divididos en ${tokenChunks.length} grupos`);

    // Enviar notificaciones token por token para evitar el error de /batch
    const results = [];
    let successCount = 0;
    let failureCount = 0;
    
    for (const tokenChunk of tokenChunks) {
      console.log(`🔄 Procesando grupo de ${tokenChunk.length} tokens...`);
      
      for (const token of tokenChunk) {
        try {
          // Crear mensaje para un solo token
          const message = {
            notification: {
              title,
              body,
            },
            data: {
              ...(url ? { url } : {}),
              title,
              body,
              timestamp: Date.now().toString()
            },
            android: {
              notification: {
                icon: 'ic_notification',
                color: '#F57C00',
                sound: 'default'
              },
              priority: 'high'
            },
            apns: {
              headers: {
                'apns-priority': '10'
              },
              payload: {
                aps: {
                  sound: 'default',
                  category: 'DEVOTIONAL'
                }
              }
            },
            token
          };
          
          // Enviar la notificación
          await admin.messaging().send(message);
          
          successCount++;
          results.push({ status: 'success', tokenPrefix: token.substring(0, 8) });
        } catch (error) {
          console.error(`❌ Error al enviar a token ${token.substring(0, 8)}...`, error.message);
          
          failureCount++;
          results.push({ 
            status: 'error', 
            tokenPrefix: token.substring(0, 8), 
            error: error.message 
          });
          
          // Limpiar tokens inválidos
          if (
            error.code === 'messaging/invalid-argument' || 
            error.code === 'messaging/invalid-registration-token' || 
            error.code === 'messaging/registration-token-not-registered'
          ) {
            try {
              // Intentar eliminar el token inválido de fcmTokens
              const tokenQuery = await admin.firestore()
                .collection("fcmTokens")
                .where('token', '==', token)
                .get();
              
              if (!tokenQuery.empty) {
                tokenQuery.forEach(async doc => {
                  await doc.ref.delete();
                  console.log(`🗑️ Token eliminado de fcmTokens: ${token.substring(0, 8)}...`);
                });
              } else {
                // También buscar en la colección users
                const usersQuery = await admin.firestore()
                  .collection("users")
                  .where('fcmToken', '==', token)
                  .get();
                
                if (!usersQuery.empty) {
                  usersQuery.forEach(async doc => {
                    await doc.ref.update({
                      fcmToken: admin.firestore.FieldValue.delete()
                    });
                    console.log(`🗑️ Token eliminado de users: ${token.substring(0, 8)}...`);
                  });
                }
              }
            } catch (deleteError) {
              console.error(`❌ Error al eliminar token inválido:`, deleteError);
            }
          }
        }
      }
    }

    console.log(`✅ Notificación "${title}" procesada: ${successCount} éxitos, ${failureCount} fallos`);

    // Responder con resultados
    return res.status(200).json({
      ok: true,
      successCount,
      failureCount,
      total: tokens.length,
      sampleResults: results.slice(0, 10) // Solo mostrar una muestra
    });

  } catch (error) {
    console.error("❌ Error general al procesar notificaciones:", error);
    return res.status(500).json({ 
      error: "Error interno al procesar notificaciones", 
      details: error.message,
      stack: error.stack
    });
  }
}
