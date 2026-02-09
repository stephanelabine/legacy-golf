import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTournamentStore, Tournament } from '../src/store/tournamentStore';
import { SwipeableRow } from '../src/components/SwipeableRow';
import { format } from 'date-fns';

export default function TournamentHub() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tournaments, isLoading, loadData, deleteTournament, setActiveTournament } = useTournamentStore();
  const [refreshing, setRefreshing] = React.useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleCreateTournament = () => {
    router.push('/create/basics');
  };

  const handleJoinTournament = () => {
    router.push('/join');
  };

  const handleTournamentPress = async (tournament: Tournament) => {
    await setActiveTournament(tournament.id);
    router.push(`/tournament/${tournament.id}`);
  };

  const handleEditTournament = (tournament: Tournament) => {
    router.push(`/create/basics?edit=${tournament.id}`);
  };

  const handleDeleteTournament = (tournament: Tournament) => {
    Alert.alert(
      'Delete Tournament',
      `Are you sure you want to delete "${tournament.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteTournament(tournament.id),
        },
      ]
    );
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d, yyyy');
    } catch {
      return dateStr;
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Ionicons name="golf" size={32} color="#1B4332" />
          <Text style={styles.logoText}>Legacy Golf</Text>
        </View>
        <Text style={styles.subtitle}>Tournament Hub</Text>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Primary Actions */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleCreateTournament}
          >
            <Ionicons name="add-circle" size={24} color="#fff" />
            <Text style={styles.primaryButtonText}>Create Tournament</Text>
          </TouchableOpacity>

          <View style={styles.secondaryActions}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleJoinTournament}
            >
              <Ionicons name="enter" size={22} color="#1B4332" />
              <Text style={styles.secondaryButtonText}>Join by Code</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* My Tournaments */}
        <View style={styles.tournamentsSection}>
          <Text style={styles.sectionTitle}>My Tournaments</Text>
          
          {tournaments.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="golf-outline" size={48} color="#C6C6C8" />
              <Text style={styles.emptyText}>No tournaments yet</Text>
              <Text style={styles.emptySubtext}>
                Create or join a tournament to get started
              </Text>
            </View>
          ) : (
            <View style={styles.tournamentsList}>
              {tournaments.map((tournament) => (
                <SwipeableRow
                  key={tournament.id}
                  onEdit={() => handleEditTournament(tournament)}
                  onDelete={() => handleDeleteTournament(tournament)}
                >
                  <TouchableOpacity
                    style={styles.tournamentCard}
                    onPress={() => handleTournamentPress(tournament)}
                    activeOpacity={0.9}
                  >
                    <View style={styles.tournamentInfo}>
                      <Text style={styles.tournamentName}>{tournament.name}</Text>
                      <View style={styles.tournamentMeta}>
                        <View style={styles.metaRow}>
                          <Ionicons name="calendar-outline" size={14} color="#6B7280" />
                          <Text style={styles.metaText}>{formatDate(tournament.date)}</Text>
                        </View>
                        {tournament.location && (
                          <View style={styles.metaRow}>
                            <Ionicons name="location-outline" size={14} color="#6B7280" />
                            <Text style={styles.metaText}>{tournament.location}</Text>
                          </View>
                        )}
                        <View style={styles.metaRow}>
                          <Ionicons name="people-outline" size={14} color="#6B7280" />
                          <Text style={styles.metaText}>{tournament.players.length} players</Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.tournamentBadge}>
                      <Text style={styles.badgeText}>{tournament.roundsCount}R / {tournament.holesPerRound}H</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#C6C6C8" />
                  </TouchableOpacity>
                </SwipeableRow>
              ))}
            </View>
          )}
        </View>

        <Text style={styles.swipeHint}>
          <Ionicons name="arrow-back" size={12} color="#9CA3AF" /> Swipe left on a tournament to edit or delete
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1B4332',
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  actionsSection: {
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#1B4332',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  secondaryActions: {
    marginTop: 12,
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
  tournamentsSection: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  emptyState: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },
  tournamentsList: {
    gap: 0,
  },
  tournamentCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  tournamentInfo: {
    flex: 1,
  },
  tournamentName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  tournamentMeta: {
    gap: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    color: '#6B7280',
  },
  tournamentBadge: {
    backgroundColor: '#F0F9F4',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1B4332',
  },
  swipeHint: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 32,
  },
});
