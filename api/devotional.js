import fetch from 'node-fetch'; import { JSDOM } from 'jsdom';

export default async function handler(req, res) { // Permitir CORS res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

if (req.method === 'OPTIONS') { return res.status(200).end(); } if (req.method !== 'GET') { return res.status(405).json({ error: 'Método no permitido' }); }

try { const sourceUrl = 'https://www.bibliaon.com/es/palabra_del_dia/'; const response = await fetch(sourceUrl); const html = await response.text(); const { document } = new JSDOM(html).window;

const title = document.querySelector('.daily-suptitle')?.textContent.trim() || 'Palabra del Día'; const date = document.querySelector('.daily-date')?.textContent.trim() || new Date().toLocaleDateString(); // Contenedor principal de contenido const contentContainer = document.querySelector('.daily-content'); // Extraer solo el primer párrafo como versículo destacado const verseEl = contentContainer.querySelector('p'); const verse = verseEl ? verseEl.textContent.trim() : ''; // Extraer reflexión: resto de párrafos, sin listas ni menciones de "versículos" const reflectionParas = Array.from(contentContainer.querySelectorAll('p')) .slice(1) .filter(p => !/versículos?/i.test(p.textContent)) .map(p => p.textContent.trim()); const reflection = reflectionParas.join('\n\n'); return res.json({ title, verse, reflection, date, source: sourceUrl }); 

} catch (error) { console.error('Error al obtener devocional:', error); return res.status(500).json({ error: 'No se pudo obtener el devocional', details: error.message }); } }

