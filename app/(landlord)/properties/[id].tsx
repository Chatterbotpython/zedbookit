import React, { useEffect, useRef, useState } from "react";
import { Alert, ScrollView, Text, View, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { ArrowLeft } from "lucide-react-native";
import { useTheme } from "@/theme";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { getProperty, setPropertyStatus } from "@/services/properties.service";
import { getMaintenanceHistoryForProperty } from "@/services/maintenance.service";
import { formatRent, formatZMW } from "@/utils/currency";
import type { Property, PropertyStatus } from "@/types";
import { logError, toUserMessage } from "@/services/errors";
import {
  OWNER_AVAILABILITY_STATUSES,
  PROPERTY_STATUS_LABEL,
  PROPERTY_STATUS_TONE,
  canOwnerChangeStatus,
} from "@/constants/propertyStatus";

export default function LandlordPropertyDetail() {
  const theme = useTheme();
  const { profile } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { showToast } = useToast();
  const [property, setProperty] = useState<Property | null>(null);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof getMaintenanceHistoryForProperty>> | null>(null);

  const userId = profile?.id;
  const userRole = profile?.role;
  useEffect(() => {
    if (!id || !userId || !userRole) return;
    getProperty(id)
      .then(setProperty)
      .catch((e) => logError("landlord.property", e));
    getMaintenanceHistoryForProperty(id, { id: userId, role: userRole })
      .then(setHistory)
      .catch((e) => logError("landlord.property.history", e));
  }, [id, userId, userRole]);

  const [updating, setUpdating] = useState(false);
  const updatingRef = useRef(false);

  async function changeStatus(status: PropertyStatus) {
    if (!id || updatingRef.current) return;
    updatingRef.current = true;
    setUpdating(true);
    try {
      await setPropertyStatus(id, status);
      setProperty((p) => (p ? { ...p, status } : p));
      showToast(`Marked as ${PROPERTY_STATUS_LABEL[status].toLowerCase()}.`, "success");
    } catch (e) {
      logError("landlord.property.status", e);
      showToast(`Couldn't update the property status. ${toUserMessage(e, "property")}`, "error");
    } finally {
      updatingRef.current = false;
      setUpdating(false);
    }
  }

  /** Rented / sold take the listing out of tenant search, so ask first. */
  function requestStatus(status: PropertyStatus) {
    if (status === "rented" || status === "sold") {
      Alert.alert(
        `Mark as ${status}?`,
        "It will no longer appear in tenant search. You can mark it vacant again at any time.",
        [
          { text: "Cancel", style: "cancel" },
          { text: `Mark as ${status}`, onPress: () => void changeStatus(status) },
        ]
      );
      return;
    }
    void changeStatus(status);
  }

  if (!property) return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View>
          <Image source={{ uri: property.photos[0] }} style={{ width: "100%", height: 220 }} contentFit="cover" />
          <Pressable
            onPress={() => router.back()}
            style={{
              position: "absolute",
              top: 56,
              left: 16,
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: "rgba(11,14,18,0.45)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ArrowLeft size={20} color="#fff" />
          </Pressable>
        </View>

        <View style={{ padding: theme.spacing.lg }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <Text style={{ ...theme.typography.h1, color: theme.colors.textPrimary, flex: 1 }}>{property.title}</Text>
            <Badge label={PROPERTY_STATUS_LABEL[property.status]} tone={PROPERTY_STATUS_TONE[property.status]} />
          </View>
          <Text style={{ ...theme.typography.h2, color: theme.colors.accent, marginTop: 6 }}>
            {formatRent(property.price, property.rentFrequency)}
          </Text>
          <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary, marginTop: 4 }}>
            📍 {property.location.area}, {property.location.city}
          </Text>

          <View style={{ flexDirection: "row", gap: 24, marginTop: theme.spacing.lg }}>
            <Metric label="Views" value={property.viewCount} />
            <Metric label="Saved" value={property.savedCount} />
          </View>

          <Text style={{ ...theme.typography.h3, color: theme.colors.textPrimary, marginTop: theme.spacing.lg, marginBottom: 10 }}>
            Maintenance activity
          </Text>
          <Card style={{ padding: 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Metric label="Requests" value={history?.totalCount ?? 0} small />
              <Metric label="Completed" value={history?.completedCount ?? 0} small />
              <Metric label="In progress" value={history?.inProgressCount ?? 0} small />
              <Metric label="Cancelled" value={history?.cancelledCount ?? 0} small />
            </View>
            {history && history.totalCost > 0 ? (
              <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 10 }}>
                Total maintenance spend: {formatZMW(history.totalCost)} (visible only to you)
              </Text>
            ) : null}
          </Card>

          <View style={{ marginTop: theme.spacing.lg, gap: 10 }}>
            {OWNER_AVAILABILITY_STATUSES.filter(
              (target) => target !== property.status && canOwnerChangeStatus(property.status, target)
            ).map((target) => (
              <Button
                key={target}
                label={`Mark as ${target}`}
                variant={target === "vacant" ? "primary" : "secondary"}
                onPress={() => requestStatus(target)}
                disabled={updating}
              />
            ))}
            {property.status === "inactive" ? (
              <Button label="Reactivate listing" onPress={() => requestStatus("pending")} disabled={updating} />
            ) : canOwnerChangeStatus(property.status, "inactive") ? (
              <Button label="Deactivate listing" variant="outline" onPress={() => requestStatus("inactive")} disabled={updating} />
            ) : null}
            {property.status === "suspended" ? (
              <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
                This listing was suspended by ZedBookIt. Contact support to have it reviewed.
              </Text>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value, small }: { label: string; value: number; small?: boolean }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ ...(small ? theme.typography.h3 : theme.typography.h1), color: theme.colors.textPrimary }}>{value}</Text>
      <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>{label}</Text>
    </View>
  );
}
