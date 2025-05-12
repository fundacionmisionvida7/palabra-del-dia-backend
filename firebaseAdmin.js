// firebaseAdmin.js
import admin from 'firebase-admin';

// 1. Configurar con variables de entorno
const firebaseConfig = {
  projectId:        process.env.FIREBASE_PROJECT_ID,
  clientEmail:      process.env.FIREBASE_CLIENT_EMAIL,
  privateKey:       process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  storageBucket:    process.env.FIREBASE_STORAGE_BUCKET
};

// 2. Inicializar solo una vez
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(firebaseConfig),
    projectId:  firebaseConfig.projectId,    // 👈 Muy importante para HTTP v1
    storageBucket: firebaseConfig.storageBucket
  });
}

// 3. Exportar lo necesario
export const bucket = admin.storage().bucket();
export default admin;
