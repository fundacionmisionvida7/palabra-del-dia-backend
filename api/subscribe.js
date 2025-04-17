import admin from '../firebaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Método no permitido');

  const subscription = req.body;
  try {
    const db = admin.firestore();
    const ref = db.collection('pushSubscriptions').doc(subscription.endpoint);
    await ref.set(subscription, { merge: true });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error al guardar suscripción:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
