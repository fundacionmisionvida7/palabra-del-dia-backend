// pages/api/check-live.js
import fetch from 'node-fetch';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK once
if (!global.firebaseAdminApp) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  global.firebaseAdminApp = initializeApp({
    credential: cert(serviceAccount)
  });
}
const db = getFirestore(global.firebaseAdminApp);

// Endpoint to check live stream and send notification if new
export default async function handler(req, res) {
  try {
    const API_KEY = process.env.YOUTUBE_API_KEY;
    const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
    const NOTIF_URL = process.env.NOTIF_ENDPOINT; // e.g., https://.../api/send-notification?type=live

    // Fetch live stream data
    const liveUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CHANNEL_ID}&eventType=live&type=video&key=${API_KEY}`;
    const liveResp = await fetch(liveUrl);
    if (!liveResp.ok) {
      const err = await liveResp.json();
      console.error('YouTube API error:', err);
      return res.status(liveResp.status).json({ error: err.error });
    }
    const liveData = await liveResp.json();
    const liveItems = liveData.items || [];
    const newVideoId = liveItems.length > 0 ? liveItems[0].id.videoId : null;

    // Reference to Firestore document
    const docRef = db.collection('liveStatus').doc('lastLive');
    const docSnap = await docRef.get();
    const lastLiveId = docSnap.exists ? docSnap.data().videoId : null;

    // If there is a live video and it's new
    if (newVideoId && newVideoId !== lastLiveId) {
      // Update Firestore
      await docRef.set({ videoId: newVideoId, updatedAt: new Date() });
      // Trigger notification
      await fetch(NOTIF_URL);
      return res.status(200).json({ notified: true, videoId: newVideoId });
    }

    return res.status(200).json({ notified: false, videoId: newVideoId });
  } catch (error) {
    console.error('check-live error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
