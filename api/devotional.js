export default async function handler(req, res) {
  // ... Configuración CORS previa ...

  try {
    const sourceUrl = 'https://www.bibliaon.com/es/palabra_del_dia/';
    const response = await fetch(sourceUrl);
    const html = await response.text();
    const { document } = new JSDOM(html).window;

    // Extracción mejorada del título
    const title = document.querySelector('h1.daily-title')?.textContent.trim() 
                || 'Palabra del Día';

    // Nueva extracción de fecha
    const dateElement = document.querySelector('.daily-date');
    const date = dateElement?.textContent.replace(/\D+/g, ' ').trim() 
               || new Date().toLocaleDateString('es-ES');

    // Selección más precisa del contenido
    const mainContent = document.querySelector('.daily-content');
    
    // Limpieza de elementos no deseados
    const unwanted = mainContent.querySelectorAll(
      '.ad, .adsbygoogle, .sharedaddy, script, style'
    );
    unwanted.forEach(el => el.remove());

    // Nuevo método de extracción de contenido relevante
    const validElements = [];
    const allowedTags = ['P', 'H2', 'H3', 'BLOCKQUOTE', 'UL', 'STRONG', 'EM'];
    
    Array.from(mainContent.children).forEach(el => {
      if(allowedTags.includes(el.tagName)) {
        // Filtrar párrafos vacíos
        if(el.tagName === 'P' && el.textContent.trim().length < 30) return;
        
        // Convertir elementos de anuncios de texto en párrafos
        if(el.innerHTML.includes('Te puede interesar:')) {
          const cleanParagraph = document.createElement('p');
          cleanParagraph.textContent = el.textContent.replace('Te puede interesar:', '').trim();
          validElements.push(cleanParagraph);
        } else {
          validElements.push(el);
        }
      }
    });

    const htmlContent = validElements.map(el => el.outerHTML).join('');

    // Validación de contenido mínimo
    if(htmlContent.length < 300) {
      throw new Error('Contenido insuficiente obtenido de la fuente');
    }

    return res.json({
      title,
      date,
      html: htmlContent,
      source: sourceUrl
    });
    
  } catch (error) {
    console.error('Error mejorado:', error);
    return res.status(500).json({ 
      error: 'Contenido no disponible temporalmente',
      technicalDetails: error.message
    });
  }
}
