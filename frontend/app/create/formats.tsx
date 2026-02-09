import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../src/components/Header';
import { useTournamentStore, Tournament, Round } from '../../src/store/tournamentStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FORMATS = ['Scorecard', 'Poker'];

export default function CreateFormats() {
  const router = useRouter();
  const { createTournament, updateTournament, setActiveTournament } = useTournamentStore();
  const [draft, setDraft] = useState<any>(null);
  const [activeRound, setActiveRound] = useState(0);
  const [formatsByRound, setFormatsByRound] = useState<Record<number, Record<string, string>>>({});

  useEffect(() => {
    loadDraft();
  }, []);

  const loadDraft = async () => {
    const draftJson = await AsyncStorage.getItem('lg_createDraft');
    if (draftJson) {
      const d = JSON.parse(draftJson);
      setDraft(d);
      
      // Initialize formats
      const initialFormats: Record<number, Record<string, string>> = {};
      for (let r = 0; r < d.roundsCount; r++) {
        initialFormats[r] = {};
        const existingFormats = d.rounds?.[r]?.formatsByHole || {};
        for (let h = 1; h <= d.holesPerRound; h++) {
          initialFormats[r][h.toString()] = existingFormats[h.toString()] || 'Scorecard';
        }
      }
      setFormatsByRound(initialFormats);
    }
  };

  const setFormat = (hole: number, format: string) => {
    setFormatsByRound((prev) => ({
      ...prev,
      [activeRound]: {
        ...prev[activeRound],
        [hole.toString()]: format,
      },
    }));
  };

  const setAllFormats = (format: string) => {
    if (!draft) return;
    const updated: Record<string, string> = {};
    for (let h = 1; h <= draft.holesPerRound; h++) {
      updated[h.toString()] = format;
    }
    setFormatsByRound((prev) => ({
      ...prev,
      [activeRound]: updated,
    }));
  };

  const handleFinish = async () => {
    if (!draft) return;

    try {
      // Build rounds with formats
      const rounds: Round[] = draft.rounds.map((r: any, idx: number) => ({
        ...r,
        formatsByHole: formatsByRound[idx] || {},
      }));

      if (draft.id) {
        // Updating existing tournament
        await updateTournament(draft.id, {
          name: draft.name,
          date: draft.date,
          location: draft.location,
          roundsCount: draft.roundsCount,
          holesPerRound: draft.holesPerRound,
          players: draft.players,
          rounds,
        });
        await setActiveTournament(draft.id);
        await AsyncStorage.removeItem('lg_createDraft');
        router.replace(`/tournament/${draft.id}`);
      } else {
        // Creating new tournament
        const tournament = await createTournament({
          name: draft.name,
          date: draft.date,
          location: draft.location,
          roundsCount: draft.roundsCount,
          holesPerRound: draft.holesPerRound,
          players: draft.players,
          rounds,
        });
        await setActiveTournament(tournament.id);
        await AsyncStorage.removeItem('lg_createDraft');
        router.replace(`/tournament/${tournament.id}`);
      }
    } catch (error) {
      console.error('Error creating tournament:', error);
      Alert.alert('Error', 'Failed to create tournament');
    }
  };

  if (!draft) return null;

  const currentFormats = formatsByRound[activeRound] || {};
  const holes = Array.from({ length: draft.holesPerRound }, (_, i) => i + 1);

  return (
    <View style={styles.container}>
      <Header title="Hole Formats" showBack />
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Progress Indicator */}
        <View style={styles.progress}>
          <View style={[styles.progressDot, styles.progressDotDone]} />
          <View style={[styles.progressLine, styles.progressLineDone]} />
          <View style={[styles.progressDot, styles.progressDotDone]} />
          <View style={[styles.progressLine, styles.progressLineDone]} />
          <View style={[styles.progressDot, styles.progressDotDone]} />
          <View style={[styles.progressLine, styles.progressLineDone]} />
          <View style={[styles.progressDot, styles.progressDotActive]} />
        </View>
        <Text style={styles.stepText}>Step 4 of 4: Formats</Text>

        {/* Round Tabs */}
        {draft.roundsCount > 1 && (
          <View style={styles.roundTabs}>
            {Array.from({ length: draft.roundsCount }, (_, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.roundTab, activeRound === i && styles.roundTabActive]}
                onPress={() => setActiveRound(i)}
              >
                <Text style={[styles.roundTabText, activeRound === i && styles.roundTabTextActive]}>
                  Round {i + 1}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Quick Set All */}
        <View style={styles.quickSetSection}>
          <Text style={styles.quickSetLabel}>Set all holes to:</Text>
          <View style={styles.quickSetButtons}>
            {FORMATS.map((format) => (
              <TouchableOpacity
                key={format}
                style={styles.quickSetButton}
                onPress={() => setAllFormats(format)}
              >
                <Text style={styles.quickSetButtonText}>{format}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Holes Grid */}
        <View style={styles.holesGrid}>
          {holes.map((hole) => (
            <View key={hole} style={styles.holeCard}>
              <Text style={styles.holeNumber}>Hole {hole}</Text>
              <View style={styles.formatButtons}>
                {FORMATS.map((format) => (
                  <TouchableOpacity
                    key={format}
                    style={[
                      styles.formatButton,
                      currentFormats[hole.toString()] === format && styles.formatButtonActive,
                    ]}
                    onPress={() => setFormat(hole, format)}
                  >
                    <Text
                      style={[
                        styles.formatButtonText,
                        currentFormats[hole.toString()] === format && styles.formatButtonTextActive,
                      ]}
                    >
                      {format}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.finishButton} onPress={handleFinish}>
          <Ionicons name="checkmark-circle" size={22} color="#fff" />
          <Text style={styles.finishButtonText}>
            {draft.id ? 'Save Changes' : 'Create Tournament'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E5E5EA',
  },
  progressDotActive: {
    backgroundColor: '#1B4332',
  },
  progressDotDone: {
    backgroundColor: '#34C759',
  },
  progressLine: {
    width: 40,
    height: 2,
    backgroundColor: '#E5E5EA',
  },
  progressLineDone: {
    backgroundColor: '#34C759',
  },
  stepText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  roundTabs: {
    flexDirection: 'row',
    backgroundColor: '#E5E5EA',
    borderRadius: 10,
    padding: 2,
    marginBottom: 16,
  },
  roundTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  roundTabActive: {
    backgroundColor: '#fff',
  },
  roundTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  roundTabTextActive: {
    color: '#1B4332',
    fontWeight: '600',
  },
  quickSetSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  quickSetLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 10,
  },
  quickSetButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  quickSetButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    alignItems: 'center',
  },
  quickSetButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1B4332',
  },
  holesGrid: {
    gap: 8,
  },
  holeCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  holeNumber: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    width: 70,
  },
  formatButtons: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
  },
  formatButton: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#F2F2F7',
    borderRadius: 6,
    alignItems: 'center',
  },
  formatButtonActive: {
    backgroundColor: '#1B4332',
  },
  formatButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  formatButtonTextActive: {
    color: '#fff',
  },
  footer: {
    padding: 20,
    paddingBottom: 34,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C6C6C8',
  },
  finishButton: {
    backgroundColor: '#1B4332',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  finishButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
