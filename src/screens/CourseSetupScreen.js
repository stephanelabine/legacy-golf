// src/screens/CourseSetupScreen.js
import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Modal, TextInput, FlatList, Platform, KeyboardAvoidingView, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { db } from '../firebase/firebase';
import { collection, query, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { searchCoursesUnified } from '../services/courseSearch';
import ROUTES from '../navigation/routes';

export default function CourseSetupScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { scheme, theme } = useTheme();
    const isDark = scheme === 'dark';
    const tournamentId = route?.params?.tournamentId;

    const [roundDocs, setRoundDocs] = useState([]);
    const [courseResults, setCourseResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [qText, setQText] = useState("");
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerRound, setPickerRound] = useState(1);
    const [saving, setSaving] = useState(false);

    const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

    useEffect(() => {
        if (!tournamentId) return;

        const rref = collection(db, 'tournaments', tournamentId, 'rounds');
        const rq = query(rref);

        const unsub = onSnapshot(rq, (snap) => {
            const rows = [];
            snap.forEach((doc) => rows.push(doc.data()));
            setRoundDocs(rows);
        });

        return () => unsub();
    }, [tournamentId]);

    useEffect(() => {
        if (!pickerOpen) return;

        let cancelled = false;
        let timer = null;

        async function run() {
            setSearching(true);
            try {
                const list = await searchCoursesUnified(qText, { limit: 50 });
                if (!cancelled) setCourseResults(list || []);
            } catch (e) {
                if (!cancelled) setCourseResults([]);
            } finally {
                if (!cancelled) setSearching(false);
            }
        }

        timer = setTimeout(run, 350);

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [pickerOpen, qText]);

    const setCourseForRound = async (roundIndex, course) => {
        if (!tournamentId || saving) return;

        setSaving(true);
        const courseId = course?.id;
        const courseName = course?.name || "Course";

        if (!courseId) {
            Alert.alert("Error", "Missing course ID");
            return;
        }

        try {
            await setDoc(
                doc(db, 'tournaments', tournamentId, 'rounds', `r${roundIndex}`),
                {
                    courseId,
                    courseName,
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );

            setPickerOpen(false);
            Keyboard.dismiss();
        } catch (e) {
            Alert.alert("Save failed", "Could not set course for this round.");
        } finally {
            setSaving(false);
        }
    };

    const renderCoursePickRow = ({ item }) => {
        const courseName = item?.name || "Unknown Course";

        return (
            <Pressable
                onPress={() => setCourseForRound(pickerRound, item)}
                style={({ pressed }) => [styles.courseRow, pressed && styles.pressed]}
            >
                <Text style={styles.courseRowTitle}>{courseName}</Text>
            </Pressable>
        );
    };

    const onNext = () => {
        // Handle navigation to the next screen, e.g., Tee Selection
        navigation.navigate(ROUTES.TEE_SELECTION, { tournamentId });
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Course Setup</Text>
            <FlatList
                data={roundDocs}
                keyExtractor={(item, index) => `round-${index}`}
                renderItem={({ item, index }) => (
                    <Pressable onPress={() => { setPickerRound(index + 1); setPickerOpen(true); }}>
                        <View style={styles.roundBlock}>
                            <Text style={styles.roundLabel}>Round {index + 1}</Text>
                            <Text style={styles.courseLabel}>{item?.courseName || 'No Course Selected'}</Text>
                        </View>
                    </Pressable>
                )}
            />

            <Pressable style={styles.button} onPress={onNext}>
                <Text style={styles.buttonText}>Next: Tees Setup</Text>
            </Pressable>

            <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setPickerOpen(false)}>
                    <KeyboardAvoidingView style={styles.modalContent} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                        <TextInput
                            value={qText}
                            onChangeText={setQText}
                            style={styles.searchInput}
                            placeholder="Search courses"
                        />
                        <FlatList
                            data={courseResults}
                            keyExtractor={(item) => item.id}
                            renderItem={renderCoursePickRow}
                            keyboardShouldPersistTaps="handled"
                        />
                    </KeyboardAvoidingView>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    title: { fontSize: 24, fontWeight: 'bold' },
    roundBlock: { marginBottom: 20 },
    roundLabel: { fontSize: 18 },
    courseLabel: { fontSize: 14, color: 'gray' },
    button: { backgroundColor: '#007BFF', padding: 15, borderRadius: 8 },
    buttonText: { color: '#fff', fontSize: 18 },
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)' },
    modalContent: { width: '80%', backgroundColor: '#fff', padding: 20, borderRadius: 10 },
    searchInput: { borderWidth: 1, padding: 10, marginBottom: 10 },
    pressed: { opacity: 0.7 },
    courseRow: { padding: 15, borderBottomWidth: 1, borderColor: '#ddd' },
});

