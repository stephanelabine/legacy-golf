import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import BootScreen from "../screens/BootScreen";
import HomeScreen from "../screens/HomeScreen";
import ProfileScreen from "../screens/ProfileScreen";
import NewRoundScreen from "../screens/NewRoundScreen";
import ScoreEntryScreen from "../screens/ScoreEntryScreen";
import HistoryScreen from "../screens/HistoryScreen";

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
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
