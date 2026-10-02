import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/Button";
import { FullScreenLoader } from "@/components/FullScreenLoader";
import { Input } from "@/components/Input";
import { useToast } from "@/components/Toast";
import { isResolving } from "@/auth/authState";
import { createMissingProfile } from "@/services/auth.service";
import { logError, toUserMessage } from "@/services/errors";

/**
 * Shown when someone IS signed in with Firebase but cannot enter the app:
 * suspended account, missing/corrupt profile, or the profile could not be
 * loaded (offline / permissions). Offers retry and sign-out so nobody is
 * stuck on a blank screen or bounced around in a redirect loop.
 */
export default function AccountStatus() {
  const theme = useTheme();
  const { status, errorCode, firebaseUser, retryProfile, signOut } = useAuth();
  const { showToast } = useToast();
  const [role, setRole] = useState<"tenant" | "landlord">("tenant");
  const [firstName, setFirstName] = useState(firebaseUser?.displayName?.split(" ")[0] ?? "");
  const [lastName, setLastName] = useState(firebaseUser?.displayName?.split(" ").slice(1).join(" ") ?? "");
  const [busy, setBusy] = useState(false);

  if (isResolving(status)) return <FullScreenLoader />;
  if (status === "unauthenticated") return <Redirect href="/(auth)/login" />;
  if (status === "authenticated") return <Redirect href="/" />;

  const isOffline = status === "error" && (errorCode === "unavailable" || errorCode === "deadline-exceeded");
  const copy =
    status === "suspended"
      ? {
          title: "Account suspended",
          body: "Your account has been suspended. If you think this is a mistake, please contact ZedBookIt support.",
          canRetry: false,
        }
      : status === "profile_missing"
        ? {
            title: "We couldn't find your profile",
            body: "You're signed in, but your ZedBookIt profile is missing or unreadable. If you have no profile yet, you can finish setting up below.",
            canRetry: true,
          }
        : {
            title: isOffline ? "You're offline" : "We couldn't load your account",
            body: isOffline
              ? "Unable to connect. Please check your internet connection and try again."
              : "Something stopped us from loading your account. Please try again.",
            canRetry: true,
          };

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  // No users/{uid} document at all -> the person can finish setup themselves.
  const noDocument = status === "profile_missing" && errorCode === "profile-missing";
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "(not set)";
  const diagnostic =
    status === "profile_missing"
      ? `Reason: ${noDocument ? "no users document for this account" : (errorCode ?? "unreadable profile")}\nAccount ID: ${firebaseUser?.uid ?? "?"}\nFirebase project: ${projectId}`
      : null;

  async function finishSetup() {
    if (busy || !firebaseUser) return;
    if (!firstName.trim() || !lastName.trim()) {
      showToast("Enter your first and last name.", "error");
      return;
    }
    setBusy(true);
    try {
      await createMissingProfile(firebaseUser, { role, firstName: firstName.trim(), lastName: lastName.trim() });
      await retryProfile();
    } catch (error) {
      logError("createMissingProfile", error);
      showToast(toUserMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: theme.spacing.lg, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Text style={{ ...theme.typography.h1, color: theme.colors.textPrimary }}>{copy.title}</Text>
        <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary, marginBottom: theme.spacing.md }}>
          {copy.body}
        </Text>
        {noDocument ? (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="I'm a tenant" size="sm" variant={role === "tenant" ? "primary" : "outline"} onPress={() => setRole("tenant")} />
              <Button label="I'm a landlord" size="sm" variant={role === "landlord" ? "primary" : "outline"} onPress={() => setRole("landlord")} />
            </View>
            <Input label="First name" value={firstName} onChangeText={setFirstName} />
            <Input label="Last name" value={lastName} onChangeText={setLastName} />
            <Button label="Finish setting up" onPress={finishSetup} loading={busy} />
          </View>
        ) : null}
        {copy.canRetry ? <Button label="Try again" variant={noDocument ? "outline" : "primary"} onPress={() => run(retryProfile)} disabled={busy} /> : null}
        <Button label="Sign out" variant="outline" onPress={() => run(signOut)} disabled={busy} />
        {diagnostic ? (
          <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 8 }}>
            {diagnostic}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
