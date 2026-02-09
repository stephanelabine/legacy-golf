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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../src/components/Header';
import { useTournamentStore } from '../../src/store/tournamentStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function CreateBasics() {
  const router = useRouter();
  const params = useLocalSearchParams<{ edit?: string }>();
  const { tournaments } = useTournamentStore();
  const isEditing = !!params.edit;
  const editTournament = isEditing ? tournaments.find((t) => t.id === params.edit) : null;

  const [name, setName] = useState(editTournament?.name || '');
  const [date, setDate] = useState(editTournament?.date || new Date().toISOString().split('T')[0]);
  const [location, setLocation] = useState(editTournament?.location || '');
  const [roundsCount, setRoundsCount] = useState(editTournament?.roundsCount || 1);
  const [holesPerRound, setHolesPerRound] = useState(editTournament?.holesPerRound || 18);

  const isValid = name.trim() && date;

  const handleNext = async () => {
    if (!isValid) return;

    // Save draft to AsyncStorage
    const draft = {
      id: params.edit || null,
      name: name.trim(),
      date,
      location: location.trim(),
      roundsCount,
      holesPerRound,
      players: editTournament?.players || [],
      rounds: editTournament?.rounds || [],
    };
    await AsyncStorage.setItem('lg_createDraft', JSON.stringify(draft));
    router.push('/create/players');
  };

  return (
    <View style={styles.container}>
      <Header title={isEditing ? 'Edit Tournament' : 'New Tournament'} showBack />
      
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Progress Indicator */}
          <View style={styles.progress}>
            <View style={[styles.progressDot, styles.progressDotActive]} />
            <View style={styles.progressLine} />
            <View style={styles.progressDot} />
            <View style={styles.progressLine} />
            <View style={styles.progressDot} />
            <View style={styles.progressLine} />
            <View style={styles.progressDot} />
          </View>
          <Text style={styles.stepText}>Step 1 of 4: Basics</Text>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Tournament Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Summer Classic 2025"
                value={name}
                onChangeText={setName}
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Date *</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                value={date}
                onChangeText={setDate}
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Location / Club</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Pine Valley Golf Club"
                value={location}
                onChangeText={setLocation}
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Number of Rounds</Text>
              <View style={styles.segmentedControl}>
                {[1, 2, 3, 4].map((num) => (
                  <TouchableOpacity
                    key={num}
                    style={[
                      styles.segment,
                      roundsCount === num && styles.segmentActive,
                    ]}
                    onPress={() => setRoundsCount(num)}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        roundsCount === num && styles.segmentTextActive,
                      ]}
                    >
                      {num}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Holes per Round</Text>
              <View style={styles.segmentedControl}>
                {[9, 18].map((num) => (
                  <TouchableOpacity
                    key={num}
                    style={[
                      styles.segment,
                      styles.segmentWide,
                      holesPerRound === num && styles.segmentActive,
                    ]}
                    onPress={() => setHolesPerRound(num)}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        holesPerRound === num && styles.segmentTextActive,
                      ]}
                    >
                      {num} Holes
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.nextButton, !isValid && styles.nextButtonDisabled]}
            onPress={handleNext}
            disabled={!isValid}
          >
            <Text style={styles.nextButtonText}>Next: Add Players</Text>
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
  progressLine: {
    width: 40,
    height: 2,
    backgroundColor: '#E5E5EA',
  },
  stepText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#E5E5EA',
    borderRadius: 10,
    padding: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentWide: {
    flex: 1,
  },
  segmentActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#6B7280',
  },
  segmentTextActive: {
    color: '#1B4332',
    fontWeight: '600',
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
