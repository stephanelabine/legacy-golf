import React, { useMemo, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Animated } from "react-native";
import { Swipeable } from "react-native-gesture-handler";

/*
  PremiumSwipeRow

  - Uses the exact “pinned edge / slide-in pane” trick from your TournamentsScreen.
  - Supports:
      swipe right -> left action (Edit)
      swipe left  -> right action (Delete)
  - Enforces: “only one row open at a time” via openSwipeRef + closeAnyOpenSwipe from the screen.
  - Keeps layout clipped + rounded so actions and row feel like a single native component.

  Required props:
    - openSwipeRef: useRef(null) stored in the screen
    - closeAnyOpenSwipe: function from the screen that closes the current open row
    - children: your row content

  Optional:
    - onEdit, onDelete (if you want those actions)
    - actionWidth (default 120; keep consistent everywhere)
    - friction (default 2)
    - threshold (default 40)
    - radius (default 18)
    - editLabel/deleteLabel (default "Edit"/"Delete")
    - editColor/deleteColor
    - borderColor/backgroundColor (shell)
*/

export default function PremiumSwipeRow({
  openSwipeRef,
  closeAnyOpenSwipe,

  children,

  onEdit,
  onDelete,

  actionWidth = 120,
  friction = 2,
  threshold = 40,
  radius = 18,

  editLabel = "Edit",
  deleteLabel = "Delete",

  editColor = "rgba(15,122,74,0.92)",
  deleteColor = "rgba(190, 40, 40, 0.92)",

  borderColor = "rgba(10,15,26,0.12)",
  backgroundColor = "rgba(10,15,26,0.06)",

  shellStyle,
  swipeableProps,
}) {
  const swipeRef = useRef(null);

  function onWillOpen() {
    if (!openSwipeRef) return;
    if (openSwipeRef.current && openSwipeRef.current !== swipeRef.current) {
      if (closeAnyOpenSwipe) closeAnyOpenSwipe();
    }
  }
  function onOpen() {
    if (!openSwipeRef) return;
    openSwipeRef.current = swipeRef.current;
  }
  function onClose() {
    if (!openSwipeRef) return;
    if (openSwipeRef.current === swipeRef.current) openSwipeRef.current = null;
  }

  const styles = useMemo(() => {
    return StyleSheet.create({
      swipeShell: {
        borderRadius: radius,
        overflow: "hidden",
        borderWidth: 1,
        borderColor,
        backgroundColor,
      },

      actionSlot: { width: actionWidth, height: "100%" },
      actionPane: {
        width: actionWidth,
        height: "100%",
        justifyContent: "center",
        alignItems: "center",
      },
      actionText: { color: "#fff", fontSize: 14, fontWeight: "900", letterSpacing: 0.2 },

      pressed: { opacity: Platform.OS === "ios" ? 0.88 : 0.9, transform: [{ scale: 0.99 }] },
    });
  }, [radius, borderColor, backgroundColor, actionWidth]);

  function renderLeftActions(progress, dragX) {
    if (!onEdit) return null;

    // dragX: 0 -> +actionWidth as you swipe right
    const tx = dragX.interpolate({
      inputRange: [0, actionWidth],
      outputRange: [-actionWidth, 0], // hidden off-left, then flush-attached
      extrapolate: "clamp",
    });

    return (
      <View style={styles.actionSlot}>
        <Animated.View style={{ width: actionWidth, height: "100%", transform: [{ translateX: tx }] }}>
          <Pressable
            onPress={() => {
              if (closeAnyOpenSwipe) closeAnyOpenSwipe();
              onEdit();
            }}
            style={({ pressed }) => [styles.actionPane, { backgroundColor: editColor }, pressed && styles.pressed]}
          >
            <Text style={styles.actionText}>{editLabel}</Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  function renderRightActions(progress, dragX) {
    if (!onDelete) return null;

    // dragX: 0 -> -actionWidth as you swipe left
    const tx = dragX.interpolate({
      inputRange: [-actionWidth, 0],
      outputRange: [0, actionWidth], // flush-attached, then hidden off-right
      extrapolate: "clamp",
    });

    return (
      <View style={styles.actionSlot}>
        <Animated.View style={{ width: actionWidth, height: "100%", transform: [{ translateX: tx }] }}>
          <Pressable
            onPress={() => {
              if (closeAnyOpenSwipe) closeAnyOpenSwipe();
              onDelete();
            }}
            style={({ pressed }) => [styles.actionPane, { backgroundColor: deleteColor }, pressed && styles.pressed]}
          >
            <Text style={styles.actionText}>{deleteLabel}</Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={[styles.swipeShell, shellStyle]}>
      <Swipeable
        ref={swipeRef}
        overshootLeft={false}
        overshootRight={false}
        friction={friction}
        leftThreshold={threshold}
        rightThreshold={threshold}
        onSwipeableWillOpen={onWillOpen}
        onSwipeableOpen={onOpen}
        onSwipeableClose={onClose}
        renderLeftActions={renderLeftActions}
        renderRightActions={renderRightActions}
        {...swipeableProps}
      >
        {children}
      </Swipeable>
    </View>
  );
}
