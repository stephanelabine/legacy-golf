import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../../../../src/components/Header';
import { useTournamentStore } from '../../../../../src/store/tournamentStore';

export default function RoundHub() {
  const { id, roundIndex } = useLocalSearchParams<{ id: string; roundIndex: string }>();
  const router = useRouter();
  const { tournaments, loadData, setActiveRound, setActiveHole } = useTournamentStore();
  const roundIdx = parseInt(roundIndex || '0');

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const tournament = tournaments.find((t) => t.id === id);
  const round = tournament?.rounds[roundIdx];

  if (!tournament || !round) {
    return (
      <View style={styles.container}>
        <Header title="Round" showBack />
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Round not found</Text>
        </View>
      </View>
    );
  }

  const handleStartRound = async () => {
    await setActiveRound(roundIdx);
    await setActiveHole(round.currentHole);
    router.push(`/tournament/${id}/round/${roundIndex}/scorecard`);
  };

  const handleScorecard = async () => {
    await setActiveRound(roundIdx);
    await setActiveHole(round.currentHole);
    router.push(`/tournament/${id}/round/${roundIndex}/scorecard`);
  };

  // Calculate total scores
  const getPlayerTotal = (playerId: string) => {
    const scores = round.scores[playerId] || {};
    return Object.values(scores).reduce((sum, score) => sum + (score || 0), 0);
  };

  const hasScores = Object.keys(round.scores).length > 0;

  return (
    <View style={styles.container}>
      <Header title={`Round ${roundIdx + 1}`} showBack />
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Round Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="golf" size={24} color="#1B4332" />
            <Text style={styles.infoTitle}>{round.courseName || 'Course'}</Text>
          </View>
          
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Tee</Text>
              <Text style={styles.infoValue}>{round.teeName || 'N/A'}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Holes</Text>
              <Text style={styles.infoValue}>{tournament.holesPerRound}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Players</Text>
              <Text style={styles.infoValue}>{tournament.players.length}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Current Hole</Text>
              <Text style={styles.infoValue}>{round.currentHole}</Text>
            </View>
          </View>
        </View>

        {/* Current Standings */}
        {hasScores && (
          <View style={styles.standingsCard}>
            <Text style={styles.sectionTitle}>Current Standings</Text>
            {tournament.players
              .map((player) => ({
                ...player,
                total: getPlayerTotal(player.id),
              }))
              .sort((a, b) => a.total - b.total)
              .map((player, index) => (
                <View key={player.id} style={styles.standingRow}>
                  <View style={styles.standingRank}>
                    <Text style={styles.rankText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.standingName}>{player.name}</Text>
                  <Text style={styles.standingScore}>{player.total || '-'}</Text>
                </View>
              ))}
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleStartRound}>
            <Ionicons name="play-circle" size={22} color="#fff" />
            <Text style={styles.primaryButtonText}>
              {round.currentHole === 1 ? 'Start Round' : 'Continue Round'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={handleScorecard}>
            <Ionicons name="document-text" size={22} color="#1B4332" />
            <Text style={styles.secondaryButtonText}>Scorecard</Text>
          </TouchableOpacity>
        </View>

        {/* Hole Formats Preview */}
        <View style={styles.formatsCard}>
          <Text style={styles.sectionTitle}>Hole Formats</Text>
          <View style={styles.formatsGrid}>
            {Array.from({ length: tournament.holesPerRound }, (_, i) => i + 1).map((hole) => {
              const format = round.formatsByHole[hole.toString()] || 'Scorecard';
              const isPoker = format === 'Poker';
              return (
                <View
                  key={hole}
                  style={[styles.formatChip, isPoker && styles.formatChipPoker]}
                >
                  <Text style={[styles.formatChipText, isPoker && styles.formatChipTextPoker]}>
                    {hole}
                  </Text>
                  {isPoker && (
                    <Ionicons name="diamond" size={8} color="#fff" />
                  )}
                </View>
              );
            })}
          </View>
          <View style={styles.formatLegend}>
            <View style={styles.legendItem}>
              <View style={styles.legendDot} />
              <Text style={styles.legendText}>Scorecard</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.legendDotPoker]} />
              <Text style={styles.legendText}>Poker</Text>
            </View>
          </View>
        </View>
      </ScrollView>
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
    padding: 16,
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
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  infoItem: {
    width: '50%',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  standingsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  standingRank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  rankText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  standingName: {
    flex: 1,
    fontSize: 15,
    color: '#000',
  },
  standingScore: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1B4332',
  },
  actions: {
    gap: 10,
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: '#1B4332',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#1B4332',
  },
  secondaryButtonText: {
    color: '#1B4332',
    fontSize: 16,
    fontWeight: '600',
  },
  formatsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
  },
  formatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  formatChip: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  formatChipPoker: {
    backgroundColor: '#1B4332',
  },
  formatChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  formatChipTextPoker: {
    color: '#fff',
    fontSize: 12,
  },
  formatLegend: {
    flexDirection: 'row',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: '#F2F2F7',
  },
  legendDotPoker: {
    backgroundColor: '#1B4332',
  },
  legendText: {
    fontSize: 12,
    color: '#6B7280',
  },
});
