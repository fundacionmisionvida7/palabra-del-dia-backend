import admin from 'firebase-admin';

// Configuración usando variables de entorno
const firebaseConfig = {
  projectId:     process.env.FIREBASE_PROJECT_ID,
  clientEmail:   process.env.FIREBASE_CLIENT_EMAIL,
  privateKey:    process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
};

// Inicializar Admin SDK solo una vez
if (!admin.apps.length) {
  admin.initializeApp({
    credential:    admin.credential.cert(firebaseConfig),
    projectId:     firebaseConfig.projectId,    // necesario para HTTP v1
    storageBucket: firebaseConfig.storageBucket,
  });
  // Verificar projectId en los logs
  console.log('🔥 Firebase Admin inicializado con projectId:', admin.app().options.credential.projectId);
}

// Exportar bucket y admin para uso en funciones
export const bucket = admin.storage().bucket();
export default admin;
