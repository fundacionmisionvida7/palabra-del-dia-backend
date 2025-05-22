// api/list-events.js
import admin from 'firebase-admin';

// Inicializa Admin (solo una vez)
if (!admin.apps.length) {
  admin.initializeApp({
    // El bucket de tu Storage:
    storageBucket: 'mision-vida-app.appspot.com',
    // Las credenciales en Vercel: configura GOOGLE_APPLICATION_CREDENTIALS o las vars que necesites
  });
}

const bucket = admin.storage().bucket();

export default async function handler(req, res) {
  try {
    const folder = req.query.folder;               // "EventosViejos" o "EventosNuevos"
    const prefix = `eventos/${folder}/`;
    const [files] = await bucket.getFiles({ prefix });
    // Extraemos solo el nombre del archivo (sin la carpeta):
    const names = files.map(f => f.name.split('/').pop());
    return res.status(200).json(names);
  } catch (err) {
    console.error('Error proxy list-events:', err);
    return res.status(500).json({ error: err.message });
  }
}
