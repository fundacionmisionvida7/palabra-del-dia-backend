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

  // URL fuente y configuración
  const sourceUrl = 'https://www.bibliaon.com/es/palabra_del_dia/';
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

  try {
    // 1. Obtener contenido de Bibliaon.com
    const response = await fetch(sourceUrl, {
      headers: { 'User-Agent': userAgent }
    });

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const { document } = new JSDOM(html).window;

    // 2. Extracción del título con múltiples selectores
    const title = document.querySelector('h1.daily-title')?.textContent.trim() 
                || document.querySelector('.post-header h1')?.textContent.trim()
                || document.querySelector('.entry-title')?.textContent.trim()
                || 'Palabra del Día';

    // 3. Extracción y formato de fecha
    const dateElement = document.querySelector('.daily-date') || document.querySelector('.post-date');
    const rawDate = dateElement?.textContent.match(/(\d{1,2} de [a-zA-Z]+ de \d{4})/);
    const formattedDate = rawDate ? rawDate[0] : new Date().toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).replace(/^\w/, c => c.toUpperCase());

    // 4. Limpieza del contenido principal
    const mainContent = document.querySelector('.daily-content') || document.querySelector('.entry-content');
    if (!mainContent) throw new Error('Estructura del contenido no encontrada');

    // Lista de elementos a eliminar
    const unwantedSelectors = [
      'a',                          // Todos los enlaces
      'script',                     // Scripts
      'style',                      // Estilos
      '.ads',                       // Anuncios
      '.sharedaddy',                // Botones sociales
      '.post-tags',                 // Etiquetas
      'div[class*="promo"]',        // Promociones
      'p:has(> strong)',            // Párrafos con texto destacado
      'p:contains("Te puede interesar")', // Textos promocionales
      'p:contains("Recibe su Palabra")'   // Llamados a acción
    ];

    // Eliminar elementos no deseados
    mainContent.querySelectorAll(unwantedSelectors.join(',')).forEach(el => el.remove());

    // 5. Procesamiento final del contenido
    let cleanHTML = mainContent.innerHTML
      .replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1')      // Convertir enlaces a texto
      .replace(/class="[^"]*"/g, '')                // Eliminar clases
      .replace(/style="[^"]*"/g, '')                // Eliminar estilos
      .replace(/Leer también:.*?<\/p>/gis, '')      // Eliminar recomendaciones
      .replace(/Únete ahora.*?<\/p>/gis, '')        // Eliminar llamados a acción
      .replace(/\n{3,}/g, '\n');                    // Normalizar saltos de línea

    // 6. Validación de contenido mínimo
    if (cleanHTML.length < 150) {
      throw new Error('Contenido insuficiente después de la limpieza');
    }

    // 7. Construir respuesta final
    return res.status(200).json({
      title: title,
      date: formattedDate,
      html: cleanHTML,
      source: sourceUrl
    });

  } catch (error) {
    // 8. Manejo detallado de errores
    console.error('Error en devotional.js:', {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      sourceUrl
    });

    // 9. Respuesta de error con información controlada
    return res.status(500).json({
      error: 'El devocional no está disponible temporalmente',
      details: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        stack: error.stack
      } : null
    });
  }
}
