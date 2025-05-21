///api/subscribe-update.js
app.post('/api/subscribe-update', async (req, res) => {
  const { token } = req.body;
  await admin.messaging().subscribeToTopic(token, 'updates');
  res.send({ ok: true });
});
