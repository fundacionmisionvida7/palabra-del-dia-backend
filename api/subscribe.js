// api/subscribe.js

import admin from '../firebaseAdmin.js';


export default async function handler(req, res) {
  // 1) Inyectamos siempre los headers CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 2) Respondemos al preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 3) Solo permitimos POST
  if (req.method !== 'POST') {
    return res.status(405).end('Método no permitido');
  }

  // 4) Tu lógica de guardar la suscripción
  const subscription = req.body;

  try {
    const db = admin.firestore();
    const subscription = req.body;

    // Sanitizar endpoint igual que en el frontend
    const sanitizedEndpoint = subscription.endpoint
      .replace(/https?:\/\//g, '')
      .replace(/\//g, '_')
      .replace(/:/g, '-');

    await db
      .collection('pushSubscriptions')
      .doc(sanitizedEndpoint) // Usar el endpoint sanitizado
      .set(subscription, { merge: true });
      
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error al guardar suscripción:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
