// Versión optimizada para muchos usuarios
import { MongoClient } from 'mongodb';
import admin from 'firebase-admin';

function initializeFirebaseAdmin() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FCM_PROJECT_ID,
        clientEmail: process.env.FCM_CLIENT_EMAIL,
        privateKey: process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n')
      })
    });
  }
  return admin;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  let client;

  try {
    console.log('🧹 Limpiando tokens FCM inválidos...');
    
    const admin = initializeFirebaseAdmin();
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db(process.env.DB_NAME || 'palabra_dia');

    // Obtener todos los tokens únicos
    const users = await db.collection('users').find({
      fcmTokens: { $exists: true, $ne: [] }
    }).project({ fcmTokens: 1 }).toArray();

    const allTokens = [...new Set(users.flatMap(user => user.fcmTokens))];
    console.log(`🔍 Verificando ${allTokens.length} tokens únicos...`);

    // Verificar tokens en lote
    const validationResults = await Promise.allSettled(
      allTokens.map(token => 
        admin.messaging().send({ token, data: { validate: 'true' } }, true)
      )
    );

    const validTokens = validationResults
      .map((result, index) => result.status === 'fulfilled' ? allTokens[index] : null)
      .filter(token => token !== null);

    const invalidTokens = allTokens.filter(token => !validTokens.includes(token));
    
    console.log(`✅ ${validTokens.length} tokens válidos, ❌ ${invalidTokens.length} inválidos`);

    // Actualizar usuarios removiendo tokens inválidos
    const updateResult = await db.collection('users').updateMany(
      { fcmTokens: { $in: invalidTokens } },
      { $pull: { fcmTokens: { $in: invalidTokens } } }
    );

    console.log(`🔄 ${updateResult.modifiedCount} usuarios actualizados`);

    return res.status(200).json({
      success: true,
      message: 'Tokens inválidos eliminados',
      stats: {
        totalTokens: allTokens.length,
        validTokens: validTokens.length,
        invalidTokensRemoved: invalidTokens.length,
        usersUpdated: updateResult.modifiedCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    if (client) await client.close();
  }
}
