// src/components/BottomSheet.js
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Modal, Pressable, StyleSheet, View } from "react-native";

// NOTE: We do NOT use Theme Context inside Modal.
// Some RN setups can break Context through Modal.
// We accept scheme/theme as props from the parent screen instead.

export default function BottomSheet({ visible, onClose, children, scheme = "dark", theme = null }) {
  const isDark = scheme === "dark";

  const translateY = useRef(new Animated.Value(420)).current;

  const animIn = useMemo(
    () =>
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    [translateY]
  );

  const animOut = useMemo(
    () =>
      Animated.timing(translateY, {
        toValue: 420,
        duration: 180,
        useNativeDriver: true,
      }),
    [translateY]
  );

  useEffect(() => {
    if (visible) {
      translateY.setValue(420);
      animIn.start();
    }
  }, [visible, animIn, translateY]);

  function close() {
    animOut.start(({ finished }) => {
      if (finished) onClose?.();
    });
  }

  const borderColor = theme?.border || (isDark ? "rgba(255,255,255,0.10)" : "rgba(10,15,26,0.10)");
  const backdropColor = isDark ? "rgba(0,0,0,0.55)" : "rgba(10,15,26,0.38)";
  const sheetBg = isDark ? "rgba(15, 22, 36, 0.98)" : "rgba(255,255,255,0.98)";
  const grabberColor = isDark ? "rgba(255,255,255,0.18)" : "rgba(10,15,26,0.14)";

  return (
    <Modal visible={!!visible} transparent animationType="none" onRequestClose={close}>
      <View style={styles.root}>
        <Pressable style={[styles.backdrop, { backgroundColor: backdropColor }]} onPress={close} />
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: sheetBg,
              borderColor,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: grabberColor }]} />
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject },

  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: "hidden",
    paddingBottom: 18,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },

  grabber: {
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 8,
    width: 46,
    height: 5,
    borderRadius: 99,
  },
});
