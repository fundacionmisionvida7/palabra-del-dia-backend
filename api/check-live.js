// pages/api/check-live.js
import fetch from 'node-fetch';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Inicializar Firebase Admin SDK una sola vez
if (!global.firebaseAdminApp) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  global.firebaseAdminApp = initializeApp({
    credential: cert(serviceAccount)
  });
}
const db = getFirestore(global.firebaseAdminApp);

export default async function handler(req, res) {
  try {
    const API_KEY      = process.env.YOUTUBE_API_KEY;
    const CHANNEL_ID   = process.env.YOUTUBE_CHANNEL_ID;
    const NOTIF_URL    = process.env.NOTIF_ENDPOINT; 
    const liveUrl      = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CHANNEL_ID}&eventType=live&type=video&key=${API_KEY}`;
    const latestUrl    = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CHANNEL_ID}&maxResults=1&order=date&type=video&key=${API_KEY}`;

    // 1) Intentamos consultar si hay live
    let newVideoId = null;
    try {
      const liveResp = await fetch(liveUrl);
      const liveData = await liveResp.json();

      if (liveResp.ok && liveData.items && liveData.items.length > 0) {
        newVideoId = liveData.items[0].id.videoId;
      }
      // Si liveResp.ok === false o items.length === 0, newVideoId queda en null
    } catch (fetchErr) {
      console.warn('⚠️ Error al llamar a YouTube API:', fetchErr);
      newVideoId = null;
    }

    // 2) Obtener último ID guardado en Firestore
    const docRef  = db.collection('liveStatus').doc('lastLive');
    const docSnap = await docRef.get();
    const lastLiveId = docSnap.exists ? docSnap.data().videoId : null;

    // 3) Si hay un live nuevo distinto del guardado, notificamos y actualizamos
    if (newVideoId && newVideoId !== lastLiveId) {
      // a) Actualizar Firestore
      await docRef.set({ videoId: newVideoId, updatedAt: new Date() });
      // b) Disparar notificación a tu endpoint externo
      try {
        await fetch(NOTIF_URL);
      } catch (notifErr) {
        console.warn('⚠️ Falló NOTIF_ENDPOINT:', notifErr);
      }
      return res.status(200).json({ live: true, videoId: newVideoId, notified: true });
    }

    // 4) Si no hay live o es igual al ya notificado
    return res.status(200).json({ live: false, videoId: lastLiveId, notified: false });
  }
  catch (error) {
    console.error('🔴 check-live error general:', error);

    // En caso de error en el bloque principal, devolvemos “no hay live” 
    // y devolvemos el último video almacenado (puede ser null si no existe).
    try {
      const docSnap = await db.collection('liveStatus').doc('lastLive').get();
      const lastLiveId = docSnap.exists ? docSnap.data().videoId : null;
      return res.status(200).json({ live: false, videoId: lastLiveId, notified: false });
    } catch (readErr) {
      console.error('⚠️ No se pudo leer lastLive:', readErr);
      return res.status(200).json({ live: false, videoId: null, notified: false });
    }
  }
}
