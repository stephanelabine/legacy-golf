import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../../../../src/components/Header';
import { useTournamentStore, Tournament, Round } from '../../../../../src/store/tournamentStore';
import { FormatSplash } from '../../../../../src/components/FormatSplash';

export default function Scorecard() {
  const { id, roundIndex } = useLocalSearchParams<{ id: string; roundIndex: string }>();
  const router = useRouter();
  const { tournaments, loadData, updateScore, advanceHole, setActiveHole, activeHole } = useTournamentStore();
  const roundIdx = parseInt(roundIndex || '0');

  const [currentHole, setCurrentHole] = useState(1);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [showFormatSplash, setShowFormatSplash] = useState(false);
  const [currentFormat, setCurrentFormat] = useState('Scorecard');
  const [hasShownSplash, setHasShownSplash] = useState<Record<number, boolean>>({});

  const tournament = tournaments.find((t) => t.id === id);
  const round = tournament?.rounds[roundIdx];

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  useEffect(() => {
    if (round) {
      setCurrentHole(round.currentHole);
      // Initialize scores from stored data
      const initialScores: Record<string, string> = {};
      tournament?.players.forEach((player) => {
        const score = round.scores[player.id]?.[round.currentHole.toString()];
        initialScores[player.id] = score ? score.toString() : '';
      });
      setScores(initialScores);
      
      // Check format for current hole
      const format = round.formatsByHole[round.currentHole.toString()] || 'Scorecard';
      setCurrentFormat(format);
      if (format !== 'Scorecard' && !hasShownSplash[round.currentHole]) {
        setShowFormatSplash(true);
        setHasShownSplash((prev) => ({ ...prev, [round.currentHole]: true }));
      }
    }
  }, [round?.currentHole, tournament?.id]);

  const loadHoleScores = (hole: number) => {
    if (!tournament || !round) return;
    const holeScores: Record<string, string> = {};
    tournament.players.forEach((player) => {
      const score = round.scores[player.id]?.[hole.toString()];
      holeScores[player.id] = score ? score.toString() : '';
    });
    setScores(holeScores);
    
    // Check format and show splash
    const format = round.formatsByHole[hole.toString()] || 'Scorecard';
    setCurrentFormat(format);
    if (format !== 'Scorecard' && !hasShownSplash[hole]) {
      setShowFormatSplash(true);
      setHasShownSplash((prev) => ({ ...prev, [hole]: true }));
    }
  };

  const handleScoreChange = (playerId: string, value: string) => {
    // Only allow numbers 1-20
    if (value && !/^[1-9]$|^1\d$|^20$/.test(value)) {
      if (value.length > 0 && !isNaN(parseInt(value))) {
        const num = parseInt(value);
        if (num < 1) value = '1';
        else if (num > 20) value = '20';
      } else if (value !== '') {
        return;
      }
    }
    setScores((prev) => ({ ...prev, [playerId]: value }));
  };

  const saveCurrentScores = async () => {
    if (!tournament || !round) return;
    
    for (const player of tournament.players) {
      const scoreStr = scores[player.id];
      if (scoreStr) {
        const score = parseInt(scoreStr);
        if (score >= 1 && score <= 20) {
          await updateScore(tournament.id, roundIdx, player.id, currentHole.toString(), score);
        }
      }
    }
  };

  const handleSave = async () => {
    await saveCurrentScores();
    await loadData();
    Alert.alert('Saved', 'Scores saved successfully');
  };

  const handleSaveAndContinue = async () => {
    await saveCurrentScores();
    
    if (currentHole < (tournament?.holesPerRound || 18)) {
      const nextHole = currentHole + 1;
      await advanceHole(tournament!.id, roundIdx);
      setCurrentHole(nextHole);
      loadHoleScores(nextHole);
      await setActiveHole(nextHole);
    } else {
      Alert.alert('Round Complete', 'You have completed all holes!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    }
  };

  const handleBack = async () => {
    await saveCurrentScores();
    if (currentHole > 1) {
      const prevHole = currentHole - 1;
      setCurrentHole(prevHole);
      loadHoleScores(prevHole);
      await setActiveHole(prevHole);
    }
  };

  const navigateToHole = (hole: number) => {
    setCurrentHole(hole);
    loadHoleScores(hole);
  };

  const getPlayerTotal = (playerId: string) => {
    if (!round) return 0;
    const playerScores = round.scores[playerId] || {};
    return Object.values(playerScores).reduce((sum, score) => sum + (score || 0), 0);
  };

  if (!tournament || !round) {
    return (
      <View style={styles.container}>
        <Header title="Scorecard" showBack />
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Round not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Scorecard" showBack />
      
      {/* Format Splash Modal */}
      <FormatSplash
        visible={showFormatSplash}
        hole={currentHole}
        format={currentFormat}
        onDismiss={() => setShowFormatSplash(false)}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Hole Navigation */}
        <View style={styles.holeNav}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.holeNavContent}>
            {Array.from({ length: tournament.holesPerRound }, (_, i) => i + 1).map((hole) => {
              const format = round.formatsByHole[hole.toString()] || 'Scorecard';
              const isPoker = format === 'Poker';
              const isActive = hole === currentHole;
              const hasScore = tournament.players.some((p) => round.scores[p.id]?.[hole.toString()]);
              
              return (
                <TouchableOpacity
                  key={hole}
                  style={[
                    styles.holeChip,
                    isActive && styles.holeChipActive,
                    isPoker && !isActive && styles.holeChipPoker,
                  ]}
                  onPress={() => navigateToHole(hole)}
                >
                  <Text
                    style={[
                      styles.holeChipText,
                      isActive && styles.holeChipTextActive,
                      isPoker && !isActive && styles.holeChipTextPoker,
                    ]}
                  >
                    {hole}
                  </Text>
                  {hasScore && !isActive && (
                    <View style={[styles.scoreDot, isPoker && styles.scoreDotPoker]} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Current Hole Info */}
        <View style={styles.holeInfo}>
          <View style={styles.holeInfoMain}>
            <Text style={styles.holeNumber}>Hole {currentHole}</Text>
            {currentFormat !== 'Scorecard' && (
              <View style={styles.formatBadge}>
                <Ionicons name="diamond" size={12} color="#fff" />
                <Text style={styles.formatBadgeText}>{currentFormat}</Text>
              </View>
            )}
          </View>
          <Text style={styles.courseInfo}>
            {round.courseName}{round.teeName ? ` · ${round.teeName}` : ''}
          </Text>
        </View>

        {/* Score Entry */}
        <ScrollView style={styles.scoreSection} showsVerticalScrollIndicator={false}>
          <View style={styles.scoreHeader}>
            <Text style={styles.scoreHeaderText}>Player</Text>
            <Text style={styles.scoreHeaderText}>Score</Text>
            <Text style={styles.scoreHeaderText}>Total</Text>
          </View>
          
          {tournament.players.map((player, index) => (
            <View key={player.id} style={styles.scoreRow}>
              <View style={styles.playerInfo}>
                <View style={styles.playerNumber}>
                  <Text style={styles.playerNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.playerName} numberOfLines={1}>{player.name}</Text>
              </View>
              
              <TextInput
                style={styles.scoreInput}
                value={scores[player.id] || ''}
                onChangeText={(v) => handleScoreChange(player.id, v)}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="-"
                placeholderTextColor="#C6C6C8"
              />
              
              <View style={styles.totalContainer}>
                <Text style={styles.totalScore}>{getPlayerTotal(player.id) || '-'}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionButton, styles.backButton]}
              onPress={handleBack}
              disabled={currentHole === 1}
            >
              <Ionicons name="arrow-back" size={20} color={currentHole === 1 ? '#C6C6C8' : '#1B4332'} />
              <Text style={[styles.actionButtonText, currentHole === 1 && styles.actionButtonTextDisabled]}>
                Back
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.actionButton, styles.saveButton]} onPress={handleSave}>
              <Ionicons name="checkmark" size={20} color="#fff" />
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity style={styles.continueButton} onPress={handleSaveAndContinue}>
            <Text style={styles.continueButtonText}>
              {currentHole < tournament.holesPerRound ? 'Save & Continue' : 'Finish Round'}
            </Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
  },
  holeNav: {
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  holeNavContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  holeChip: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  holeChipActive: {
    backgroundColor: '#1B4332',
  },
  holeChipPoker: {
    backgroundColor: '#E5E5EA',
    borderWidth: 1,
    borderColor: '#1B4332',
  },
  holeChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  holeChipTextActive: {
    color: '#fff',
  },
  holeChipTextPoker: {
    color: '#1B4332',
  },
  scoreDot: {
    position: 'absolute',
    bottom: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34C759',
  },
  scoreDotPoker: {
    backgroundColor: '#1B4332',
  },
  holeInfo: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  holeInfoMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  holeNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  formatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1B4332',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  formatBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  courseInfo: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  scoreSection: {
    flex: 1,
    padding: 16,
  },
  scoreHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  scoreHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    flex: 1,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  playerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  playerNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1B4332',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerNumberText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  playerName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#000',
    flex: 1,
  },
  scoreInput: {
    width: 56,
    height: 44,
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginHorizontal: 12,
  },
  totalContainer: {
    width: 50,
    alignItems: 'center',
  },
  totalScore: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1B4332',
  },
  actions: {
    padding: 16,
    paddingBottom: 34,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C6C6C8',
    gap: 10,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 6,
  },
  backButton: {
    backgroundColor: '#F2F2F7',
  },
  saveButton: {
    backgroundColor: '#1B4332',
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1B4332',
  },
  actionButtonTextDisabled: {
    color: '#C6C6C8',
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  continueButton: {
    backgroundColor: '#1B4332',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
