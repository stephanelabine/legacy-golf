import React, { useEffect } from "react";
import * as SplashScreen from "expo-splash-screen";

import RootNavigator from "./src/navigation/RouteNavigator.js";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return <RootNavigator />;
}
