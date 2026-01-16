// src/firebase/firebase.js
import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import Constants from "expo-constants";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";

function getExtraFirebase() {
  return Constants?.expoConfig?.extra?.firebase || Constants?.manifest?.extra?.firebase || {};
}

const extraFirebase = getExtraFirebase();

const firebaseConfig = {
  apiKey: extraFirebase.apiKey,
  authDomain: extraFirebase.authDomain,
  projectId: extraFirebase.projectId,
  storageBucket: extraFirebase.storageBucket,
  messagingSenderId: extraFirebase.messagingSenderId,
  appId: extraFirebase.appId,
};

if (!firebaseConfig.apiKey) {
  throw new Error(
    "Firebase config missing apiKey. Check app.config.js extra.firebase, then restart Expo with: npx expo start -c"
  );
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Auth with RN persistence
let auth;
try {
  const { initializeAuth, getReactNativePersistence } = require("firebase/auth");
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
} catch (e) {
  const { getAuth } = require("firebase/auth");
  auth = getAuth(app);
}

// Firestore
const db = getFirestore(app);

export { app, auth, db };
