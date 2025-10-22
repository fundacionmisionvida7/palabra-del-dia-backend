// api/cleanup-fcm-tokens.js
import { MongoClient } from 'mongodb';
import admin from 'firebase-admin';

// Inicializar Firebase Admin
function initializeFirebaseAdmin() {
  if (!admin.apps.length) {
    const serviceAccount = {
      projectId: process.env.FCM_PROJECT_ID,
      clientEmail: process.env.FCM_CLIENT_EMAIL,
      privateKey: process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n')
    };
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
  return admin;
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
    return res.status(405).json({ 
      success: false, 
      error: 'Método no permitido. Use POST.' 
    });
  }

  let client;

  try {
    console.log('🧹 Iniciando limpieza de tokens FCM inválidos...');

    // Verificar variables de entorno
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI no está configurada');
    }
    if (!process.env.FCM_PROJECT_ID) {
      throw new Error('FCM_PROJECT_ID no está configurada');
    }

    // Inicializar Firebase Admin
    const admin = initializeFirebaseAdmin();
    
    // Conectar a MongoDB
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db(process.env.DB_NAME || 'palabra_dia');

    // Obtener todos los usuarios con tokens FCM
    const users = await db.collection('users').find({
      fcmTokens: { $exists: true, $ne: [] }
    }).toArray();

    console.log(`📊 Usuarios con tokens: ${users.length}`);

    let totalRemoved = 0;
    let totalChecked = 0;

    // Verificar cada token y eliminar los inválidos
    for (const user of users) {
      const validTokens = [];
      const tokensToCheck = user.fcmTokens || [];

      for (const token of tokensToCheck) {
        try {
          // Verificar si el token es válido enviando un mensaje de prueba
          await admin.messaging().send({
            token: token,
            data: {
              type: 'validation',
              timestamp: Date.now().toString()
            }
          }, true); // dryRun: true - no envía realmente la notificación
          
          // Si no hay error, el token es válido
          validTokens.push(token);
          console.log(`✅ Token válido: ${token.substring(0, 20)}...`);
        } catch (error) {
          // Si hay error, el token es inválido
          console.log(`❌ Token inválido removido: ${token.substring(0, 20)}... - Error: ${error.errorInfo?.code}`);
          totalRemoved++;
        }
        totalChecked++;
      }

      // Actualizar el usuario con solo los tokens válidos
      if (validTokens.length !== tokensToCheck.length) {
        await db.collection('users').updateOne(
          { _id: user._id },
          { $set: { fcmTokens: validTokens } }
        );
        console.log(`🔄 Usuario ${user._id} actualizado: ${tokensToCheck.length} → ${validTokens.length} tokens`);
      }
    }

    console.log(`🎉 Limpieza completada: ${totalRemoved} tokens inválidos removidos de ${totalChecked} verificados`);

    return res.status(200).json({
      success: true,
      message: 'Limpieza de tokens FCM inválidos completada',
      stats: {
        usersProcessed: users.length,
        tokensChecked: totalChecked,
        invalidTokensRemoved: totalRemoved,
        validTokensRemaining: totalChecked - totalRemoved
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
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 Conexión a MongoDB cerrada');
    }
  }
}
