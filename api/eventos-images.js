// api/eventos-images.js
import { bucket } from './firebaseAdmin';

export default async function handler(req, res) {
  try {
    // Lista los archivos bajo el prefijo de tus eventos
    const [files] = await bucket.getFiles({ prefix: 'eventos/EventosNuevos/' });
    const urls = files.map(file => file.publicUrl());
    res.status(200).json({ urls });
  } catch (error) {
    console.error('Error listando Storage (eventos):', error);
    res.status(500).json({ error: 'No se pudo leer Storage' });
  }
}
