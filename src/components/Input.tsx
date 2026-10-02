import React, { useState } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";
import { useTheme } from "@/theme";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export function Input({ label, error, helperText, leftIcon, rightElement, style, ...rest }: InputProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ marginBottom: theme.spacing.md }}>
      {label ? (
        <Text style={{ ...theme.typography.captionMedium, color: theme.colors.textSecondary, marginBottom: 6 }}>
          {label}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          borderWidth: 1.5,
          borderColor: error ? theme.colors.danger : focused ? theme.colors.accent : theme.colors.border,
          paddingHorizontal: 14,
        }}
      >
        {leftIcon}
        <TextInput
          placeholderTextColor={theme.colors.textMuted}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[
            {
              flex: 1,
              paddingVertical: 14,
              marginLeft: leftIcon ? 8 : 0,
              color: theme.colors.textPrimary,
              fontSize: 16,
            },
            style,
          ]}
          {...rest}
        />
        {rightElement}
      </View>
      {error ? (
        <Text style={{ ...theme.typography.caption, color: theme.colors.danger, marginTop: 4 }}>{error}</Text>
      ) : helperText ? (
        <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 4 }}>
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}
