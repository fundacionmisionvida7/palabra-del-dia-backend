// api/send-notification.js (versión final) v2
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
        url: "/" // Ruta específica
      };
    } else if (type === "verse") {
      notificationData = {
        title: "¡Nuevo versículo del día!",
        body: "No te lo pierdas, ya está disponible",
        url: "/versiculo" // Ruta corregida
      };
    } else if (type === "event") {
      notificationData = {
        title: "¡Nuevo evento!",
        body: "¡Ya está disponible el nuevo evento para ver!",
        url: "/eventos" // Ruta corregida
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
      const pushSnapshot = await admin.firestore().collection("pushSubscriptions").get(); // Nombre correcto de variable
      
      if (!pushSnapshot.empty) {
        pushSnapshot.forEach(doc => {
          const data = doc.data();
          if (data.endpoint) {
            webPushTokens.push(data);
          }
        });
      }
      


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
    
 // ======== Versión Corregida ========
// Obtener tokens FCM de todas las fuentes
let tokens = [];

// 1. Tokens de la colección fcmTokens (si aún la usas)
const fcmTokensSnapshot = await admin.firestore().collection("fcmTokens").get();
fcmTokensSnapshot.forEach(doc => {
  const token = doc.data().token || doc.id; // Compatibilidad con diferentes estructuras
  if (validateToken(token)) tokens.push(token);
});

console.log(`📱 Encontrados ${tokens.length} tokens FCM iniciales`);

// 2. Tokens de la colección users (fuente principal)
const usersSnapshot = await admin.firestore().collection("users")
  .where("fcmToken", "!=", null)
  .get();

usersSnapshot.forEach(doc => {
  const userData = doc.data();
  
  // Token en campo fcmToken
  if (validateToken(userData.fcmToken)) {
    tokens.push(userData.fcmToken);
  }
  
  // Tokens en array (legacy)
  if (Array.isArray(userData.tokens)) {
    userData.tokens.forEach(token => {
      if (validateToken(token)) tokens.push(token);
    });
  }
});

// Eliminar duplicados y filtrar válidos
tokens = [...new Set(tokens)].filter(t => t);

console.log(`📱 Total de tokens FCM después de combinar fuentes: ${tokens.length}`);

if (tokens.length === 0) {
  return res.status(200).json({ 
    ok: false, 
    message: "No hay tokens FCM registrados" 
  });
}

// ======== Función de validación ========
function validateToken(token) {
  return token && typeof token === 'string' && token.length > 10;
}

    // Dividir los tokens en grupos para evitar sobrecargar Firebase
const chunkSize = 500; // <--- Asegúrate de definir esto
const tokenChunks = [];
for (let i = 0; i < tokens.length; i += chunkSize) {
  tokenChunks.push(tokens.slice(i, i + chunkSize));
}

console.log(`📱 Tokens divididos en ${tokenChunks.length} grupos`);

    // Enviar notificaciones token por token para evitar el error de /batch
    const results = [];
    let successCount = 0;
    let failureCount = 0;

  // Procesar cada grupo
for (const chunk of tokenChunks) {
  console.log(`🔄 Procesando grupo de ${chunk.length} tokens...`);
    
  for (const token of chunk) {
        try {
          // Crear mensaje para un solo token
          const message = {
            notification: { title, body },
            data: {  // Objeto data unificado
              url: url || '/',
              type: notificationData.type || 'daily', // Campo type agregado
              title: title,
              body: body,
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
      
          // Limpiar tokens inválidos (versión simplificada)
          if (
            error.code === 'messaging/invalid-argument' || 
            error.code === 'messaging/invalid-registration-token' || 
            error.code === 'messaging/registration-token-not-registered'
          ) {
            try {
              // Eliminar directamente de fcmTokens usando el token como ID del documento
          // Eliminar de ambas colecciones en paralelo
          await Promise.all([
            admin.firestore().collection("fcmTokens").doc(token).delete(),
            admin.firestore().collection("users")
              .where("fcmToken", "==", token)
              .get()
              .then(snapshot => {
                snapshot.docs.forEach(doc => 
                  doc.ref.update({ fcmToken: admin.firestore.FieldValue.delete() })
                );
              })
          ]);
          console.log(`🔒 Token ${token.substring(0, 8)} eliminado completamente`);
        } catch (error) {
          console.error("⚠️ Error limpiando token:", error);
        }
      
          }
        }
      }};


      

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



// Antes de enviar, desduplica tokens
const uniqueTokens = [...new Set(tokens)];

// Dividir en grupos más pequeños para evitar timeout
const CHUNK_SIZE = 300; // Menor que el límite de 500 de Firebase
for (let i = 0; i < uniqueTokens.length; i += CHUNK_SIZE) {
  const chunk = uniqueTokens.slice(i, i + CHUNK_SIZE);
  await sendChunk(chunk);
}

async function sendChunk(chunk) {
  try {
    const messages = chunk.map(token => ({
      notification: { title, body },
      data: { url, type: notificationData.type || 'daily' },
      token
    }));

    // Enviar como lote
    const batchResponse = await admin.messaging().sendEach(messages);
    
    // Procesar respuestas
    batchResponse.responses.forEach((response, index) => {
      if (!response.success) {
        handleInvalidToken(chunk[index]);
      }
    });
  } catch (error) {
    console.error("🔥 Error en chunk:", error);
  }
}


// En la sección de web push:
const validSubscriptions = [];
for (const sub of webPushTokens) {
  try {
    const response = await fetch(sub.endpoint, { method: 'HEAD' });
    if (response.status === 200) {
      validSubscriptions.push(sub);
    } else {
      await admin.firestore().collection("pushSubscriptions")
        .doc(sub.endpoint).delete();
    }
  } catch (error) {
    await admin.firestore().collection("pushSubscriptions")
      .doc(sub.endpoint).delete();
  }
}

// Usar solo suscripciones válidas
webPushResults = await Promise.all(validSubscriptions.map(sendWebPush));



// Configurar timeout personalizado
const TIMEOUT_MS = 9000; // Menor que el límite de 10s de Vercel

const sendWithTimeout = async (promise) => {
  const timeout = new Promise((_, reject) => 
    setTimeout(() => reject(new Error("Timeout")), TIMEOUT_MS)
  );
  return Promise.race([promise, timeout]);
};

// Usar en ambos casos
await sendWithTimeout(sendChunk(chunk));
await sendWithTimeout(sendWebPush(sub));


// Antes de enviar, verificar plataforma
const filterTokens = (tokens) => {
  const seen = new Set();
  return tokens.filter(token => {
    const isWeb = token.startsWith('https://fcm.googleapis.com');
    const isMobile = !isWeb;
    
    // Priorizar móviles
    if (isMobile && !seen.has(token)) {
      seen.add(token);
      return true;
    }
    return false;
  });
};

const filteredTokens = filterTokens(uniqueTokens);
