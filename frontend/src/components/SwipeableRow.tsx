import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue, withSpring, useAnimatedStyle } from 'react-native-reanimated';
import Reanimated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ACTION_WIDTH = 80;
const ACTIONS_WIDTH = 160;

interface SwipeableRowProps {
  children: React.ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  showEdit?: boolean;
  showDelete?: boolean;
}

export const SwipeableRow: React.FC<SwipeableRowProps> = ({
  children,
  onEdit,
  onDelete,
  showEdit = true,
  showDelete = true,
}) => {
  const translateX = useSharedValue(0);
  const actionsCount = (showEdit ? 1 : 0) + (showDelete ? 1 : 0);
  const maxSwipe = -actionsCount * ACTION_WIDTH;

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      const newValue = translateX.value + event.translationX / 10;
      if (newValue <= 0 && newValue >= maxSwipe) {
        translateX.value = newValue;
      }
    })
    .onEnd((event) => {
      if (event.translationX < -50) {
        translateX.value = withSpring(maxSwipe, { damping: 20, stiffness: 200 });
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const closeSwipe = () => {
    translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
  };

  const handleEdit = () => {
    closeSwipe();
    setTimeout(() => onEdit?.(), 200);
  };

  const handleDelete = () => {
    closeSwipe();
    setTimeout(() => onDelete?.(), 200);
  };

  return (
    <View style={styles.container}>
      <View style={styles.actionsContainer}>
        {showEdit && (
          <TouchableOpacity
            style={[styles.action, styles.editAction]}
            onPress={handleEdit}
          >
            <Ionicons name="pencil" size={22} color="#fff" />
            <Text style={styles.actionText}>Edit</Text>
          </TouchableOpacity>
        )}
        {showDelete && (
          <TouchableOpacity
            style={[styles.action, styles.deleteAction]}
            onPress={handleDelete}
          >
            <Ionicons name="trash" size={22} color="#fff" />
            <Text style={styles.actionText}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>
      <GestureDetector gesture={panGesture}>
        <Reanimated.View style={[styles.rowContent, animatedStyle]}>
          {children}
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 8,
  },
  rowContent: {
    backgroundColor: '#fff',
    zIndex: 1,
  },
  actionsContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    zIndex: 0,
  },
  action: {
    width: ACTION_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editAction: {
    backgroundColor: '#007AFF',
  },
  deleteAction: {
    backgroundColor: '#FF3B30',
  },
  actionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
});
