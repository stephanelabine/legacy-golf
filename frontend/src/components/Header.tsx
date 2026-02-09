import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

interface HeaderProps {
  title: string;
  showBack?: boolean;
  rightAction?: {
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  };
  rightText?: {
    text: string;
    onPress: () => void;
  };
}

export const Header: React.FC<HeaderProps> = ({ title, showBack = false, rightAction, rightText }) => {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.container, { paddingTop: insets.top || 44 }]}>
      <View style={styles.content}>
        <View style={styles.leftSection}>
          {showBack && (
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={28} color="#007AFF" />
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <View style={styles.rightSection}>
          {rightAction && (
            <TouchableOpacity style={styles.rightButton} onPress={rightAction.onPress}>
              <Ionicons name={rightAction.icon} size={24} color="#007AFF" />
            </TouchableOpacity>
          )}
          {rightText && (
            <TouchableOpacity style={styles.rightButton} onPress={rightText.onPress}>
              <Text style={styles.rightTextStyle}>{rightText.text}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  content: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  leftSection: {
    width: 60,
    alignItems: 'flex-start',
  },
  rightSection: {
    width: 60,
    alignItems: 'flex-end',
  },
  backButton: {
    padding: 4,
  },
  rightButton: {
    padding: 8,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  rightTextStyle: {
    fontSize: 17,
    color: '#007AFF',
    fontWeight: '500',
  },
});
