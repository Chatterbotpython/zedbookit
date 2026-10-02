import React, { useEffect, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { listReports, resolveReport } from "@/services/admin.service";
import { formatRelative } from "@/utils/date";
import type { Report } from "@/types";
import { logError, toUserMessage } from "@/services/errors";


export default function AdminReports() {
  const theme = useTheme();
  const { showToast } = useToast();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    setError(null);
    listReports()
      .then(setReports)
      .catch((e) => {
        setReports([]);
        logError("admin.reports", e);
        setError(toUserMessage(e, "admin"));
      });
  }

  useEffect(reload, []);

  async function handleResolve(report: Report, status: Report["status"]) {
    try {
      await resolveReport(report.id, status);
      showToast("Report updated.", "success");
      reload();
    } catch (e) {
      logError("admin.reportAction", e);
      showToast(toUserMessage(e, "admin"), "error");
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={["top"]}>
      <Text style={{ ...theme.typography.h1, color: theme.colors.textPrimary, padding: theme.spacing.lg, paddingBottom: 4 }}>
        Reports
      </Text>
      {error ? (
        <View style={{ paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm }}>
          <Card style={{ padding: 14 }}>
            <Text style={{ ...theme.typography.body, color: theme.colors.danger, marginBottom: 10 }}>{error}</Text>
            <Button label="Retry" variant="outline" size="sm" onPress={reload} />
          </Card>
        </View>
      ) : null}

      <FlatList
        data={reports ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingTop: 0, flexGrow: 1 }}
        ListEmptyComponent={
          reports !== null && !error ? <EmptyState emoji="🚩" title="No reports." subtitle="Nothing has been flagged." /> : null
        }
        renderItem={({ item }) => (
          <Card style={{ padding: 14, marginBottom: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.textPrimary }}>
                {item.targetType} report
              </Text>
              <Badge label={item.status} tone={item.status === "open" ? "warning" : "neutral"} />
            </View>
            <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary, marginTop: 4 }}>{item.reason}</Text>
            {item.details ? (
              <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 4 }}>{item.details}</Text>
            ) : null}
            <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 6 }}>
              {formatRelative(item.createdAt)}
            </Text>
            {item.status === "open" ? (
              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                <View style={{ flex: 1 }}>
                  <Button label="Dismiss" variant="outline" size="sm" onPress={() => handleResolve(item, "dismissed")} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Mark reviewed" size="sm" onPress={() => handleResolve(item, "reviewed")} />
                </View>
              </View>
            ) : null}
          </Card>
        )}
      />
    </SafeAreaView>
  );
}
