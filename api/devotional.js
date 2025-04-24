export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sourceUrl = 'https://www.bibliaon.com/es/palabra_del_dia/';
    
    // 1. Fetch con headers de navegador real
    const response = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const html = await response.text();
    const { document } = new JSDOM(html).window;

    // 2. Selectores actualizados
    const title = document.querySelector('h1.daily-title')?.textContent.trim() || 'Palabra del Día';
    const dateElement = document.querySelector('.daily-date');
    const date = dateElement?.textContent.replace(/\D+/g, ' ').trim() || new Date().toLocaleDateString('es-ES');
    
    // 3. Validación crítica
    const mainContent = document.querySelector('.daily-content');
    if (!mainContent) throw new Error('Contenedor principal no encontrado');

    // 4. Limpieza segura
    const unwanted = mainContent.querySelectorAll('.ad, .adsbygoogle, script, style');
    unwanted.forEach(el => el.remove());

    // ... resto del código igual ...

    return res.json({ title, date, html: htmlContent });

  } catch (error) {
    console.error('Error completo:', {
      message: error.message,
      stack: error.stack,
      sourceUrl: sourceUrl || 'No URL'
    });
    return res.status(500).json({ 
      error: 'Contenido temporalmente no disponible',
      details: error.message 
    });
  }
}
