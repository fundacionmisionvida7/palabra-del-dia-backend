// api/save-token.js
import admin from "../firebaseAdmin.js";

export default async function handler(req, res) {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Missing token' });

  const db = admin.firestore();
  await db.collection("fcmTokens").doc(token).set({
    token,
    updatedAt: new Date().toISOString()
  });

  res.status(200).json({ ok: true });
}
