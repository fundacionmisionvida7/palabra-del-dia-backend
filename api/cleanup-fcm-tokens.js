// api/cleanup-fcm-tokens.js (versión de prueba)
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
    console.log('✅ Endpoint de limpieza llamado correctamente');
    
    // Respuesta de prueba exitosa
    return res.status(200).json({
      success: true,
      message: 'Endpoint de limpieza funcionando correctamente',
      usersAffected: 0,
      debug: true,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
