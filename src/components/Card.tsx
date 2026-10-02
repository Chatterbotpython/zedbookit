import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/theme";

export function Card({
  children,
  style,
  elevated = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          borderWidth: theme.isDark ? 1 : 0,
          borderColor: theme.colors.border,
        },
        elevated && !theme.isDark ? theme.shadow.card : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}
