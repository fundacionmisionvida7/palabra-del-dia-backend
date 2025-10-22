// api/cleanup-fcm-tokens.js - VERSIÓN CORREGIDA PARA FIRESTORE
import admin from 'firebase-admin';

// Inicializar Firebase Admin con TUS variables
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
}

const db = admin.firestore();
const messaging = admin.messaging();

export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Método no permitido' 
    });
  }

  try {
    console.log('🧹 Iniciando limpieza de tokens FCM inválidos...');

    const usersSnap = await db.collection('users').get();
    console.log(`📊 ${usersSnap.size} usuarios encontrados`);

    let totalRemoved = 0;
    let totalChecked = 0;
    let usersUpdated = 0;

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      const data = userDoc.data();
      
      // Buscar tokens en diferentes campos posibles
      const allTokens = Array.isArray(data.fcmTokens) ? data.fcmTokens : 
                       Array.isArray(data.tokens) ? data.tokens : [];

      if (allTokens.length === 0) continue;

      console.log(`👤 Usuario ${uid}: ${allTokens.length} tokens`);

      const validTokens = [];

      // Validar cada token
      for (const token of allTokens) {
        try {
          // Verificar token con dryRun
          await messaging.send({
            token: token,
            data: { validation: 'true' }
          }, true); // dryRun: true
          
          validTokens.push(token);
          console.log(`✅ Token válido: ${token.substring(0, 20)}...`);
        } catch (error) {
          console.log(`❌ Token inválido: ${token.substring(0, 20)}... - ${error.errorInfo?.code}`);
          totalRemoved++;
        }
        totalChecked++;
      }

      // Actualizar usuario si se removieron tokens inválidos
      if (validTokens.length !== allTokens.length) {
        await userDoc.ref.update({
          fcmTokens: validTokens,
          lastCleanup: new Date()
        });
        usersUpdated++;
        console.log(`🔄 Usuario ${uid} actualizado: ${allTokens.length} → ${validTokens.length} tokens`);
      }
    }

    console.log(`✅ Limpieza completada: ${totalRemoved} tokens inválidos removidos de ${totalChecked} verificados, ${usersUpdated} usuarios actualizados`);

    return res.status(200).json({
      success: true,
      message: 'Limpieza de tokens FCM completada',
      stats: {
        usersProcessed: usersSnap.size,
        tokensChecked: totalChecked,
        invalidTokensRemoved: totalRemoved,
        validTokensRemaining: totalChecked - totalRemoved,
        usersUpdated: usersUpdated
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error en limpieza FCM:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
