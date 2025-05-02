// api/eventos-images.js
import { bucket } from '../firebaseAdmin.js';

export default async (req, res) => {
  try {
    const [files] = await bucket.getFiles({ prefix: 'eventos/' });
    
    const urls = await Promise.all(
      files.map(file => file.publicUrl())
    );

    res.status(200).json({
      success: true,
      urls: urls.filter(url => url),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error en endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
