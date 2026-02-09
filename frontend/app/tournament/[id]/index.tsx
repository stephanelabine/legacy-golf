import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../../src/components/Header';
import { useTournamentStore } from '../../../src/store/tournamentStore';
import { format } from 'date-fns';

export default function TournamentOverview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { tournaments, loadData, setActiveRound, setActiveHole } = useTournamentStore();

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const tournament = tournaments.find((t) => t.id === id);

  if (!tournament) {
    return (
      <View style={styles.container}>
        <Header title="Tournament" showBack />
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Tournament not found</Text>
        </View>
      </View>
    );
  }

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'EEEE, MMMM d, yyyy');
    } catch {
      return dateStr;
    }
  };

  const handleShareCode = async () => {
    try {
      await Share.share({
        message: `Join my golf tournament "${tournament.name}" with code: ${tournament.joinCode}`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleEditTournament = () => {
    router.push(`/create/basics?edit=${tournament.id}`);
  };

  const handleStartRound = async (roundIndex: number) => {
    await setActiveRound(roundIndex);
    await setActiveHole(tournament.rounds[roundIndex].currentHole);
    router.push(`/tournament/${id}/round/${roundIndex}`);
  };

  return (
    <View style={styles.container}>
      <Header
        title="Tournament"
        showBack
        rightAction={{
          icon: 'create-outline',
          onPress: handleEditTournament,
        }}
      />
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Tournament Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.tournamentName}>{tournament.name}</Text>
          
          <View style={styles.infoRow}>
            <Ionicons name="calendar" size={18} color="#1B4332" />
            <Text style={styles.infoText}>{formatDate(tournament.date)}</Text>
          </View>
          
          {tournament.location && (
            <View style={styles.infoRow}>
              <Ionicons name="location" size={18} color="#1B4332" />
              <Text style={styles.infoText}>{tournament.location}</Text>
            </View>
          )}
          
          <View style={styles.infoRow}>
            <Ionicons name="people" size={18} color="#1B4332" />
            <Text style={styles.infoText}>
              {tournament.players.length} player{tournament.players.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        {/* Join Code Card */}
        <TouchableOpacity style={styles.codeCard} onPress={handleShareCode}>
          <View style={styles.codeHeader}>
            <Ionicons name="key" size={20} color="#1B4332" />
            <Text style={styles.codeLabel}>Join Code</Text>
          </View>
          <View style={styles.codeContent}>
            <Text style={styles.codeText}>{tournament.joinCode}</Text>
            <Ionicons name="share-outline" size={22} color="#007AFF" />
          </View>
        </TouchableOpacity>

        {/* Players Card */}
        <View style={styles.playersCard}>
          <Text style={styles.sectionTitle}>Players</Text>
          <View style={styles.playersList}>
            {tournament.players.map((player, index) => (
              <View key={player.id} style={styles.playerChip}>
                <View style={styles.playerNumber}>
                  <Text style={styles.playerNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.playerName}>{player.name}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Rounds Section */}
        <View style={styles.roundsSection}>
          <Text style={styles.sectionTitle}>Rounds</Text>
          
          {tournament.rounds.map((round, index) => (
            <TouchableOpacity
              key={index}
              style={styles.roundCard}
              onPress={() => handleStartRound(index)}
            >
              <View style={styles.roundInfo}>
                <Text style={styles.roundTitle}>Round {index + 1}</Text>
                <View style={styles.roundDetails}>
                  {round.courseName && (
                    <Text style={styles.roundDetailText}>{round.courseName}</Text>
                  )}
                  {round.teeName && (
                    <Text style={styles.roundDetailText}>{round.teeName} Tees</Text>
                  )}
                  <Text style={styles.roundDetailText}>
                    {tournament.holesPerRound} holes
                  </Text>
                </View>
                <View style={styles.holeProgress}>
                  <Text style={styles.holeProgressText}>
                    Hole {round.currentHole} of {tournament.holesPerRound}
                  </Text>
                </View>
              </View>
              <View style={styles.roundAction}>
                <Text style={styles.roundActionText}>
                  {round.currentHole === 1 ? 'Start' : 'Continue'}
                </Text>
                <Ionicons name="chevron-forward" size={20} color="#1B4332" />
              </View>
            </TouchableOpacity>
          ))}
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
  tournamentName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 15,
    color: '#6B7280',
  },
  codeCard: {
    backgroundColor: '#F0F9F4',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  codeLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1B4332',
  },
  codeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  codeText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1B4332',
    letterSpacing: 3,
  },
  playersCard: {
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
  playersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  playerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    gap: 6,
  },
  playerNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1B4332',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerNumberText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  playerName: {
    fontSize: 14,
    color: '#000',
  },
  roundsSection: {
    marginBottom: 32,
  },
  roundCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  roundInfo: {
    flex: 1,
  },
  roundTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  roundDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  roundDetailText: {
    fontSize: 13,
    color: '#6B7280',
  },
  holeProgress: {
    backgroundColor: '#F0F9F4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  holeProgressText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1B4332',
  },
  roundAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roundActionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1B4332',
  },
});
