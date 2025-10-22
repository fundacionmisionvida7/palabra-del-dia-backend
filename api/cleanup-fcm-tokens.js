// api/cleanup-fcm-tokens.js
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'palabra_dia';

export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Manejar preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Solo permitir POST
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Método no permitido. Use POST.' 
    });
  }

  let client;

  try {
    console.log('🧹 Iniciando limpieza de FCM tokens...');

    // Verificar que MONGODB_URI existe
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI no está configurada en las variables de entorno');
    }

    // Conectar a MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(DB_NAME);

    console.log('✅ Conectado a MongoDB, limpiando tokens...');

    // Limpiar tokens FCM de todos los usuarios
    const result = await db.collection('users').updateMany(
      { 
        fcmTokens: { 
          $exists: true, 
          $ne: [] // Solo actualizar usuarios que tienen tokens
        } 
      },
      { 
        $set: { 
          fcmTokens: [],
          lastCleanup: new Date()
        } 
      }
    );

    console.log(`✅ Limpieza completada. Usuarios afectados: ${result.modifiedCount}`);

    // Respuesta exitosa
    return res.status(200).json({
      success: true,
      message: 'Limpieza de tokens FCM completada exitosamente',
      usersAffected: result.modifiedCount,
      matchedUsers: result.matchedCount,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error en limpieza FCM:', error);
    
    // Respuesta de error detallada
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  } finally {
    // Cerrar conexión de MongoDB
    if (client) {
      await client.close();
      console.log('🔌 Conexión a MongoDB cerrada');
    }
  }
}
