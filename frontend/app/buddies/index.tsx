import React, { useState } from 'react';
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
import { useTournamentStore, Buddy } from '../../src/store/tournamentStore';
import { SwipeableRow } from '../../src/components/SwipeableRow';

export default function BuddiesList() {
  const router = useRouter();
  const { buddies, addBuddy, updateBuddy, deleteBuddy } = useTournamentStore();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleAddBuddy = async () => {
    if (!newName.trim()) return;
    await addBuddy(newName.trim());
    setNewName('');
  };

  const handleEdit = (buddy: Buddy) => {
    setEditingId(buddy.id);
    setEditingName(buddy.name);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editingName.trim()) return;
    await updateBuddy(editingId, editingName.trim());
    setEditingId(null);
    setEditingName('');
  };

  const handleDelete = (buddy: Buddy) => {
    Alert.alert(
      'Delete Buddy',
      `Remove ${buddy.name} from your buddy list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteBuddy(buddy.id),
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Buddy List" showBack />
      
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Add New Buddy */}
          <View style={styles.addSection}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Add new buddy"
                value={newName}
                onChangeText={setNewName}
                onSubmitEditing={handleAddBuddy}
                returnKeyType="done"
                placeholderTextColor="#9CA3AF"
              />
              <TouchableOpacity
                style={[styles.addButton, !newName.trim() && styles.addButtonDisabled]}
                onPress={handleAddBuddy}
                disabled={!newName.trim()}
              >
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Buddies List */}
          <View style={styles.listSection}>
            <Text style={styles.sectionTitle}>Your Buddies ({buddies.length})</Text>
            
            {buddies.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color="#C6C6C8" />
                <Text style={styles.emptyText}>No buddies yet</Text>
                <Text style={styles.emptySubtext}>Add friends to quickly add them to tournaments</Text>
              </View>
            ) : (
              <View style={styles.buddiesList}>
                {buddies.map((buddy) => (
                  <SwipeableRow
                    key={buddy.id}
                    onEdit={() => handleEdit(buddy)}
                    onDelete={() => handleDelete(buddy)}
                  >
                    {editingId === buddy.id ? (
                      <View style={styles.editCard}>
                        <TextInput
                          style={styles.editInput}
                          value={editingName}
                          onChangeText={setEditingName}
                          autoFocus
                          onSubmitEditing={handleSaveEdit}
                          returnKeyType="done"
                        />
                        <TouchableOpacity
                          style={styles.saveButton}
                          onPress={handleSaveEdit}
                        >
                          <Ionicons name="checkmark" size={22} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.cancelButton}
                          onPress={() => setEditingId(null)}
                        >
                          <Ionicons name="close" size={22} color="#6B7280" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.buddyCard}>
                        <View style={styles.buddyAvatar}>
                          <Text style={styles.avatarText}>
                            {buddy.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.buddyName}>{buddy.name}</Text>
                      </View>
                    )}
                  </SwipeableRow>
                ))}
              </View>
            )}
          </View>

          <Text style={styles.swipeHint}>
            <Ionicons name="arrow-back" size={12} color="#9CA3AF" /> Swipe left to edit or delete
          </Text>
        </ScrollView>
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
  addSection: {
    marginBottom: 24,
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
  listSection: {
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
  buddiesList: {
    gap: 0,
  },
  buddyCard: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  buddyAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1B4332',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  buddyName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
    flex: 1,
  },
  editCard: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editInput: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  saveButton: {
    backgroundColor: '#34C759',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#E5E5EA',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swipeHint: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 32,
  },
});
