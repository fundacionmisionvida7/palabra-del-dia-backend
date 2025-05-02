// api/reuniones-images.js
import { bucket } from './firebaseAdmin';

export default async function handler(req, res) {
  try {
    // Ajusta el prefijo según tu estructura de carpetas
    const [files] = await bucket.getFiles({ prefix: 'reuniones/' });
    const urls = files.map(file => file.publicUrl());
    res.status(200).json({ urls });
  } catch (error) {
    console.error('Error listando Storage (reuniones):', error);
    res.status(500).json({ error: 'No se pudo leer Storage' });
  }
}
