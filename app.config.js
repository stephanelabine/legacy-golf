// app.config.js
module.exports = ({ config }) => {
  return {
    ...config,
    extra: {
      ...(config.extra || {}),
      firebase: {
        apiKey:  "AIzaSyA11y-RDPYlIZ30K7X1l37C0J76gtkV1o4",
        authDomain:"legacy-golf-dev.firebaseapp.com",
        projectId:  "legacy-golf-dev",
        storageBucket:  "legacy-golf-dev.firebasestorage.app",
        messagingSenderId: "87329359611",
        appId: "1:87329359611:web:36ea3311124453e980925e"
      },
    },
  };
};
