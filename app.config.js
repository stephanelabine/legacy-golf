// app.config.js
module.exports = ({ config }) => {
  return {
    ...config,
    extra: {
      ...(config.extra || {}),
      firebase: {
        apiKey: "REMOVED",
        authDomain:  "legacy-golf.firebaseapp.com",
        projectId: "legacy-golf",
        storageBucket: "legacy-golf.firebasestorage.app",
        messagingSenderId: "126362129345",
        appId: "1:126362129345:web:c02c8cfb87b4f97e2b5540"
      },
    },
  };
};
