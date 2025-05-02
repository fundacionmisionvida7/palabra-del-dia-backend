// api/reuniones-images.js
import { bucket } from '../firebaseAdmin.js';

export default async function handler(req, res) {
  try {
    const [files] = await bucket.getFiles({ prefix: 'reuniones/' });

    // Por cada archivo, genera un URL firmado válido por 1 día:
    const urlPromises = files.map(file =>
      file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 24 * 60 * 60 * 1000
      })
    );
    const signedUrlArrays = await Promise.all(urlPromises);
    const urls = signedUrlArrays.map(arr => arr[0]); // getSignedUrl devuelve [url]

    res.status(200).json({ urls });
  } catch (error) {
    console.error('Error listando Storage (reuniones):', error);
    res.status(500).json({ error: 'No se pudo leer Storage' });
  }
}
