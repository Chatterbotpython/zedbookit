import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/theme";

/** Simple shimmering skeleton block — used everywhere data is still loading
 * so we never show a jarring blank screen while Firestore fetches resolve. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { backgroundColor: theme.colors.skeleton, borderRadius: theme.radius.sm, opacity },
        style,
      ]}
    />
  );
}

export function PropertyCardSkeleton() {
  return (
    <View style={styles.card}>
      <Skeleton style={{ width: "100%", height: 180, borderRadius: 18 }} />
      <Skeleton style={{ width: "70%", height: 16, marginTop: 10 }} />
      <Skeleton style={{ width: "40%", height: 14, marginTop: 8 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: "100%", marginBottom: 16 },
});
