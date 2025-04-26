// firebaseAdmin.js
import admin from 'firebase-admin';

// Inicializar Firebase Admin solo una vez
let firebaseApp;

if (!admin.apps.length) {
  try {
    // 1) Leer directamente la variable de entorno
    const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (!serviceAccountRaw) {
      throw new Error('❌ Debes definir FIREBASE_SERVICE_ACCOUNT en tus env vars');
    }
    
    // 2) Parsear a objeto
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountRaw);
    } catch (e) {
      console.error('❌ FIREBASE_SERVICE_ACCOUNT no es un JSON válido:', e);
      throw e;
    }
    
    // 3) Verificar que tenga los campos necesarios
    if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
      console.error('❌ El objeto serviceAccount no tiene los campos requeridos');
      console.error('Campos disponibles:', Object.keys(serviceAccount));
      throw new Error('Configuración de Firebase incompleta');
    }
    
    // 4) Inicializar Firebase Admin
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    
    console.log('✅ Firebase Admin inicializado correctamente');
    console.log(`📱 Proyecto: ${serviceAccount.project_id}`);
    
    // 5) Verificar que podemos acceder a Firestore y Messaging
    const db = admin.firestore();
    const messaging = admin.messaging();
    
    console.log('✅ Firestore y Messaging disponibles');
  } catch (error) {
    console.error('❌ Error al inicializar Firebase Admin:', error);
    
    // Intentar inicializar con otra configuración si está disponible
    if (process.env.FIREBASE_PROJECT_ID && 
        process.env.FIREBASE_CLIENT_EMAIL && 
        process.env.FIREBASE_PRIVATE_KEY) {
      
      try {
        console.log('🔄 Intentando inicializar con variables separadas...');
        
        firebaseApp = admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          }),
        });
        
        console.log('✅ Firebase Admin inicializado con variables separadas');
      } catch (backupError) {
        console.error('❌ Error en el método de respaldo:', backupError);
        throw backupError;
      }
    } else {
      throw error;
    }
  }
}

export default admin;
