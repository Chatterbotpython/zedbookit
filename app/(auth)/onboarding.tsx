import React from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme";
import { Button } from "@/components/Button";

export default function Onboarding() {
  const theme = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Image
        source={{ uri: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80" }}
        style={{ width: "100%", height: "58%" }}
        contentFit="cover"
      />
      <SafeAreaView edges={["bottom"]} style={{ flex: 1 }}>
        <View style={{ flex: 1, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg, justifyContent: "space-between" }}>
          <View>
            <Text style={{ ...theme.typography.micro, color: theme.colors.accent, letterSpacing: 2 }}>
              ZEDBOOKIT
            </Text>
            <Text style={{ ...theme.typography.display, color: theme.colors.textPrimary, marginTop: 8 }}>
              Find it. Book it.{"\n"}Live better.
            </Text>
            <Text style={{ ...theme.typography.bodyLarge, color: theme.colors.textSecondary, marginTop: 12 }}>
              Zambia's home for finding great rentals — and staying looked after once you move in.
            </Text>
          </View>

          <View style={{ gap: 12, marginBottom: 16 }}>
            <Button label="Create an account" onPress={() => router.push("/(auth)/register")} />
            <Button
              label="I already have an account"
              variant="outline"
              onPress={() => router.push("/(auth)/login")}
            />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
