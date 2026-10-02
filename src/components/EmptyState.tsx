import React from "react";
import { Text, View } from "react-native";
import { useTheme } from "@/theme";
import { Button } from "./Button";

export function EmptyState({
  emoji = "🏡",
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  emoji?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: "center", justifyContent: "center", padding: theme.spacing.xl, gap: 10 }}>
      <Text style={{ fontSize: 44 }}>{emoji}</Text>
      <Text style={{ ...theme.typography.h3, color: theme.colors.textPrimary, textAlign: "center" }}>
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={{
            ...theme.typography.body,
            color: theme.colors.textSecondary,
            textAlign: "center",
            maxWidth: 280,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: 12, width: 200 }}>
          <Button label={actionLabel} onPress={onAction} variant="primary" />
        </View>
      ) : null}
    </View>
  );
}
