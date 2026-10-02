import React from "react";
import { ActivityIndicator, View } from "react-native";
import { useTheme } from "@/theme";

export function FullScreenLoader() {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.background }}
    >
      <ActivityIndicator color={theme.colors.accent} size="large" />
    </View>
  );
}
