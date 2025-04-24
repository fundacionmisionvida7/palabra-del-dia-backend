import admin from '../firebaseAdmin.js';
import fetch from 'node-fetch';
import * as webPush from 'web-push';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const response = await fetch('https://nuevo-palabra-del-dia-backend.vercel.app/api/devotional');
    const devotional = await response.json();

    const payload = {
      title: devotional.title || '📖 Palabra del Día',
      body: (devotional.html || '').replace(/<[^>]+>/g, '').substring(0, 120) + '...',
      icon: '/icon-192x192.png',
      url: '/'
    };

    webPush.setVapidDetails(
      'mailto:contacto@misionvida.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const db = admin.firestore();
    const snapshot = await db.collection('pushSubscriptions').get();
    const subscriptions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const results = await Promise.all(subscriptions.map(async sub => {
      try {
        await webPush.sendNotification(sub, JSON.stringify(payload));
        return { status: 'success', endpoint: sub.endpoint };
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          const docId = sub.endpoint
            .replace(/https?:\/\//g, '')
            .replace(/\//g, '_')
            .replace(/:/g, '-');
          await db.collection('pushSubscriptions').doc(docId).delete();
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
