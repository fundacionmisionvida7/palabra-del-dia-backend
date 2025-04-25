import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

export default async function handler(req, res) {
  // Configuración CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const sourceUrl = 'https://www.bibliaon.com/es/palabra_del_dia/';
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

  try {
    const response = await fetch(sourceUrl, { headers: { 'User-Agent': userAgent } });
    if (!response.ok) throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);

    const html = await response.text();
    const { document } = new JSDOM(html).window;

    // 1. Extracción del título corregida
    let title = document.querySelector('h1.daily-title')?.textContent.trim()
              || document.querySelector('h1.single-title')?.textContent.trim()
              || document.querySelector('h1.entry-title')?.textContent.trim();

    // Si falla, buscar en primeros elementos
    if (!title || title === 'Palabra del Día') {
      title = document.querySelector('h2')?.textContent.trim()
            || document.querySelector('p > strong')?.textContent.trim()
            || html.match(/(¡.*?!)/)?.[1] || title;
    }

    // 2. Extracción de contenido PRIMERO
    const mainContent = document.querySelector('.daily-content') || document.querySelector('.entry-content');
    if (!mainContent) throw new Error('Estructura de contenido no encontrada');

    // Limpieza profunda de puntos residuales
    let cleanHTML = mainContent.innerHTML
      .replace(/<a\b[^>]*>([^<]*)<\/a>/gi, (_, text) => text.replace(/\.$/, ''))
      .replace(/\.<\/p>/g, '</p>')
      .replace(/…/g, '');

    // 3. Lógica para título alternativo
    if (title === 'Palabra del Día') {
      const firstParagraph = mainContent.querySelector('p:first-of-type')?.textContent;
      const titleMatch = firstParagraph?.match(/(¡.*?!)/);
      if (titleMatch) title = titleMatch[1];
    }

    // 5. Procesamiento final del contenido (CORRECCIÓN)
    cleanHTML = cleanHTML
      .replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1')
      .replace(/class="[^"]*"/g, '')
      .replace(/style="[^"]*"/g, '')
      .replace(/(Leer también|Únete ahora).*?<\/p>/gis, '');

    // Validación de contenido
    if (cleanHTML.length < 150) {
      throw new Error('Contenido insuficiente después de la limpieza');
    }

    // 6. Construir respuesta final
    return res.status(200).json({
      title: title,
      date: formattedDate,
      html: cleanHTML,
      source: sourceUrl
    });

  } catch (error) {
    console.error('Error en devotional.js:', error);
    return res.status(500).json({
      error: 'El devocional no está disponible temporalmente',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
}
