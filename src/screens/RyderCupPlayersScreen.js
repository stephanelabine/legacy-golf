// src/screens/RyderCupPlayersScreen.js
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";

function makePlayerId() {
    return `player_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

export default function RyderCupPlayersScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { scheme, theme } = useTheme();
    const isDark = scheme === "dark";

    const eventId = String(route?.params?.eventId || "").trim();
    const eventName = String(route?.params?.eventName || "").trim();
    const inviteCode = String(route?.params?.inviteCode || "").trim();
    const organizerName = String(route?.params?.organizerName || "").trim();
    const organizerEmail = String(route?.params?.organizerEmail || "").trim();
    const organizerPhone = String(route?.params?.organizerPhone || "").trim();
    const organizerHandicap = String(route?.params?.organizerHandicap || "").trim();
    const status = String(route?.params?.status || "setup").trim();
    const courseMode = String(route?.params?.courseMode || "single").trim();
    const teeMode = String(route?.params?.teeMode || "single").trim();
    const sessions = Array.isArray(route?.params?.sessions) ? route.params.sessions : [];

    const [playerName, setPlayerName] = useState("");
    const [playerEmail, setPlayerEmail] = useState("");
    const [playerPhone, setPlayerPhone] = useState("");
    const [playerHandicap, setPlayerHandicap] = useState("");
    const [players, setPlayers] = useState([]);

    const canAddPlayer = playerName.trim().length > 0;
    const canContinue = players.length >= 2;

    const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

    function addPlayer() {
        if (!canAddPlayer) return;

        const nextPlayer = {
            id: makePlayerId(),
            name: playerName.trim(),
            email: playerEmail.trim(),
            phone: playerPhone.trim(),
            handicap: playerHandicap.trim(),
        };

        setPlayers((prev) => [...prev, nextPlayer]);
        setPlayerName("");
        setPlayerEmail("");
        setPlayerPhone("");
        setPlayerHandicap("");
    }

    const styles = useMemo(() => {
        return StyleSheet.create({
            screen: {
                flex: 1,
                backgroundColor: theme.bg,
            },

            content: {
                paddingHorizontal: 16,
                paddingTop: 10,
                paddingBottom: 140,
            },

            heroCard: {
                borderRadius: 20,
                padding: 18,
                borderWidth: 1,
                borderColor: "rgba(140,175,255,0.78)",
                backgroundColor: "rgba(40,68,145,0.28)",
            },

            heroTitle: {
                color: "#FFFFFF",
                fontSize: 22,
                fontWeight: "900",
            },

            heroSub: {
                marginTop: 8,
                color: "rgba(255,255,255,0.86)",
                fontSize: 14,
                fontWeight: "700",
                lineHeight: 20,
            },

            section: {
                marginTop: 16,
                borderRadius: 20,
                padding: 16,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.card2,
            },

            sectionTitle: {
                color: theme.text,
                fontSize: 13,
                fontWeight: "900",
                letterSpacing: 1.1,
                textTransform: "uppercase",
                opacity: 0.82,
            },

            fieldBlock: {
                marginTop: 14,
            },

            label: {
                color: theme.text,
                fontSize: 12,
                fontWeight: "900",
                letterSpacing: 0.5,
                opacity: 0.82,
                marginBottom: 8,
                textTransform: "uppercase",
            },

            input: {
                height: 54,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.card,
                paddingHorizontal: 14,
                color: theme.text,
                fontSize: 15,
                fontWeight: "700",
            },

            addBtn: {
                marginTop: 16,
                height: 50,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: canAddPlayer
                    ? (isDark ? "rgba(255,210,92,0.92)" : "rgba(255,210,92,1)")
                    : (isDark ? "rgba(255,255,255,0.10)" : "rgba(10,15,26,0.08)"),
                borderWidth: canAddPlayer ? 0 : 1,
                borderColor: canAddPlayer ? "transparent" : theme.border,
            },

            addBtnText: {
                color: canAddPlayer ? "rgba(10,15,26,0.92)" : theme.text,
                opacity: canAddPlayer ? 1 : 0.48,
                fontSize: 15,
                fontWeight: "900",
                letterSpacing: 0.3,
            },

            helper: {
                marginTop: 10,
                color: theme.text,
                opacity: 0.7,
                fontSize: 13,
                fontWeight: "700",
                lineHeight: 18,
            },

            playerCard: {
                marginTop: 12,
                borderRadius: 16,
                padding: 14,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.card,
            },

            playerName: {
                color: theme.text,
                fontSize: 16,
                fontWeight: "900",
            },

            playerMeta: {
                marginTop: 6,
                color: theme.text,
                opacity: 0.72,
                fontSize: 13,
                fontWeight: "700",
                lineHeight: 18,
            },

            footer: {
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                paddingHorizontal: 16,
                paddingTop: 12,
                paddingBottom: footerPad,
                backgroundColor: theme.bg,
                borderTopWidth: 1,
                borderTopColor: theme.divider,
            },

            primaryBtn: {
                height: 56,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: canContinue
                    ? (isDark ? "rgba(46,125,255,0.92)" : "rgba(10,15,26,0.92)")
                    : (isDark ? "rgba(255,255,255,0.10)" : "rgba(10,15,26,0.08)"),
                borderWidth: canContinue ? 0 : 1,
                borderColor: canContinue ? "transparent" : theme.border,
            },

            primaryBtnDisabled: {
                opacity: 0.72,
            },

            primaryText: {
                color: canContinue ? "#FFFFFF" : theme.text,
                opacity: canContinue ? 1 : 0.48,
                fontSize: 16,
                fontWeight: "900",
                letterSpacing: 0.3,
            },

            pressed: {
                opacity: 0.92,
                transform: [{ scale: 0.99 }],
            },
        });
    }, [theme, isDark, footerPad, canAddPlayer, canContinue]);

    function onContinue() {
        if (!canContinue) return;

        navigation.navigate(ROUTES.RYDER_CUP_TEAMS, {
            eventId,
            eventName,
            inviteCode,
            organizerName,
            organizerEmail,
            organizerPhone,
            organizerHandicap,
            status,
            courseMode,
            teeMode,
            sessions,
            players,
        });
    }

    return (
        <View style={styles.screen}>
            <ScreenHeader
                navigation={navigation}
                title="Ryder Cup Players"
                subtitle="Add the full player roster for your event."
            />

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.heroCard}>
                    <Text style={styles.heroTitle}>Player Roster</Text>
                    <Text style={styles.heroSub}>
                        Add every player who will participate in this Ryder Cup event before assigning teams.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Add Player</Text>

                    <View style={styles.fieldBlock}>
                        <Text style={styles.label}>Player Name</Text>
                        <TextInput
                            value={playerName}
                            onChangeText={setPlayerName}
                            placeholder="Enter player name"
                            placeholderTextColor={isDark ? "rgba(255,255,255,0.34)" : "rgba(10,15,26,0.34)"}
                            style={styles.input}
                            returnKeyType="next"
                        />
                    </View>

                    <View style={styles.fieldBlock}>
                        <Text style={styles.label}>Email</Text>
                        <TextInput
                            value={playerEmail}
                            onChangeText={setPlayerEmail}
                            placeholder="Enter email"
                            placeholderTextColor={isDark ? "rgba(255,255,255,0.34)" : "rgba(10,15,26,0.34)"}
                            style={styles.input}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            returnKeyType="next"
                        />
                    </View>

                    <View style={styles.fieldBlock}>
                        <Text style={styles.label}>Phone</Text>
                        <TextInput
                            value={playerPhone}
                            onChangeText={setPlayerPhone}
                            placeholder="Enter phone"
                            placeholderTextColor={isDark ? "rgba(255,255,255,0.34)" : "rgba(10,15,26,0.34)"}
                            style={styles.input}
                            keyboardType="phone-pad"
                            returnKeyType="next"
                        />
                    </View>

                    <View style={styles.fieldBlock}>
                        <Text style={styles.label}>Handicap</Text>
                        <TextInput
                            value={playerHandicap}
                            onChangeText={setPlayerHandicap}
                            placeholder="Enter handicap"
                            placeholderTextColor={isDark ? "rgba(255,255,255,0.34)" : "rgba(10,15,26,0.34)"}
                            style={styles.input}
                            keyboardType="decimal-pad"
                            returnKeyType="done"
                        />
                    </View>

                    <Pressable
                        onPress={addPlayer}
                        disabled={!canAddPlayer}
                        style={({ pressed }) => [
                            styles.addBtn,
                            pressed && canAddPlayer && styles.pressed,
                        ]}
                    >
                        <Text style={styles.addBtnText}>Add Player</Text>
                    </Pressable>

                    <Text style={styles.helper}>
                        Add at least 2 players to continue. You’ll assign teams on the next screen.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Roster</Text>

                    {players.length === 0 ? (
                        <Text style={styles.helper}>No players added yet.</Text>
                    ) : (
                        players.map((player) => (
                            <View key={player.id} style={styles.playerCard}>
                                <Text style={styles.playerName}>{player.name}</Text>
                                <Text style={styles.playerMeta}>
                                    {(player.handicap ? `Hdcp ${player.handicap}` : "No handicap") +
                                        (player.email ? ` • ${player.email}` : "") +
                                        (player.phone ? ` • ${player.phone}` : "")}
                                </Text>
                            </View>
                        ))
                    )}
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <Pressable
                    onPress={onContinue}
                    disabled={!canContinue}
                    style={({ pressed }) => [
                        styles.primaryBtn,
                        !canContinue && styles.primaryBtnDisabled,
                        pressed && canContinue && styles.pressed,
                    ]}
                >
                    <Text style={styles.primaryText}>Continue to Teams</Text>
                </Pressable>
            </View>
        </View>
    );
}