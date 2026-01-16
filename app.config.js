// app.config.js
module.exports = ({ config }) => {
  return {
    ...config,
    extra: {
      ...(config.extra || {}),
      firebase: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_API_KEY,
        authDomain:"legacy-golf-dev.firebaseapp.com",
        projectId:  "legacy-golf-dev",
        storageBucket:  "legacy-golf-dev.firebasestorage.app",
        messagingSenderId: "87329359611",
        appId: "1:87329359611:web:36ea3311124453e980925e"
      },
    },
  };
};
