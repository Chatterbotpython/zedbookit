import React from "react";
import { Text, View } from "react-native";
import { useTheme } from "@/theme";

type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "accent";

export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const theme = useTheme();
  const toneColor = {
    success: theme.colors.success,
    warning: theme.colors.warning,
    danger: theme.colors.danger,
    info: theme.colors.info,
    accent: theme.colors.accent,
    neutral: theme.colors.textSecondary,
  }[tone];

  return (
    <View
      style={{
        backgroundColor: `${toneColor}1A`,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: theme.radius.pill,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ ...theme.typography.micro, color: toneColor, textTransform: "uppercase" }}>
        {label}
      </Text>
    </View>
  );
}

export function VerifiedBadge() {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: theme.colors.accent,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: theme.radius.pill,
      }}
    >
      <Text style={{ color: theme.colors.textInverse, fontSize: 11, fontWeight: "700" }}>✓ Verified</Text>
    </View>
  );
}
