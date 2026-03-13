// src/components/PremiumSwipeRow.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Animated } from "react-native";
import { Swipeable } from "react-native-gesture-handler";

/*
  PremiumSwipeRow (v2)

  Fixes:
  - Actions panel now matches the row contour (outer corners rounded, inner seam straight).
  - Child content is wrapped so its right/left corners become straight when swiped open,
    eliminating the “rounded blue edge vs straight red delete panel” mismatch.
  - Single crisp outer border should live on THIS shell (screens should avoid extra rings/borders).
*/

export default function PremiumSwipeRow({
  openSwipeRef,
  closeAnyOpenSwipe,

  children,
  renderContent,

  onEdit,
  onDelete,

  enabled = true,

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
  borderWidth = 2,

  shellStyle,
  swipeableProps,
}) {
  const swipeRef = useRef(null);
  const [openSide, setOpenSide] = useState(null); // "left" | "right" | null
  const [pressEnabled, setPressEnabled] = useState(true);

  const isEnabled = enabled === true;

  useEffect(() => {
    if (!openSide) {
      setPressEnabled(true);
    }
  }, [openSide]);

  function onWillOpen(direction) {
    setPressEnabled(false);
    if (!openSwipeRef) return;
    if (openSwipeRef.current && openSwipeRef.current !== swipeRef.current) {
      if (closeAnyOpenSwipe) closeAnyOpenSwipe();
    }
    if (direction === "left" || direction === "right") setOpenSide(direction);
  }

  function onOpen(direction) {
    setPressEnabled(false);
    if (!openSwipeRef) return;
    openSwipeRef.current = swipeRef.current;
    if (direction === "left" || direction === "right") setOpenSide(direction);
  }

  function onClose() {
    if (!openSwipeRef) return;
    if (openSwipeRef.current === swipeRef.current) openSwipeRef.current = null;
    setOpenSide(null);
  }

  const styles = useMemo(() => {
    return StyleSheet.create({
      swipeShell: {
        borderRadius: radius,
        overflow: "hidden",
        borderWidth: 0,
        borderColor: "transparent",
        backgroundColor: "transparent",
      },

      // The BORDER now lives on the sliding CONTENT (not around the action panes)
      contentShell: {
        borderRadius: radius,
        overflow: "hidden",
        borderWidth: borderWidth,
        borderColor: borderColor,
        backgroundColor: backgroundColor,
      },
      contentShellOpenRight: {
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
        borderRightWidth: 0, // no blue line beside Delete
      },
      contentShellOpenLeft: {
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
        borderLeftWidth: 0, // no blue line beside Enter
      },

      // Content wrapper lets us “square off” the seam edge when actions are open
      contentWrap: {
        borderRadius: radius - Math.max(0, borderWidth),
        overflow: "hidden",
      },
      contentOpenRight: {
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
      },
      contentOpenLeft: {
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
      },

      actionSlot: { width: actionWidth, height: "100%" },

      actionPane: {
        width: actionWidth,
        height: "100%",
        justifyContent: "center",
        alignItems: "center",
      },

      // Outer corners rounded, inner seam straight
      actionPaneLeft: {
        borderTopLeftRadius: radius,
        borderBottomLeftRadius: radius,
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
      },
      actionPaneRight: {
        borderTopRightRadius: radius,
        borderBottomRightRadius: radius,
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
      },

      actionText: { color: "#fff", fontSize: 14, fontWeight: "900", letterSpacing: 0.2 },

      pressed: { opacity: Platform.OS === "ios" ? 0.88 : 0.9, transform: [{ scale: 0.99 }] },
    });
  }, [radius, actionWidth, borderColor, backgroundColor, borderWidth]);

  function renderLeftActions(progress, dragX) {
    if (!onEdit) return null;

    const tx = dragX.interpolate({
      inputRange: [0, actionWidth],
      outputRange: [-actionWidth, 0],
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
            style={({ pressed }) => [
              styles.actionPane,
              styles.actionPaneLeft,
              { backgroundColor: editColor },
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.actionText}>{editLabel}</Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  function renderRightActions(progress, dragX) {
    if (!onDelete) return null;

    const tx = dragX.interpolate({
      inputRange: [-actionWidth, 0],
      outputRange: [0, actionWidth],
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
            style={({ pressed }) => [
              styles.actionPane,
              styles.actionPaneRight,
              { backgroundColor: deleteColor },
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.actionText}>{deleteLabel}</Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  const renderedContent =
    typeof renderContent === "function"
      ? renderContent({ pressEnabled, openSide, closeSwipe: () => swipeRef.current?.close?.() })
      : children;

  if (!isEnabled) {
    return (
      <View style={[styles.swipeShell, shellStyle]}>
        <View style={styles.contentShell}>{renderedContent}</View>
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
        <View
          style={[
            styles.contentShell,
            openSide === "right" && styles.contentShellOpenRight,
            openSide === "left" && styles.contentShellOpenLeft,
          ]}
        >
          {renderedContent}
        </View>
      </Swipeable>
    </View>
  );
}