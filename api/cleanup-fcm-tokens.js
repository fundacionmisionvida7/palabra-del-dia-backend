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
    // 1. Recupera todos los usuarios
    const usuariosSnap = await db.collection('users').get();

    for (const userDoc of usuariosSnap.docs) {
      const uid = userDoc.id;
      const tokensRef = db
        .collection('users')
        .doc(uid)
        .collection('tokens')
        .orderBy('createdAt', 'desc'); // asume que cada tokenDoc tiene campo createdAt
      const tokensSnap = await tokensRef.get();

      let keeper = null;
      // 2. Valida y elige keeper
      for (const tokenDoc of tokensSnap.docs) {
        const token = tokenDoc.id;
        try {
          await messaging.sendToDevice(
            token,
            { notification: { title: 'ping' } },
            { dryRun: true }
          );
          if (!keeper) keeper = token;
          // si ya hay keeper, lo eliminamos de users/{uid}/tokens
          else await tokenDoc.ref.delete();
        } catch {
          // token inválido, lo borramos
          await tokenDoc.ref.delete();
        }
      }

      // 3. (Opcional) Asegurarte de conservar always el más reciente aunque falle:
      // if (!keeper && tokensSnap.docs[0]) {
      //   keeper = tokensSnap.docs[0].id;
      //   // opcionalmente: moverlo a fcmTokens
      // }

      // 4. Actualiza colección fcmTokens (opcional)
      if (keeper) {
        await db
          .collection('fcmTokens')
          .doc(keeper)
          .set({ uid, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error limpiando tokens:', error);
    return res.status(500).json({ error: error.message });
  }
}
