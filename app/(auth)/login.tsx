import React, { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { loginWithEmail } from "@/services/auth.service";
import { logError, toUserMessage } from "@/services/errors";
import { isValidEmail } from "@/utils/validators";

export default function Login() {
  const theme = useTheme();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false); // blocks double-taps before React re-renders the disabled state

  async function handleLogin() {
    if (submitting.current) return;
    const nextErrors: typeof errors = {};
    if (!isValidEmail(email)) nextErrors.email = "Enter a valid email address.";
    if (password.length === 0) nextErrors.password = "Enter your password.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    submitting.current = true;
    setLoading(true);
    try {
      await loginWithEmail(email.trim(), password);
      // Entry route waits for the auth/profile state machine to resolve before
      // choosing the tenant/landlord/admin experience.
      // AuthGate/Index route the user once the profile has loaded.
    } catch (error) {
      logError("login", error);
      showToast(toUserMessage(error, "auth"), "error");
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <Text style={{ ...theme.typography.h1, color: theme.colors.textPrimary, marginTop: theme.spacing.xl }}>
            Welcome back
          </Text>
          <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary, marginTop: 6, marginBottom: theme.spacing.lg }}>
            Log in to keep browsing homes and managing your rental.
          </Text>

          <Input
            label="Email"
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            error={errors.email}
          />
          <Input
            label="Password"
            placeholder="••••••••"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            error={errors.password}
          />

          <View style={{ alignSelf: "flex-end", marginBottom: theme.spacing.lg, marginTop: -8 }}>
            <Text
              style={{ ...theme.typography.captionMedium, color: theme.colors.accent }}
              onPress={() => router.push("/(auth)/forgot-password")}
            >
              Forgot password?
            </Text>
          </View>

          <Button label="Log in" onPress={handleLogin} loading={loading} />

          <View style={{ flexDirection: "row", justifyContent: "center", marginTop: theme.spacing.lg }}>
            <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary }}>
              New to ZedBookIt?{" "}
            </Text>
            <Text
              style={{ ...theme.typography.bodyMedium, color: theme.colors.accent }}
              onPress={() => router.push("/(auth)/register")}
            >
              Create an account
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
