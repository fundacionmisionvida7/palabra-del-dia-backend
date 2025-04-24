import admin from '../firebaseAdmin.js';
import fetch from 'node-fetch';

export default async function handler(req, res) {
  // Habilitar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    // Atención: aquí deberías usar tu dominio CORRECTO (con /api)
    const response = await fetch('https://nuevo-palabra-del-dia-backend.vercel.app/api/devotional');
    const devotional = await response.json();

const payload = {
  title: devotional.title || '📖 Palabra del Día',
  body: devotional.html?.replace(/<[^>]+>/g, '').substring(0, 120) + '...',
  icon: '/icon-192x192.png',
  url: '/'
};

    const db = admin.firestore();
    const snapshot = await db.collection('pushSubscriptions').get();
    const subscriptions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const results = await Promise.all(subscriptions.map(async sub => {
      try {
        const webPush = await import('web-push');
        webPush.setVapidDetails(
          'mailto:contacto@misionvida.com',
          process.env.VAPID_PUBLIC_KEY,
          process.env.VAPID_PRIVATE_KEY
        );
        await webPush.default.sendNotification(sub, JSON.stringify(payload));
        return { status: 'success', endpoint: sub.endpoint };
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.collection('pushSubscriptions').doc(sub.id).delete();
        }
        return { status: 'error', endpoint: sub.endpoint, error: err.message };
      }
    }));

    return res.json({
      sent: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'error').length,
      details: results
    });
  } catch (error) {
    console.error('Error en send-daily:', error);
    return res.status(500).json({ error: 'Fallo al enviar notificaciones', details: error.message });
  }
}
