// api/cleanup-fcm-tokens.js - VERSIÓN CORREGIDA
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
}

const db = admin.firestore();
const messaging = admin.messaging();

// Función mejorada para validar tokens
async function validateToken(token) {
  try {
    // Método más confiable para validar tokens
    const response = await messaging.send({
      token: token,
      notification: { title: 'Validation' },
    }, true); // dryRun = true
    
    return response.success;
  } catch (error) {
    console.log(`❌ Token inválido: ${token.substring(0, 10)}... - ${error.errorInfo?.code || error.message}`);
    return false;
  }
}

export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    console.log('🧹 INICIANDO LIMPIEZA DE TOKENS FCM...');
    
    const usersSnap = await db.collection('users').get();
    console.log(`📊 Usuarios a procesar: ${usersSnap.size}`);
    
    let totalProcessed = 0;
    let totalCleaned = 0;
    let adminProcessed = false;

    // Procesar cada usuario individualmente
    for (const userDoc of usersSnap.docs) {
      try {
        const uid = userDoc.id;
        const userData = userDoc.data();
        const allTokens = Array.isArray(userData.tokens) ? userData.tokens : [];
        
        console.log(`👤 Procesando usuario ${uid}: ${allTokens.length} tokens`);
        
        // Verificar si es el usuario admin (puedes ajustar esta condición)
        if (userData.email && userData.email.includes('admin') || userData.role === 'admin') {
          console.log(`⭐ USUARIO ADMIN DETECTADO: ${userData.email || uid}`);
          adminProcessed = true;
        }

        if (allTokens.length === 0) {
          console.log(`➡️ Usuario ${uid} sin tokens, saltando...`);
          totalProcessed++;
          continue;
        }

        // Si tiene solo 1 token, lo mantenemos sin validar (probablemente válido)
        if (allTokens.length === 1) {
          console.log(`✅ Usuario ${uid} tiene solo 1 token, manteniendo...`);
          totalProcessed++;
          continue;
        }

        // Si tiene múltiples tokens, validamos y limpiamos
        console.log(`🔍 Validando ${allTokens.length} tokens para usuario ${uid}...`);
        
        const validTokens = [];
        let validationErrors = 0;

        // Validar cada token
        for (const token of allTokens) {
          const isValid = await validateToken(token);
          if (isValid) {
            validTokens.push(token);
            console.log(`✅ Token válido: ${token.substring(0, 15)}...`);
          } else {
            validationErrors++;
          }
        }

        console.log(`📋 Resultado validación - Válidos: ${validTokens.length}, Inválidos: ${validationErrors}`);

        // Decidir qué tokens mantener
        let tokensToKeep = [];
        
        if (validTokens.length > 0) {
          // Mantener máximo 3 tokens válidos (los más recientes)
          tokensToKeep = validTokens.slice(0, 3);
        } else {
          // Si ninguno es válido, mantener el primero (más reciente)
          tokensToKeep = [allTokens[0]];
          console.log(`⚠️ Ningún token válido, manteniendo el más reciente: ${allTokens[0].substring(0, 15)}...`);
        }

        // Actualizar solo si hay cambios
        if (tokensToKeep.length !== allTokens.length) {
          console.log(`🔄 Actualizando usuario ${uid}: ${allTokens.length} → ${tokensToKeep.length} tokens`);
          
          await userDoc.ref.update({
            tokens: tokensToKeep,
            lastCleanup: new Date().toISOString(),
            cleanupStats: {
              before: allTokens.length,
              after: tokensToKeep.length,
              timestamp: new Date().toISOString()
            }
          });
          
          totalCleaned++;
          
          // Actualizar/crear en fcmTokens collection
          for (const token of tokensToKeep) {
            await db.collection('fcmTokens').doc(token).set({
              uid: uid,
              isValid: true,
              lastValidated: new Date().toISOString(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
          }
          
          console.log(`✅ Usuario ${uid} actualizado: ${tokensToKeep.length} tokens mantenidos`);
        } else {
          console.log(`➡️ Usuario ${uid} sin cambios necesarios`);
        }
        
        totalProcessed++;

      } catch (userError) {
        console.error(`❌ Error procesando usuario ${userDoc.id}:`, userError);
        // Continuar con el siguiente usuario aunque falle uno
        totalProcessed++;
      }
    }

    console.log('🎉 LIMPIEZA COMPLETADA');
    console.log(`📊 Resumen:`);
    console.log(`   👥 Usuarios procesados: ${totalProcessed}`);
    console.log(`   🧹 Usuarios limpiados: ${totalCleaned}`);
    console.log(`   ⭐ Admin procesado: ${adminProcessed ? '✅' : '❌'}`);

    res.status(200).json({
      success: true,
      message: 'Limpieza completada',
      stats: {
        totalUsers: totalProcessed,
        cleanedUsers: totalCleaned,
        adminProcessed: adminProcessed,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('💥 ERROR CRÍTICO EN LIMPIEZA:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
