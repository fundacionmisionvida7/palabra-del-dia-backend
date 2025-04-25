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

    // 1. Contenedor principal del devocional
    const mainContent = document.querySelector('.daily-content') || document.querySelector('.entry-content');
    if (!mainContent) throw new Error('Estructura de contenido no encontrada');

    // 2. Eliminar elementos no deseados (enlaces, scripts, anuncios, etc.)
    const unwanted = [
      'script', 'style', '.ads', '.sharedaddy', '.post-tags', 'div[class*="promo"]',
      'p > a', 'a'
    ];
    mainContent.querySelectorAll(unwanted.join(',')).forEach(el => el.remove());
    // Eliminar listas vacías o de recomendación
    mainContent.querySelectorAll('ul, li').forEach(el => el.remove());

    // 3. Extraer título real (saltando encabezados genéricos)
    let title;
    const h2s = Array.from(document.querySelectorAll('h2'));
    for (const h2 of h2s) {
      const txt = h2.textContent.trim();
      if (/^Palabra de (Hoy|Ayer|Anteayer)$/i.test(txt)) continue;
      title = txt;
      break;
    }
    if (!title) {
      title = document.querySelector('h1')?.textContent.trim() || 'Palabra del Día';
    }

    // 4. Limpiar HTML restante (quitar clases, estilos, puntos suspensivos)
    let cleanHTML = mainContent.innerHTML
      .replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1')
      .replace(/class="[^"]*"/g, '')
      .replace(/style="[^"]*"/g, '')
      .replace(/…/g, '');

    if (cleanHTML.length < 150) {
      throw new Error('Contenido insuficiente después de la limpieza');
    }

    // 5. Fecha formateada (YYYY-MM-DD)
    const formattedDate = new Date().toISOString().split('T')[0];

    // 6. Responder con JSON limpio
    return res.status(200).json({
      title,
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
