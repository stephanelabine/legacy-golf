// src/firebase/firebase.js
import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import Constants from "expo-constants";

function maskKey(k) {
  const s = String(k || "");
  if (!s) return "(missing)";
  const head = s.slice(0, 6);
  const tail = s.slice(-4);
  return `${head}…${tail} (len ${s.length})`;
}

const extraFirebase =
  Constants?.expoConfig?.extra?.firebase ||
  Constants?.manifest?.extra?.firebase ||
  {};

const envKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
const extraKey = extraFirebase.apiKey;

const apiKey = envKey || extraKey;

const firebaseConfig = {
  apiKey,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || extraFirebase.authDomain,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || extraFirebase.projectId,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || extraFirebase.storageBucket,
  messagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || extraFirebase.messagingSenderId,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || extraFirebase.appId,
};

if (!firebaseConfig.apiKey) {
  throw new Error(
    "FIREBASE CONFIG CHECK:\n" +
      `apiKey: ${maskKey(firebaseConfig.apiKey)}\n` +
      `authDomain: ${firebaseConfig.authDomain || "(missing)"}\n` +
      `projectId: ${firebaseConfig.projectId || "(missing)"}\n` +
      `envKey present: ${!!envKey}\n` +
      `extraKey present: ${!!extraKey}`
  );
}

// Even if apiKey exists, show what we're using (masked) if Auth still errors later.
console.log(
  "[FIREBASE CONFIG CHECK]",
  {
    apiKey: maskKey(firebaseConfig.apiKey),
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
    envKeyPresent: !!envKey,
    extraKeyPresent: !!extraKey,
  }
);

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;
