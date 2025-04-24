import fetch from 'node-fetch';

import { JSDOM } from 'jsdom';


export default async function handler(req, res) {

  // Habilitar CORS

  res.setHeader('Access-Control-Allow-Origin', '*');

  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');


  // Responder a preflight

  if (req.method === 'OPTIONS') {

    return res.status(200).end();

  }


  if (req.method !== 'GET') {

    return res.status(405).json({ error: 'Método no permitido' });

  }


  try {

    const sourceUrl = 'https://www.bibliaon.com/es/palabra_del_dia/';

    const response = await fetch(sourceUrl);

    const html = await response.text();

    const { document } = new JSDOM(html).window;


    const extract = sel => document.querySelector(sel)?.textContent.trim() || '';


    res.json({

      title: extract('.daily-suptitle') || 'Palabra del Día',

      content: extract('.daily-content').replace(/\s+/g, ' '),

      date: extract('.daily-date') || new Date().toLocaleDateString(),

      source: sourceUrl

    });

  } catch (error) {

    console.error('Error:', error);

    res.status(500).json({ error: 'No se pudo obtener el devocional', details: error.message });

  }

}
