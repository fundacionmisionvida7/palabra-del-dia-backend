// api/cleanup-fcm-tokens.js
import admin from 'firebase-admin';

// Inicializa Firebase Admin con tu Service Account
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
    const usuariosSnapshot = await db.collection('users').get();

    for (const userDoc of usuariosSnapshot.docs) {
      const uid = userDoc.id;
      const tokensRef = db.collection('fcmTokens')
                          .where('uid', '==', uid)
                          .orderBy('createdAt', 'desc');
      const tokensSnap = await tokensRef.get();

      let keeper = null;
      for (const tokenDoc of tokensSnap.docs) {
        const token = tokenDoc.id;
        // dryRun valida sin enviar notificación real
        try {
          await messaging.sendToDevice(token, { notification: { title: 'ping' } }, { dryRun: true });
          if (!keeper) {
            keeper = token;  // primer token válido
          } else {
            await db.collection('fcmTokens').doc(token).delete();
          }
        } catch (err) {
          // token inválido o no registrado, elimínalo
          await db.collection('fcmTokens').doc(token).delete();
        }
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error limpiando tokens:', error);
    return res.status(500).json({ error: error.message });
  }
}
