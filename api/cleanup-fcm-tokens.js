// api/cleanup-fcm-tokens.js
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
}

const db = admin.firestore();
const messaging = admin.messaging();

export default async function handler(req, res) {
  try {
    const usersSnap = await db.collection('users').get();

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      const data = userDoc.data();
      const allTokens = Array.isArray(data.tokens) ? data.tokens : [];

      if (allTokens.length === 0) continue;

      let keeper = null;

      // 1) Validar cada token con dryRun
      for (const token of allTokens) {
        try {
          await messaging.sendToDevice(
            token,
            { notification: { title: 'ping' } },
            { dryRun: true }
          );
          if (!keeper) keeper = token;
        } catch (err) {
          // token inválido: lo ignoramos (no será añadido al nuevo array)
        }
      }

      // 2) Si ninguno pasó la validación, conserva el primero (más reciente)
      if (!keeper) keeper = allTokens[0];

      // 3) Reescribe el campo `tokens` dejando solo el keeper
      await userDoc.ref.update({
        tokens: [keeper]
      });

      // 4) (Opcional) Actualiza tu colección fcmTokens
      await db
        .collection('fcmTokens')
        .doc(keeper)
        .set({ uid, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error limpiando tokens:', error);
    return res.status(500).json({ error: error.message });
  }
}
