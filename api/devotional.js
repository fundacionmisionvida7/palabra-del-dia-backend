import fetch from 'node-fetch'; import { JSDOM } from 'jsdom';

export default async function handler(req, res) { // Habilitar CORS res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

if (req.method === 'OPTIONS') { return res.status(200).end(); } if (req.method !== 'GET') { return res.status(405).json({ error: 'Método no permitido' }); }

try { const sourceUrl = 'https://www.bibliaon.com/es/palabra_del_dia/'; const response = await fetch(sourceUrl); const html = await response.text(); const { document } = new JSDOM(html).window;

// Título y fecha const title = document.querySelector('.daily-suptitle')?.textContent.trim() || 'Palabra del Día'; const date = document.querySelector('.daily-date')?.textContent.trim() || new Date().toLocaleDateString(); // Extraer contenido hasta el siguiente h2 (Palabra de Ayer) const contentContainer = document.querySelector('.daily-content'); const children = Array.from(contentContainer.children); const snippetElems = []; for (const el of children) { if (el.tagName.toLowerCase() === 'h2' && snippetElems.length > 0) { break; } snippetElems.push(el); } const htmlContent = snippetElems.map(el => el.outerHTML).join(''); return res.json({ title, date, html: htmlContent, source: sourceUrl }); 

} catch (error) { console.error('Error al obtener devocional:', error); return res.status(500).json({ error: 'No se pudo obtener el devocional', details: error.message }); } }

