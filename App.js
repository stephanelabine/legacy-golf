import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import BootScreen from "./src/screens/BootScreen.js";
import HomeScreen from "./src/screens/HomeScreen.js";
import ProfileScreen from "./src/screens/ProfileScreen.js";

import NewRoundScreen from "./src/screens/NewRoundScreen.js";
import ScoreEntryScreen from "./src/screens/ScoreEntryScreen.js";
import HistoryScreen from "./src/screens/HistoryScreen.js";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Boot" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Boot" component={BootScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />

        <Stack.Screen name="NewRound" component={NewRoundScreen} />
        <Stack.Screen name="ScoreEntry" component={ScoreEntryScreen} />
        <Stack.Screen name="History" component={HistoryScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
