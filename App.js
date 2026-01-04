import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import RootNavigator from "./src/navigation/RootNavigator";
import SplashOverlay from "./src/components/SplashOverlay";

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 2500); // ← slower
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>

      {showSplash ? <SplashOverlay /> : null}
    </View>
  );
}
