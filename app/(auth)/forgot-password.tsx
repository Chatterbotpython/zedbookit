import React, { useState } from "react";
import { ScrollView, Text } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { requestPasswordReset } from "@/services/auth.service";
import { isValidEmail } from "@/utils/validators";

export default function ForgotPassword() {
  const theme = useTheme();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit() {
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(undefined);
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      showToast("Check your inbox for a reset link.", "success");
      router.back();
    } catch {
      // Deliberately generic — never reveal whether an email is registered.
      showToast("If that email is registered, a reset link is on its way.", "info");
      router.back();
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, flexGrow: 1 }}>
        <Text style={{ ...theme.typography.h1, color: theme.colors.textPrimary, marginTop: theme.spacing.lg }}>
          Reset your password
        </Text>
        <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary, marginTop: 6, marginBottom: theme.spacing.lg }}>
          Enter the email you used to sign up and we'll send you a reset link.
        </Text>
        <Input
          label="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          error={error}
        />
        <Button label="Send reset link" onPress={handleSubmit} loading={loading} />
      </ScrollView>
    </SafeAreaView>
  );
}
