import React, { useEffect, useState } from "react";
import { ScrollView, Text, View, Pressable } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Wrench, MessageCircle, ClipboardList } from "lucide-react-native";
import { useTheme } from "@/theme";
import { useAuth } from "@/context/AuthContext";
import { useTenancy } from "@/hooks/useTenancy";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { formatRent } from "@/utils/currency";
import { formatDayOnly } from "@/utils/date";
import { getMaintenanceRequestsForTenant } from "@/services/maintenance.service";
import { MAINTENANCE_STATUS_LABEL } from "@/constants/categories";
import type { MaintenanceRequest } from "@/types";
import { logError } from "@/services/errors";

export default function MyHome() {
  const theme = useTheme();
  const { profile } = useAuth();
  const { tenancy, property, isLoading } = useTenancy();
  const [recentMaintenance, setRecentMaintenance] = useState<MaintenanceRequest[] | null>(null);

  const userId = profile?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getMaintenanceRequestsForTenant(userId)
      .then((requests) => {
        if (!cancelled) setRecentMaintenance(requests.slice(0, 3));
      })
      .catch((e) => {
        logError("myHome.maintenance", e);
        if (!cancelled) setRecentMaintenance([]); // secondary panel: show the empty state rather than hang
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  })();

  if (isLoading) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
  }

  if (!tenancy || !property) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <EmptyState
          emoji="🏠"
          title="You don't have an active home."
          subtitle="Once you move into a ZedBookIt property, everything about your home — rent, maintenance, and messages — will live here."
          actionLabel="Find a home"
          onAction={() => router.push("/(tenant)/explore")}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 140 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: theme.spacing.lg }}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={{ marginRight: 12 }}>
            <ArrowLeft size={22} color={theme.colors.textPrimary} />
          </Pressable>
          <Text style={{ ...theme.typography.h2, color: theme.colors.textPrimary }}>My Home</Text>
        </View>

        <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm }}>
          {greeting}, {profile?.firstName}.
        </Text>

        <Card style={{ overflow: "hidden", marginBottom: theme.spacing.lg }}>
          <Image source={{ uri: property.photos[0] }} style={{ width: "100%", height: 160 }} contentFit="cover" />
          <View style={{ padding: 16 }}>
            <Text style={{ ...theme.typography.h3, color: theme.colors.textPrimary }}>{property.title}</Text>
            <Text style={{ ...theme.typography.caption, color: theme.colors.textSecondary, marginTop: 2 }}>
              📍 {property.location.area}, {property.location.city}
            </Text>
            <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.accent, marginTop: 8 }}>
              {formatRent(property.price, property.rentFrequency)}
            </Text>
            <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 4 }}>
              Tenancy since {formatDayOnly(tenancy.startDate)}
            </Text>
          </View>
        </Card>

        <View style={{ flexDirection: "row", gap: 10, marginBottom: theme.spacing.lg }}>
          <ActionTile
            icon={<Wrench size={20} color={theme.colors.accent} />}
            label="Report a problem"
            onPress={() => router.push(`/maintenance/new?propertyId=${property.id}&tenancyId=${tenancy.id}`)}
          />
          <ActionTile
            icon={<ClipboardList size={20} color={theme.colors.accent} />}
            label="Maintenance history"
            onPress={() => router.push(`/maintenance/history?propertyId=${property.id}`)}
          />
          <ActionTile
            icon={<MessageCircle size={20} color={theme.colors.accent} />}
            label="Message landlord"
            onPress={() =>
              router.push(
                `/conversation/enquiry_${property.id}_${profile?.id}_${property.landlordId}?propertyId=${property.id}&landlordId=${property.landlordId}`
              )
            }
          />
        </View>

        <Text style={{ ...theme.typography.h3, color: theme.colors.textPrimary, marginBottom: 10 }}>
          Recent maintenance
        </Text>
        {recentMaintenance === null ? null : recentMaintenance.length === 0 ? (
          <Card style={{ padding: 16 }}>
            <Text style={{ ...theme.typography.body, color: theme.colors.textMuted }}>
              Everything looks good. No maintenance requests yet.
            </Text>
          </Card>
        ) : (
          recentMaintenance.map((request) => (
            <Pressable key={request.id} onPress={() => router.push(`/maintenance/${request.id}`)}>
              <Card style={{ padding: 14, marginBottom: 10 }}>
                <Text style={{ ...theme.typography.micro, color: theme.colors.textMuted }}>{request.referenceNumber}</Text>
                <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.textPrimary }}>{request.title}</Text>
                <View style={{ marginTop: 6 }}>
                  <Badge
                    label={MAINTENANCE_STATUS_LABEL[request.status]}
                    tone={request.status === "completed" ? "success" : "info"}
                  />
                </View>
              </Card>
            </Pressable>
          ))
        )}

        <Button
          label="Report a problem"
          onPress={() => router.push(`/maintenance/new?propertyId=${property.id}&tenancyId=${tenancy.id}`)}
          style={{ marginTop: theme.spacing.md }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionTile({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      <Card style={{ padding: 14, alignItems: "center", gap: 8 }}>
        {icon}
        <Text style={{ ...theme.typography.caption, color: theme.colors.textPrimary, textAlign: "center" }}>
          {label}
        </Text>
      </Card>
    </Pressable>
  );
}
