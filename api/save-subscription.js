import admin from '../firebaseAdmin.js';

export default async (req, res) => {
  const { endpoint, keys } = req.body;
  
  // 1. Sanitizar endpoint
  const sanitizedEndpoint = endpoint
    .replace(/https?:\/\//g, '')
    .replace(/\//g, '_')
    .replace(/:/g, '-');

  // 2. Guardar en Firestore
app.post('/api/save-subscription', async (req, res) => {
  try {
    const subscription = req.body;
    await admin.firestore().collection('pushSubscriptions').add(subscription);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
