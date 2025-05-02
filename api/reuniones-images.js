// api/reuniones-images.js
import { db } from './firebaseAdmin';

export default async function handler(req, res) {
  try {
    const snapshot = await db.collection('reuniones').get();
    const urls = snapshot.docs
      .map(doc => doc.data().imagenUrl)
      .filter(url => typeof url === 'string');
    res.status(200).json({ urls });
  } catch (error) {
    console.error('Error al obtener imágenes de reuniones:', error);
    res.status(500).json({ error: 'Error interno al leer Firestore' });
  }
}
