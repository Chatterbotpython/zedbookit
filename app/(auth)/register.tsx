import React, { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Home, Building2 } from "lucide-react-native";
import { useTheme } from "@/theme";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useToast } from "@/components/Toast";
import { registerWithEmail } from "@/services/auth.service";
import { logError, toUserMessage } from "@/services/errors";
import { isValidEmail, isStrongEnoughPassword } from "@/utils/validators";
import type { UserRole } from "@/types";

export default function Register() {
  const theme = useTheme();
  const { showToast } = useToast();
  const [role, setRole] = useState<Extract<UserRole, "tenant" | "landlord">>("tenant");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submitting = useRef(false);

  async function handleRegister() {
    if (submitting.current) return;
    const nextErrors: Record<string, string> = {};
    if (!firstName.trim()) nextErrors.firstName = "Enter your first name.";
    if (!lastName.trim()) nextErrors.lastName = "Enter your last name.";
    if (!isValidEmail(email)) nextErrors.email = "Enter a valid email address.";
    if (!isStrongEnoughPassword(password)) nextErrors.password = "Use at least 8 characters.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    submitting.current = true;
    setLoading(true);
    try {
      await registerWithEmail({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
        role,
      });
      router.replace("/");
    } catch (error) {
      logError("register", error);
      showToast(toUserMessage(error, "register"), "error");
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
          <Text style={{ ...theme.typography.h1, color: theme.colors.textPrimary, marginTop: theme.spacing.lg }}>
            Create your account
          </Text>
          <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary, marginTop: 6, marginBottom: theme.spacing.lg }}>
            Tell us what brings you to ZedBookIt.
          </Text>

          <View style={{ flexDirection: "row", gap: 12, marginBottom: theme.spacing.lg }}>
            <RoleOption
              selected={role === "tenant"}
              icon={<Home size={22} color={role === "tenant" ? theme.colors.accent : theme.colors.textMuted} />}
              title="I'm looking for a home"
              onPress={() => setRole("tenant")}
            />
            <RoleOption
              selected={role === "landlord"}
              icon={<Building2 size={22} color={role === "landlord" ? theme.colors.accent : theme.colors.textMuted} />}
              title="I want to list property"
              onPress={() => setRole("landlord")}
            />
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Input label="First name" value={firstName} onChangeText={setFirstName} error={errors.firstName} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="Last name" value={lastName} onChangeText={setLastName} error={errors.lastName} />
            </View>
          </View>
          <Input
            label="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            error={errors.email}
          />
          <Input
            label="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            error={errors.password}
            helperText="At least 8 characters."
          />

          <Button label="Create account" onPress={handleRegister} loading={loading} style={{ marginTop: 8 }} />

          <View style={{ flexDirection: "row", justifyContent: "center", marginTop: theme.spacing.lg }}>
            <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary }}>
              Already have an account?{" "}
            </Text>
            <Text
              style={{ ...theme.typography.bodyMedium, color: theme.colors.accent }}
              onPress={() => router.push("/(auth)/login")}
            >
              Log in
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function RoleOption({
  selected,
  icon,
  title,
  onPress,
}: {
  selected: boolean;
  icon: React.ReactNode;
  title: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      <Card
        style={{
          padding: 14,
          alignItems: "flex-start",
          borderWidth: 1.5,
          borderColor: selected ? theme.colors.accent : theme.colors.border,
        }}
        elevated={false}
      >
        {icon}
        <Text style={{ ...theme.typography.captionMedium, color: theme.colors.textPrimary, marginTop: 8 }}>
          {title}
        </Text>
      </Card>
    </Pressable>
  );
}
