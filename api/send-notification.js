// api/send-notification.js


import admin from "../firebaseAdmin.js";
const db = admin.firestore();


// Helper: fetch SW version for “update” notifications
async function getSWVersion() {
  try {
    const url = 'https://mision-vida-app.web.app/service-worker.js';
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const code = await resp.text();
    const m = code.match(/const\s+SW_VERSION\s*=\s*['"]([^'"]+)['"]/);
    return m ? m[1] : 'desconocida';
  } catch (e) {
    console.warn('No pude leer service-worker.js remoto:', e);
    return 'desconocida';
  }
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  let notificationData;
  if (req.method === "GET") {
    const { type } = req.query;
    switch (type) {
      case "daily":
        notificationData = {
          title: "📖 Palabra del Día",
          body:  "¡Tu devocional de hoy ya está disponible!",
          url:   "/",
          type:  "daily"
        };
        break;
      case "verse": {
        try {
          const file = await fs.readFile(new URL("./data/versiculos.json", import.meta.url), "utf-8");
          const list = JSON.parse(file).versiculos;
          const verse = list[Math.floor(Math.random() * list.length)];
          notificationData = {
            title:       "🙏 ¡Nuevo versículo del día!",
            body:        verse.texto,
            url:         "#versiculo",
            type:        "verse",
            verseText:   verse.texto,
            verseReference: verse.referencia,
            version:     verse.version || "RVR1960"
          };
        } catch (err) {
          console.error(err);
          return res.status(500).json({ error: "Error leyendo versiculos.json" });
        }
        break;
      }
      case "event":
        notificationData = {
          title: "🎉 ¡Nuevo evento!",
          body:  "¡Ya está disponible el nuevo evento para ver!",
          url:   "#eventos",
          type:  "event"
        };
        break;
      case "news":
        notificationData = {
          title: "📰 ¡Hay noticias nuevas!",
          body:  "Visita la sección de noticias para más información.",
          url:   "#noticias",
          type:  "news"
        };
        break;
      case "update": {
        const version = await getSWVersion();
        notificationData = {
          title:   "⚙️ ¡Nueva versión disponible!",
          body:    `Se ha publicado la versión ${version}.`,
          url:     "/",
          type:    "update",
          version
        };
        break;
      }
      case "live": {
        const YT_API_KEY    = process.env.YT_API_KEY;
        const CHANNEL_ID    = process.env.YT_CHANNEL_ID;
        let liveLink        = "#live";
        try {
          const ytRes  = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CHANNEL_ID}&eventType=live&type=video&key=${YT_API_KEY}`);
          const ytData = await ytRes.json();
          if (ytData.items?.length) {
            liveLink = `https://www.youtube.com/watch?v=${ytData.items[0].id.videoId}`;
          }
        } catch (e) {
          console.warn(e);
        }
        notificationData = {
          title: "🎥 ¡Estamos en vivo!",
          body:  "Únete a la transmisión del culto ahora mismo.",
          url:   liveLink,
          type:  "live"
        };
        break;
      }
      case "Culto":
        notificationData = {
          title: "🏚️ ¡Hoy hay culto!",
          body:  "¡Te esperamos en casa de vida hoy!",
          url:   "#Culto",
          type:  "Culto"
        };
        break;
      case "CultoEspecial":
        notificationData = {
          title: "⛪ ¡Culto Especial hoy!",
          body:  "¡No te pierdas la reunión especial!",
          url:   "#CultoEspecial",
          type:  "CultoEspecial"
        };
        break;
      case "Contacto":
        notificationData = {
          title: "📩 Nuevo mensaje de contacto",
          body:  "Tienes un nuevo mensaje desde la web.",
          url:   "#contacto",
          type:  "Contacto"
        };
        break;
      case "Contacto":
        notificationData = {
          title: "📬 Nuevo Pedido de Oracion",
          body:  "Tienes un nuevo Pedido de Oracion.",
          url:   "#oracion",
          type:  "Oracion"
        };
        break;
      default:
        return res.status(400).json({ error: "Tipo de notificación inválido" });
    }
  } else {
    return res.status(405).json({ error: "Método no permitido" });
  }

  // Determine topic to send to only admin tokens
  const topicMap = {
    daily:         "daily",
    verse:         "verse",
    event:         "event",
    live:          "live",
    news:          "news",
    update:        "updates",
    Culto:         "Culto",
    CultoEspecial: "CultoEspecial",
    Contacto:      "Contacto",
    Oracion:       "Oracion"
  };
  const topic = topicMap[notificationData.type];
  if (!topic) 
    return res.status(400).json({ error: "Topic no configurado para este tipo" });

  // Fetch admin user tokens
  try {
    const adminsSnap = await db.collection("users")
      .where("role", "==", "admin")
      .get();

    let tokens = [];
    adminsSnap.forEach(doc => {
      const u = doc.data();
      if (Array.isArray(u.tokens)) tokens.push(...u.tokens);
    });
    tokens = [...new Set(tokens)];
    if (!tokens.length) 
      return res.status(200).json({ message: "No hay tokens de admin." });

    const payload = {
      notification: {
        title: notificationData.title,
        body:  notificationData.body
      },
      data: {
        url: notificationData.url,
        type: notificationData.type,
        timestamp: Date.now().toString(),
        ...(notificationData.verseText    && { verseText: notificationData.verseText }),
        ...(notificationData.verseReference && { verseReference: notificationData.verseReference })
      }
    };

    console.log("Tokens admin a enviar:", tokens);
    if (!Array.isArray(tokens) || tokens.length === 0) {
      console.warn("⚠️ No hay tokens de admin válidos.");
      return res.status(200).json({ message: "No hay tokens de admin." });
    }

    // Máximo de 500 tokens por petición
    const BATCH_SIZE = 500;
    let allResults = [];

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const chunk = tokens.slice(i, i + BATCH_SIZE);
      console.log(`Enviando lote ${i / BATCH_SIZE + 1} con ${chunk.length} tokens…`);
      const resp = await admin.messaging().sendToDevice(chunk, payload);
      allResults = allResults.concat(resp.results);
    }

    return res.status(200).json({
      ok: true,
      totalTokens: tokens.length,
      batches: Math.ceil(tokens.length / BATCH_SIZE),
      results: allResults
    });

  } catch (err) {
    console.error("❌ Error enviando notificación a admins:", err);
    return res.status(500).json({ error: err.message });
  }
}  // <-- cierra tu función handler aquí

