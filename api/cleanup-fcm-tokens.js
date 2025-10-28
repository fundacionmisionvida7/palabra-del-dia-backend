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


// api/cleanup-fcm-tokens.js - AGREGAR DESPUÉS DE validateToken

// Función para limpiar tokens inválidos de la colección fcmTokens
async function cleanupInvalidFcmTokens() {
  try {
    console.log('🧹 BUSCANDO TOKENS INVÁLIDOS EN COLECCIÓN fcmTokens...');
    
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    
    // 1. Buscar tokens muy antiguos (más de 1 mes)
    const oldTokensSnapshot = await db.collection('fcmTokens')
      .where('updatedAt', '<', oneMonthAgo)
      .get();

    console.log(`📅 Tokens antiguos encontrados: ${oldTokensSnapshot.size}`);
    
    let deletedOldTokens = 0;
    const batch = db.batch();
    
    // Eliminar tokens antiguos
    oldTokensSnapshot.forEach(doc => {
      batch.delete(doc.ref);
      deletedOldTokens++;
    });
    
    if (deletedOldTokens > 0) {
      await batch.commit();
      console.log(`🗑️ Eliminados ${deletedOldTokens} tokens antiguos`);
    }
    
    // 2. Buscar tokens marcados como inválidos
    const invalidTokensSnapshot = await db.collection('fcmTokens')
      .where('isValid', '==', false)
      .get();
    
    console.log(`❌ Tokens inválidos encontrados: ${invalidTokensSnapshot.size}`);
    
    let deletedInvalidTokens = 0;
    const batch2 = db.batch();
    
    invalidTokensSnapshot.forEach(doc => {
      batch2.delete(doc.ref);
      deletedInvalidTokens++;
    });
    
    if (deletedInvalidTokens > 0) {
      await batch2.commit();
      console.log(`🗑️ Eliminados ${deletedInvalidTokens} tokens inválidos`);
    }
    
    // 3. Buscar tokens sin UID (huérfanos)
    const orphanTokensSnapshot = await db.collection('fcmTokens')
      .where('uid', '==', null)
      .limit(100) // Limitar para no sobrecargar
      .get();
    
    console.log(`👻 Tokens huérfanos encontrados: ${orphanTokensSnapshot.size}`);
    
    let deletedOrphanTokens = 0;
    const batch3 = db.batch();
    
    orphanTokensSnapshot.forEach(doc => {
      batch3.delete(doc.ref);
      deletedOrphanTokens++;
    });
    
    if (deletedOrphanTokens > 0) {
      await batch3.commit();
      console.log(`🗑️ Eliminados ${deletedOrphanTokens} tokens huérfanos`);
    }
    
    return {
      deletedOldTokens,
      deletedInvalidTokens,
      deletedOrphanTokens,
      totalDeleted: deletedOldTokens + deletedInvalidTokens + deletedOrphanTokens
    };
    
  } catch (error) {
    console.error('❌ Error limpiando colección fcmTokens:', error);
    return { error: error.message };
  }
}

// Función para sincronizar fcmTokens con users
async function syncFcmTokensWithUsers() {
  try {
    console.log('🔄 SINCRONIZANDO COLECCIÓN fcmTokens CON users...');
    
    const usersSnap = await db.collection('users').get();
    const allValidTokens = new Set();
    
    // Recolectar todos los tokens válidos de users
    usersSnap.forEach(userDoc => {
      const tokens = userDoc.data().tokens || [];
      tokens.forEach(token => allValidTokens.add(token));
    });
    
    console.log(`📊 Tokens válidos en users: ${allValidTokens.size}`);
    
    // Obtener todos los documentos de fcmTokens
    const fcmTokensSnap = await db.collection('fcmTokens').get();
    console.log(`📋 Documentos en fcmTokens: ${fcmTokensSnap.size}`);
    
    let orphanFcmTokens = 0;
    const batch = db.batch();
    
    // Eliminar tokens de fcmTokens que no están en users
    fcmTokensSnap.forEach(doc => {
      const tokenData = doc.data();
      if (!allValidTokens.has(doc.id)) {
        batch.delete(doc.ref);
        orphanFcmTokens++;
      }
    });
    
    if (orphanFcmTokens > 0) {
      await batch.commit();
      console.log(`🗑️ Eliminados ${orphanFcmTokens} tokens huérfanos de fcmTokens`);
    } else {
      console.log('✅ No hay tokens huérfanos en fcmTokens');
    }
    
    return { orphanFcmTokens };
    
  } catch (error) {
    console.error('❌ Error sincronizando fcmTokens:', error);
    return { error: error.message };
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
    
        // Busca esta línea y ajústala:
        if (userData.email && userData.email.includes('admin') || userData.role === 'admin' || uid === 'ZqyiPJtJ74YyEZ1WSD9xOlGhKue2') {
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


    console.log('🎉 LIMPIEZA DE USUARIOS COMPLETADA');
    console.log(`📊 Resumen usuarios:`);
    console.log(`   👥 Usuarios procesados: ${totalProcessed}`);
    console.log(`   🧹 Usuarios limpiados: ${totalCleaned}`);
    console.log(`   ⭐ Admin procesado: ${adminProcessed ? '✅' : '❌'}`);

    // 🔥 NUEVO: LIMPIAR COLECCIÓN fcmTokens
    console.log('\n🔥 INICIANDO LIMPIEZA DE COLECCIÓN fcmTokens...');
    
    // 1. Limpiar tokens inválidos/antiguos
    const fcmCleanupResult = await cleanupInvalidFcmTokens();
    
    // 2. Sincronizar fcmTokens con users
    const syncResult = await syncFcmTokensWithUsers();
    
    console.log('🎊 LIMPIEZA COMPLETA FINALIZADA');
    console.log(`📊 RESUMEN FINAL:`);
    console.log(`   👥 Usuarios procesados: ${totalProcessed}`);
    console.log(`   🧹 Usuarios limpiados: ${totalCleaned}`);
    console.log(`   🗑️  Tokens eliminados de fcmTokens: ${fcmCleanupResult.totalDeleted || 0}`);
    console.log(`   🔄 Tokens huérfanos eliminados: ${syncResult.orphanFcmTokens || 0}`);
    console.log(`   ⭐ Admin procesado: ${adminProcessed ? '✅' : '❌'}`);

    res.status(200).json({
      success: true,
      message: 'Limpieza completa finalizada',
      stats: {
        users: {
          totalProcessed: totalProcessed,
          cleaned: totalCleaned,
          adminProcessed: adminProcessed
        },
        fcmTokens: {
          deletedOld: fcmCleanupResult.deletedOldTokens || 0,
          deletedInvalid: fcmCleanupResult.deletedInvalidTokens || 0,
          deletedOrphans: fcmCleanupResult.deletedOrphanTokens || 0,
          syncOrphans: syncResult.orphanFcmTokens || 0,
          totalDeleted: (fcmCleanupResult.totalDeleted || 0) + (syncResult.orphanFcmTokens || 0)
        },
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
