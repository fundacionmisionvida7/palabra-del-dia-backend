// api/eventos-images.js
import { storage } from '../firebase-config.js';

export default async (req, res) => {
  try {
    const ref = storage.ref('eventos');
    const result = await ref.listAll();
    
    const urls = await Promise.all(
      result.items.map(item => item.getDownloadURL())
    );

    res.status(200).json({
      success: true,
      urls: urls,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
