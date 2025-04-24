// api/subscribe.js

import admin from '../firebaseAdmin.js';

export default async function handler(req, res) {
  // 1) Inyectamos headers CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 2) Respuesta al preflight
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 3) Solo permitimos POST
  if (req.method !== 'POST') return res.status(405).end('Método no permitido');

  const subscription = req.body;

  // 4) Validación básica
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ success: false, error: 'Suscripción inválida: falta endpoint' });
  }

  // 5) Sanitizar endpoint como ID
  const sanitizedEndpoint = subscription.endpoint
    .replace(/https?:\/\//g, '')
    .replace(/\//g, '_')
    .replace(/:/g, '-');

  try {
    const db = admin.firestore();
    await db
      .collection('pushSubscriptions')
      .doc(sanitizedEndpoint)
      .set({ ...subscription, endpoint: subscription.endpoint }, { merge: true });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error al guardar suscripción:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
