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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../src/components/Header';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface RoundCourse {
  courseName: string;
  teeName: string;
}

export default function CreateCourses() {
  const router = useRouter();
  const [roundsCount, setRoundsCount] = useState(1);
  const [courses, setCourses] = useState<RoundCourse[]>([]);

  useEffect(() => {
    loadDraft();
  }, []);

  const loadDraft = async () => {
    const draftJson = await AsyncStorage.getItem('lg_createDraft');
    if (draftJson) {
      const draft = JSON.parse(draftJson);
      setRoundsCount(draft.roundsCount || 1);
      
      // Initialize courses array
      const existingCourses = draft.rounds?.map((r: any) => ({
        courseName: r.courseName || '',
        teeName: r.teeName || '',
      })) || [];
      
      const initialCourses: RoundCourse[] = [];
      for (let i = 0; i < draft.roundsCount; i++) {
        initialCourses.push(existingCourses[i] || { courseName: '', teeName: '' });
      }
      setCourses(initialCourses);
    }
  };

  const updateCourse = (index: number, field: keyof RoundCourse, value: string) => {
    const updated = [...courses];
    updated[index] = { ...updated[index], [field]: value };
    setCourses(updated);
  };

  const handleNext = async () => {
    const draftJson = await AsyncStorage.getItem('lg_createDraft');
    if (draftJson) {
      const draft = JSON.parse(draftJson);
      
      // Initialize rounds with course info
      draft.rounds = courses.map((course, index) => ({
        roundIndex: index,
        courseName: course.courseName,
        teeName: course.teeName,
        formatsByHole: draft.rounds?.[index]?.formatsByHole || {},
        scores: {},
        currentHole: 1,
      }));
      
      await AsyncStorage.setItem('lg_createDraft', JSON.stringify(draft));
    }
    router.push('/create/formats');
  };

  return (
    <View style={styles.container}>
      <Header title="Course Setup" showBack />
      
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Progress Indicator */}
          <View style={styles.progress}>
            <View style={[styles.progressDot, styles.progressDotDone]} />
            <View style={[styles.progressLine, styles.progressLineDone]} />
            <View style={[styles.progressDot, styles.progressDotDone]} />
            <View style={[styles.progressLine, styles.progressLineDone]} />
            <View style={[styles.progressDot, styles.progressDotActive]} />
            <View style={styles.progressLine} />
            <View style={styles.progressDot} />
          </View>
          <Text style={styles.stepText}>Step 3 of 4: Course & Tees</Text>

          {/* Rounds */}
          <View style={styles.roundsContainer}>
            {courses.map((course, index) => (
              <View key={index} style={styles.roundCard}>
                <View style={styles.roundHeader}>
                  <Ionicons name="golf" size={20} color="#1B4332" />
                  <Text style={styles.roundTitle}>Round {index + 1}</Text>
                </View>
                
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Course Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Pine Valley"
                    value={course.courseName}
                    onChangeText={(v) => updateCourse(index, 'courseName', v)}
                    placeholderTextColor="#9CA3AF"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Tee Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Championship, White, Blue"
                    value={course.teeName}
                    onChangeText={(v) => updateCourse(index, 'teeName', v)}
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
            <Text style={styles.nextButtonText}>Next: Hole Formats</Text>
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
  roundsContainer: {
    gap: 16,
  },
  roundCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  roundHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  roundTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1B4332',
  },
  inputGroup: {
    gap: 8,
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  input: {
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
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
  nextButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
