// api/eventos-images.js
import { bucket } from '../lib/firebaseAdmin';

export default async function handler(req, res) {
  try {
    // Lista todos los archivos bajo el prefijo
    const [files] = await bucket.getFiles({ prefix: 'eventos/EventosNuevos/' });
    // Construye URLs públicas (con token, si es privado)
    const urls = files.map(file => {
      // Si tu bucket las publica sin firma, usa file.publicUrl()
      // Si son privadas, genera firma o adjunta el token que ya subiste al metadata
      return file.publicUrl();  
    });
    res.status(200).json({ urls });
  } catch (err) {
    console.error('Error listando Storage:', err);
    res.status(500).json({ error: 'No se pudo leer Storage' });
  }
}
