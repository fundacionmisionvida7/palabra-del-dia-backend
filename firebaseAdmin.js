import admin from 'firebase-admin';

let serviceAccount;

try {
  const raw = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8');
  serviceAccount = JSON.parse(raw);
} catch (e) {
  console.error('❌ Error cargando clave Firebase:', e);
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

