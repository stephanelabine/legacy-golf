import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Modal, Pressable, StyleSheet, View } from "react-native";

export default function BottomSheet({ visible, onClose, children }) {
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

  return (
    <Modal visible={!!visible} transparent animationType="none" onRequestClose={close}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={close} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.grabber} />
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: "hidden",
    paddingBottom: 18,
    backgroundColor: "rgba(15, 22, 36, 0.98)",
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  grabber: {
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 8,
    width: 46,
    height: 5,
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
});
