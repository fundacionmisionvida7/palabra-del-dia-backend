// firebaseAdmin.js
import admin from 'firebase-admin';

let serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountRaw && process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
  serviceAccountRaw = Buffer
    .from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64')
    .toString('utf8');
}

if (!serviceAccountRaw) {
  throw new Error('❌ Debes definir FIREBASE_SERVICE_ACCOUNT o FIREBASE_SERVICE_ACCOUNT_B64');
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountRaw);
} catch (e) {
  console.error('❌ No es un JSON válido:', e);
  throw e;
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("✅ Firebase Admin inicializado correctamente");
} else {
  console.log("⚠️ Firebase Admin ya estaba inicializado");
}

export default admin;

