import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

export default async function handler(req, res) {
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

    const mainContent = document.querySelector('.daily-content') || document.querySelector('.entry-content');
    if (!mainContent) throw new Error('Estructura de contenido no encontrada');

    // Eliminar enlaces, anuncios y basura
    const unwantedSelectors = [
      'a', 'script', 'style', '.ads', '.sharedaddy', '.post-tags',
      'div[class*="promo"]', 'p > strong', 'p > a'
    ];
    mainContent.querySelectorAll(unwantedSelectors.join(',')).forEach(el => el.remove());

    let cleanHTML = mainContent.innerHTML
      .replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1')
      .replace(/class="[^"]*"/g, '')
      .replace(/style="[^"]*"/g, '')
      .replace(/(Leer también|Únete ahora).*?<\/p>/gis, '')
      .replace(/…/g, '');

    if (cleanHTML.length < 150) {
      throw new Error('Contenido insuficiente después de la limpieza');
    }

    // Extraer título limpio
    let title = mainContent.querySelector('h2')?.textContent.trim()
             || mainContent.querySelector('p strong')?.textContent.trim()
             || document.querySelector('h1')?.textContent.trim()
             || 'Palabra del Día';

    const formattedDate = new Date().toISOString().split('T')[0];

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
