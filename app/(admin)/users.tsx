import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Search } from "lucide-react-native";
import { useTheme } from "@/theme";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { listUsers, setUserSuspended } from "@/services/admin.service";
import type { UserProfile, UserRole } from "@/types";
import { logError, toUserMessage } from "@/services/errors";

const ROLE_FILTERS: { key: UserRole | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "tenant", label: "Tenants" },
  { key: "landlord", label: "Landlords" },
  { key: "agent", label: "Agents" },
  { key: "admin", label: "Admins" },
];


export default function AdminUsers() {
  const theme = useTheme();
  const { showToast } = useToast();
  const [users, setUsers] = useState<UserProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [search, setSearch] = useState("");

  function reload() {
    setError(null);
    listUsers()
      .then(setUsers)
      .catch((e) => {
        setUsers([]);
        logError("admin.users", e);
        setError(toUserMessage(e, "admin"));
      });
  }

  useEffect(reload, []);

  const filtered = useMemo(() => {
    const list = users ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      );
    });
  }, [users, roleFilter, search]);

  async function toggleSuspend(user: UserProfile) {
    try {
      await setUserSuspended(user.id, !user.isSuspended);
      showToast(user.isSuspended ? "User reinstated." : "User suspended.", "info");
      reload();
    } catch (e) {
      logError("admin.userAction", e);
      showToast(toUserMessage(e, "admin"), "error");
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={["top"]}>
      <Text style={{ ...theme.typography.h1, color: theme.colors.textPrimary, padding: theme.spacing.lg, paddingBottom: 4 }}>
        Users
      </Text>

      <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: theme.colors.surfaceSubtle,
            borderRadius: theme.radius.pill,
            paddingHorizontal: 14,
            gap: 8,
          }}
        >
          <Search size={16} color={theme.colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search name or email"
            placeholderTextColor={theme.colors.textMuted}
            style={{ flex: 1, paddingVertical: 10, color: theme.colors.textPrimary, ...theme.typography.body }}
          />
        </View>

        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={ROLE_FILTERS}
          keyExtractor={(item) => item.key}
          contentContainerStyle={{ gap: 8, paddingTop: 10 }}
          renderItem={({ item }) => {
            const active = item.key === roleFilter;
            return (
              <Pressable
                onPress={() => setRoleFilter(item.key)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: theme.radius.pill,
                  backgroundColor: active ? theme.colors.accent : theme.colors.surface,
                  borderWidth: active ? 0 : 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Text
                  style={{
                    ...theme.typography.captionMedium,
                    color: active ? theme.colors.textInverse : theme.colors.textSecondary,
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      {error ? (
        <View style={{ paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm }}>
          <Card style={{ padding: 14 }}>
            <Text style={{ ...theme.typography.body, color: theme.colors.danger, marginBottom: 10 }}>{error}</Text>
            <Button label="Retry" variant="outline" size="sm" onPress={reload} />
          </Card>
        </View>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingTop: 0, flexGrow: 1 }}
        ListEmptyComponent={
          users !== null && !error ? (
            <EmptyState emoji="🔍" title="No users match." subtitle="Try a different search or filter." />
          ) : null
        }
        renderItem={({ item }) => (
          <Card style={{ padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.textPrimary }}>
                {item.firstName} {item.lastName}
              </Text>
              <Text style={{ ...theme.typography.caption, color: theme.colors.textSecondary }}>{item.email}</Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                <Badge label={item.role} tone="neutral" />
                {item.isSuspended ? <Badge label="Suspended" tone="danger" /> : null}
              </View>
            </View>
            <Button
              label={item.isSuspended ? "Reinstate" : "Suspend"}
              variant={item.isSuspended ? "primary" : "outline"}
              size="sm"
              fullWidth={false}
              onPress={() => toggleSuspend(item)}
            />
          </Card>
        )}
      />
    </SafeAreaView>
  );
}
