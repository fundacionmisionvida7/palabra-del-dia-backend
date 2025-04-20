// api/save-token.js
import admin from "../firebaseAdmin.js"; // tu versión corregida
export default async function handler(req, res) {
  const { token } = req.body;
  if (!token) return res.status(400).end();
  const db = admin.firestore();
  await db.collection("fcmTokens").doc(token).set({
    token,
    updatedAt: new Date().toISOString()
  });
  res.json({ ok: true });
}
