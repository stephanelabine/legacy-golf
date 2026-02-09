import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface FormatSplashProps {
  visible: boolean;
  hole: number;
  format: string;
  onDismiss: () => void;
}

export const FormatSplash: React.FC<FormatSplashProps> = ({
  visible,
  hole,
  format,
  onDismiss,
}) => {
  if (!visible || format === 'Scorecard') return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <Ionicons 
              name={format === 'Poker' ? 'diamond' : 'golf'} 
              size={32} 
              color="#fff" 
            />
          </View>
          <Text style={styles.title}>Hole {hole} Format</Text>
          <Text style={styles.format}>{format}</Text>
          <TouchableOpacity style={styles.button} onPress={onDismiss}>
            <Text style={styles.buttonText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginHorizontal: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1B4332',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
    marginBottom: 4,
  },
  format: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1B4332',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#1B4332',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
