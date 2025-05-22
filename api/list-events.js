import admin from 'firebase-admin';

// Inicializa admin si no existe
if (!admin.apps.length) {
  admin.initializeApp({
    storageBucket: 'mision-vida-app.appspot.com',
    // opcional: credenciales vía GOOGLE_APPLICATION_CREDENTIALS o env vars
  });
}

const bucket = admin.storage().bucket();

export default async function handler(req, res) {
  const folder = req.query.folder;  // por ejemplo "EventosViejos"
  try {
    const [files] = await bucket.getFiles({ prefix: `eventos/${folder}/` });
    // Devuelve solo los nombres o construye url con getSignedUrl
    const names = files.map(f => f.name);
    res.status(200).json(names);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
