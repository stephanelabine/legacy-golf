// app.config.js
require("dotenv").config();

module.exports = ({ config }) => {
  const apiKey =
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_API_KEY ||
    "";

  if (!apiKey) {
    // Fail fast with a clear message instead of Firebase exploding later
    throw new Error(
      "Firebase config missing apiKey. Set EXPO_PUBLIC_FIREBASE_API_KEY in .env, then restart Expo with: npx expo start -c"
    );
  }

  const existingPlugins = Array.isArray(config.plugins) ? config.plugins : [];

  // Ensure required native plugins are present (order not important)
  const mustHave = ["expo-font", "@react-native-community/datetimepicker"];

  const plugins = mustHave.reduce((arr, p) => {
    if (arr.includes(p)) return arr;
    return [...arr, p];
  }, existingPlugins);

  return {
    ...config,
    plugins,
    extra: {
      ...(config.extra || {}),
      firebase: {
        apiKey,
        authDomain: "legacy-golf-dev.firebaseapp.com",
        projectId: "legacy-golf-dev",
        storageBucket: "legacy-golf-dev.firebasestorage.app",
        messagingSenderId: "87329359611",
        appId: "1:87329359611:web:36ea3311124453e980925e",
      },
    },
  };
};
