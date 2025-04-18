import admin from '../firebaseAdmin.js';

export default async function handler(req, res) {
  // 1) Habilitar CORS para todas las peticiones
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 2) Responder al preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 3) Solo aceptamos POST
  if (req.method !== 'POST') {
    return res.status(405).end('Método no permitido');
  }

  // 4) Lógica original de guardar la suscripción
  const subscription = req.body;
  try {
    const db = admin.firestore();
    const ref = db.collection('pushSubscriptions').doc(subscription.endpoint);
    await ref.set(subscription, { merge: true });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error al guardar suscripción:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
