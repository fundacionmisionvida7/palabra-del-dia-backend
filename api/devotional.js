import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const sourceUrl = 'https://www.bibliaon.com/es/palabra_del_dia/';
  
  try {
    const response = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);

    const html = await response.text();
    const { document } = new JSDOM(html).window;

    // 1. Selector actualizado para el título
    const title = document.querySelector('h1.daily-title')?.textContent.trim() 
                || document.querySelector('.post-title')?.textContent.trim() 
                || 'Palabra del Día';

    // 2. Extracción mejorada de fecha
    const dateElement = document.querySelector('.daily-date') || document.querySelector('.post-date');
    const rawDate = dateElement?.textContent.match(/(\d{1,2} de [a-zA-Z]+ de \d{4})/);
    const date = rawDate ? rawDate[0] : new Date().toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // 3. Limpieza profunda del contenido
    const mainContent = document.querySelector('.daily-content') || document.querySelector('.post-content');
    if (!mainContent) throw new Error('Estructura de contenido no encontrada');

    // Eliminar elementos no deseados
    const unwantedSelectors = [
      '.ad', 
      '.adsbygoogle', 
      'script', 
      'style', 
      'iframe',
      '.sharedaddy',
      '.post-tags',
      'a[href*="patrocinado"]',
      'a[href*="publicidad"]'
    ];
    
    mainContent.querySelectorAll(unwantedSelectors.join(',')).forEach(el => el.remove());

    // 4. Procesamiento de contenido con limpieza de enlaces
    const cleanElements = [];
    const allowedTags = ['P', 'H2', 'H3', 'BLOCKQUOTE', 'UL', 'STRONG', 'EM'];
    
    Array.from(mainContent.children).forEach(el => {
      if (allowedTags.includes(el.tagName)) {
        // Limpiar enlaces internos
        const cloneEl = el.cloneNode(true);
        cloneEl.querySelectorAll('a').forEach(link => {
          link.replaceWith(document.createTextNode(link.textContent));
        });
        
        // Eliminar atributos de estilo
        cloneEl.removeAttribute('style');
        cloneEl.removeAttribute('class');
        
        // Filtrar contenido no relevante
        const textContent = cloneEl.textContent.trim();
        if (textContent.length > 30 && 
           !textContent.includes('Te puede interesar') &&
           !textContent.includes('También te recomendamos')) {
          cleanElements.push(cloneEl.outerHTML);
        }
      }
    });

    // 5. Validación final del contenido
    const htmlContent = cleanElements.join('');
    if (htmlContent.length < 100) throw new Error('Contenido insuficiente');

    return res.status(200).json({
      title,
      date,
      html: htmlContent,
      source: sourceUrl
    });

  } catch (error) {
    console.error('Error procesando devocional:', {
      message: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({ 
      error: 'El devocional no está disponible temporalmente',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
}
