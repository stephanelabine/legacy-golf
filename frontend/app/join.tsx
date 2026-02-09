import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTournamentStore } from '../src/store/tournamentStore';
import { Header } from '../src/components/Header';

export default function JoinTournament() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getTournamentByCode, setActiveTournament } = useTournamentStore();
  const [code, setCode] = useState('');

  const handleJoin = async () => {
    if (!code.trim()) {
      Alert.alert('Error', 'Please enter a tournament code');
      return;
    }

    const tournament = getTournamentByCode(code.trim());
    if (!tournament) {
      Alert.alert('Not Found', 'No tournament found with that code. Try "DEMO25" for the demo tournament.');
      return;
    }

    await setActiveTournament(tournament.id);
    router.replace(`/tournament/${tournament.id}`);
  };

  return (
    <View style={styles.container}>
      <Header title="Join Tournament" showBack />
      
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.iconContainer}>
          <Ionicons name="enter" size={48} color="#1B4332" />
        </View>
        
        <Text style={styles.title}>Enter Tournament Code</Text>
        <Text style={styles.subtitle}>
          Ask your tournament host for the join code
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Enter code (e.g. DEMO25)"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={10}
          placeholderTextColor="#9CA3AF"
        />

        <TouchableOpacity
          style={[styles.joinButton, !code.trim() && styles.joinButtonDisabled]}
          onPress={handleJoin}
          disabled={!code.trim()}
        >
          <Text style={styles.joinButtonText}>Join Tournament</Text>
        </TouchableOpacity>

        <View style={styles.hintContainer}>
          <Ionicons name="information-circle" size={18} color="#6B7280" />
          <Text style={styles.hintText}>
            Tip: Try "DEMO25" to join the demo tournament
          </Text>
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
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#F0F9F4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 32,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    letterSpacing: 4,
  },
  joinButton: {
    backgroundColor: '#1B4332',
    paddingVertical: 16,
    borderRadius: 12,
    width: '100%',
    marginTop: 20,
  },
  joinButtonDisabled: {
    backgroundColor: '#C6C6C8',
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  hintContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 32,
  },
  hintText: {
    fontSize: 13,
    color: '#6B7280',
  },
});
