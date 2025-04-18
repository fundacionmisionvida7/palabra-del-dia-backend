import Cors from 'micro-cors'
import admin from '../firebaseAdmin.js'

// Configuramos CORS para POST y OPTIONS
const cors = Cors({
  allowMethods: ['POST','OPTIONS']
})

async function handler(req, res) {
  // Ahora, micro-cors ya habrá añadido los headers
  // Respondemos al preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).end('Método no permitido')
  }

  const subscription = req.body
  try {
    const db = admin.firestore()
    const ref = db.collection('pushSubscriptions').doc(subscription.endpoint)
    await ref.set(subscription, { merge: true })
    res.status(200).json({ success: true })
  } catch (error) {
    console.error('Error al guardar suscripción:', error)
    res.status(500).json({ success: false, error: error.message })
  }
}

// Exportamos la función envuelta en CORS
export default cors(handler)
