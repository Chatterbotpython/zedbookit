import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Animated, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme";

type ToastKind = "success" | "error" | "info";
interface ToastState {
  message: string;
  kind: ToastKind;
}

const ToastContext = createContext<{ showToast: (message: string, kind?: ToastKind) => void }>({
  showToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  const showToast = useCallback(
    (message: string, kind: ToastKind = "info") => {
      setToast({ message, kind });
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(2200),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => setToast(null));
    },
    [opacity]
  );

  const toneColor = toast
    ? { success: theme.colors.success, error: theme.colors.danger, info: theme.colors.textPrimary }[toast.kind]
    : theme.colors.textPrimary;

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 20,
            right: 20,
            bottom: insets.bottom + 24,
            opacity,
            backgroundColor: theme.colors.surfaceElevated,
            borderRadius: theme.radius.md,
            paddingVertical: 14,
            paddingHorizontal: 18,
            borderLeftWidth: 4,
            borderLeftColor: toneColor,
            ...theme.shadow.raised,
          }}
        >
          <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.textPrimary }}>
            {toast.message}
          </Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}
