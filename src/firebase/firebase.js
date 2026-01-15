// src/firebase/firebase.js
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp, getApp, getApps } from "firebase/app";
import { initializeAuth, getAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

function pickFirebaseConfig() {
  const extra =
    (Constants?.expoConfig && Constants.expoConfig.extra) ||
    (Constants?.manifest && Constants.manifest.extra) ||
    {};

  // Option A: put config in app.json/app.config.js under expo.extra.firebaseConfig
  const fromExtra = extra.firebaseConfig || extra.firebase || null;
  if (fromExtra && typeof fromExtra === "object") return fromExtra;

  // Option B: use Expo public env vars in .env
  const fromEnv = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  };

  const envLooksSet = Object.values(fromEnv).every((v) => typeof v === "string" && v.length > 0);
  if (envLooksSet) return fromEnv;

  return null;
}

const firebaseConfig = pickFirebaseConfig();

if (!firebaseConfig) {
  throw new Error(
    "Missing Firebase config. Add expo.extra.firebaseConfig in app.json/app.config.js OR set EXPO_PUBLIC_FIREBASE_* vars in .env"
  );
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let auth;
try {
  auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
} catch (e) {
  // If auth was already initialized elsewhere, fall back safely
  auth = getAuth(app);
}

const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
