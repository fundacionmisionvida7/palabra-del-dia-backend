// firebaseAdmin.js
import admin from 'firebase-admin';

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

// 3) Inicializar admin si aún no está
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log('✅ Firebase Admin inicializado correctamente');
}

export default admin;
