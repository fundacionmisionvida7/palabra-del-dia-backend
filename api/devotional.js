import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

export default async function handler(req, res) {
  // Configuración CORS esencial
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Manejar preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // URL fuente fija
  const sourceUrl = 'https://www.bibliaon.com/es/palabra_del_dia/';
  
  try {
    // 1. Fetch con headers de navegador real
    const response = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
      }
    });

    // Verificar estado de la respuesta
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const html = await response.text();
    const { document } = new JSDOM(html).window;

    // 2. Extracción del título
    const title = document.querySelector('h1.daily-title')?.textContent.trim() 
                || 'Palabra del Día';

    // 3. Extracción de fecha
    const dateElement = document.querySelector('.daily-date');
    const date = dateElement?.textContent.replace(/\D+/g, ' ').trim() 
               || new Date().toLocaleDateString('es-ES');

    // 4. Contenido principal con validación
    const mainContent = document.querySelector('.daily-content');
    if (!mainContent) {
      throw new Error('Estructura de la página cambiada - No se encontró el contenido principal');
    }

    // 5. Limpieza de elementos no deseados
    const unwanted = mainContent.querySelectorAll('.ad, .adsbygoogle, script, style, iframe');
    unwanted.forEach(el => el.remove());

    // 6. Filtrado de contenido relevante
    const validElements = [];
    const allowedTags = ['P', 'H2', 'H3', 'BLOCKQUOTE', 'UL', 'STRONG', 'EM'];
    
    Array.from(mainContent.children).forEach(el => {
      if (allowedTags.includes(el.tagName)) {
        // Filtrar contenido no relevante
        const textContent = el.textContent.trim();
        
        if (textContent.length < 30 || 
            textContent.includes('patrocinado') || 
            textContent.includes('publicidad')) {
          return;
        }
        
        // Limpiar atributos de estilo
        el.removeAttribute('style');
        el.removeAttribute('class');
        
        validElements.push(el.outerHTML);
      }
    });

    // 7. Validación final del contenido
    const htmlContent = validElements.join('');
    if (htmlContent.length < 100) {
      throw new Error('Contenido insuficiente - Posible bloqueo de scraping');
    }

    // 8. Respuesta exitosa
    return res.status(200).json({
      title,
      date,
      html: htmlContent,
      source: sourceUrl
    });

  } catch (error) {
    // 9. Manejo detallado de errores
    console.error('Error en devotional.js:', {
      message: error.message,
      stack: error.stack,
      sourceUrl,
      timestamp: new Date().toISOString()
    });

    // 10. Respuesta de error
    return res.status(500).json({ 
      error: 'El devocional no está disponible temporalmente',
      technicalDetails: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
}
