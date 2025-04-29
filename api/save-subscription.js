import admin from '../firebaseAdmin.js';

export default async (req, res) => {
  const { endpoint, keys } = req.body;
  
  // 1. Sanitizar endpoint
  const sanitizedEndpoint = endpoint
    .replace(/https?:\/\//g, '')
    .replace(/\//g, '_')
    .replace(/:/g, '-');

  // 2. Guardar en Firestore
  await admin.firestore().collection('pushSubscriptions')
    .doc(sanitizedEndpoint)
    .set({
      endpoint,
      keys,
      expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)) // 30 días
    });

  res.status(200).json({ ok: true });
};
