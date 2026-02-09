import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../src/components/Header';
import { useTournamentStore, Player, Buddy } from '../../src/store/tournamentStore';
import { SwipeableRow } from '../../src/components/SwipeableRow';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';

export default function CreatePlayers() {
  const router = useRouter();
  const { buddies } = useTournamentStore();
  const [players, setPlayers] = useState<Player[]>([]);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [showBuddyPicker, setShowBuddyPicker] = useState(false);

  useEffect(() => {
    loadDraft();
  }, []);

  const loadDraft = async () => {
    const draftJson = await AsyncStorage.getItem('lg_createDraft');
    if (draftJson) {
      const draft = JSON.parse(draftJson);
      if (draft.players && draft.players.length > 0) {
        setPlayers(draft.players);
      }
    }
  };

  const saveDraft = async (updatedPlayers: Player[]) => {
    const draftJson = await AsyncStorage.getItem('lg_createDraft');
    if (draftJson) {
      const draft = JSON.parse(draftJson);
      draft.players = updatedPlayers;
      await AsyncStorage.setItem('lg_createDraft', JSON.stringify(draft));
    }
  };

  const addPlayer = () => {
    if (!newPlayerName.trim()) return;
    const newPlayer: Player = { id: uuidv4(), name: newPlayerName.trim() };
    const updated = [...players, newPlayer];
    setPlayers(updated);
    saveDraft(updated);
    setNewPlayerName('');
  };

  const addBuddy = (buddy: Buddy) => {
    if (players.some((p) => p.name === buddy.name)) {
      Alert.alert('Already Added', `${buddy.name} is already in the player list`);
      return;
    }
    const newPlayer: Player = { id: uuidv4(), name: buddy.name };
    const updated = [...players, newPlayer];
    setPlayers(updated);
    saveDraft(updated);
  };

  const removePlayer = (id: string) => {
    const updated = players.filter((p) => p.id !== id);
    setPlayers(updated);
    saveDraft(updated);
  };

  const handleNext = async () => {
    if (players.length === 0) {
      Alert.alert('Add Players', 'Please add at least one player');
      return;
    }
    await saveDraft(players);
    router.push('/create/courses');
  };

  return (
    <View style={styles.container}>
      <Header
        title="Add Players"
        showBack
        rightAction={{
          icon: 'people',
          onPress: () => router.push('/buddies'),
        }}
      />
      
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Progress Indicator */}
          <View style={styles.progress}>
            <View style={[styles.progressDot, styles.progressDotDone]} />
            <View style={[styles.progressLine, styles.progressLineDone]} />
            <View style={[styles.progressDot, styles.progressDotActive]} />
            <View style={styles.progressLine} />
            <View style={styles.progressDot} />
            <View style={styles.progressLine} />
            <View style={styles.progressDot} />
          </View>
          <Text style={styles.stepText}>Step 2 of 4: Players</Text>

          {/* Add Player Input */}
          <View style={styles.addPlayerSection}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Enter player name"
                value={newPlayerName}
                onChangeText={setNewPlayerName}
                onSubmitEditing={addPlayer}
                returnKeyType="done"
                placeholderTextColor="#9CA3AF"
              />
              <TouchableOpacity
                style={[styles.addButton, !newPlayerName.trim() && styles.addButtonDisabled]}
                onPress={addPlayer}
                disabled={!newPlayerName.trim()}
              >
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Buddy Picker */}
          {buddies.length > 0 && (
            <View style={styles.buddySection}>
              <TouchableOpacity
                style={styles.buddyHeader}
                onPress={() => setShowBuddyPicker(!showBuddyPicker)}
              >
                <Ionicons name="people-outline" size={20} color="#1B4332" />
                <Text style={styles.buddyHeaderText}>Add from Buddy List</Text>
                <Ionicons
                  name={showBuddyPicker ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color="#6B7280"
                />
              </TouchableOpacity>
              
              {showBuddyPicker && (
                <View style={styles.buddyList}>
                  {buddies.map((buddy) => {
                    const isAdded = players.some((p) => p.name === buddy.name);
                    return (
                      <TouchableOpacity
                        key={buddy.id}
                        style={[styles.buddyItem, isAdded && styles.buddyItemAdded]}
                        onPress={() => !isAdded && addBuddy(buddy)}
                        disabled={isAdded}
                      >
                        <Text style={[styles.buddyName, isAdded && styles.buddyNameAdded]}>
                          {buddy.name}
                        </Text>
                        {isAdded ? (
                          <Ionicons name="checkmark-circle" size={20} color="#34C759" />
                        ) : (
                          <Ionicons name="add-circle-outline" size={20} color="#1B4332" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* Players List */}
          <View style={styles.playersSection}>
            <Text style={styles.sectionTitle}>
              Players ({players.length})
            </Text>
            
            {players.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="person-add-outline" size={40} color="#C6C6C8" />
                <Text style={styles.emptyText}>No players added yet</Text>
              </View>
            ) : (
              <View style={styles.playersList}>
                {players.map((player, index) => (
                  <SwipeableRow
                    key={player.id}
                    showEdit={false}
                    onDelete={() => removePlayer(player.id)}
                  >
                    <View style={styles.playerCard}>
                      <View style={styles.playerNumber}>
                        <Text style={styles.playerNumberText}>{index + 1}</Text>
                      </View>
                      <Text style={styles.playerName}>{player.name}</Text>
                    </View>
                  </SwipeableRow>
                ))}
              </View>
            )}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.nextButton, players.length === 0 && styles.nextButtonDisabled]}
            onPress={handleNext}
            disabled={players.length === 0}
          >
            <Text style={styles.nextButtonText}>Next: Course Setup</Text>
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
  addPlayerSection: {
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  addButton: {
    backgroundColor: '#1B4332',
    width: 52,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonDisabled: {
    backgroundColor: '#C6C6C8',
  },
  buddySection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 20,
    overflow: 'hidden',
  },
  buddyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  buddyHeaderText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1B4332',
  },
  buddyList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
  },
  buddyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  buddyItemAdded: {
    backgroundColor: '#F0F9F4',
  },
  buddyName: {
    flex: 1,
    fontSize: 15,
    color: '#000',
  },
  buddyNameAdded: {
    color: '#6B7280',
  },
  playersSection: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
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
    fontSize: 15,
    color: '#6B7280',
    marginTop: 12,
  },
  playersList: {
    gap: 0,
  },
  playerCard: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playerNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1B4332',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerNumberText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  playerName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
  },
  footer: {
    padding: 20,
    paddingBottom: 34,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C6C6C8',
  },
  nextButton: {
    backgroundColor: '#1B4332',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  nextButtonDisabled: {
    backgroundColor: '#C6C6C8',
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
