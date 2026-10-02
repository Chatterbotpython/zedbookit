import React from "react";
import { Text, View } from "react-native";
import { useTheme } from "@/theme";
import { MAINTENANCE_STATUS_LABEL, MAINTENANCE_STATUS_ORDER } from "@/constants/categories";
import { formatDayTime } from "@/utils/date";
import type { MaintenanceStatus, MaintenanceTimelineEvent } from "@/types";

/**
 * Renders the "✓ Request submitted / ● Scheduled / ○ Repair completed" style
 * timeline from the spec. `events` are the actual timeline docs that have
 * happened; any status further down MAINTENANCE_STATUS_ORDER than the most
 * recent event is drawn as an upcoming, unfilled step.
 */
export function MaintenanceTimeline({
  events,
  currentStatus,
}: {
  events: MaintenanceTimelineEvent[];
  currentStatus: MaintenanceStatus;
}) {
  const theme = useTheme();

  if (currentStatus === "cancelled") {
    return (
      <View>
        <Text style={{ ...theme.typography.body, color: theme.colors.danger }}>
          ⊗ This request was cancelled.
        </Text>
      </View>
    );
  }

  const currentIndex = MAINTENANCE_STATUS_ORDER.indexOf(currentStatus as (typeof MAINTENANCE_STATUS_ORDER)[number]);
  const eventByStatus = new Map(events.map((e) => [e.status, e]));

  return (
    <View>
      {MAINTENANCE_STATUS_ORDER.map((status, index) => {
        const event = eventByStatus.get(status);
        const isDone = index < currentIndex || (index === currentIndex && status === "completed");
        const isCurrent = index === currentIndex && status !== "completed";
        const isLast = index === MAINTENANCE_STATUS_ORDER.length - 1;

        const marker = isDone ? "✓" : isCurrent ? "●" : "○";
        const markerColor = isDone
          ? theme.colors.success
          : isCurrent
          ? theme.colors.accent
          : theme.colors.textMuted;

        return (
          <View key={status} style={{ flexDirection: "row" }}>
            <View style={{ alignItems: "center", width: 28 }}>
              <Text style={{ fontSize: 16, color: markerColor }}>{marker}</Text>
              {!isLast ? (
                <View
                  style={{
                    width: 2,
                    flex: 1,
                    minHeight: 28,
                    backgroundColor: isDone ? theme.colors.success : theme.colors.border,
                    marginVertical: 2,
                  }}
                />
              ) : null}
            </View>
            <View style={{ flex: 1, paddingBottom: 18 }}>
              <Text
                style={{
                  ...theme.typography.bodyMedium,
                  color: isDone || isCurrent ? theme.colors.textPrimary : theme.colors.textMuted,
                }}
              >
                {MAINTENANCE_STATUS_LABEL[status]}
              </Text>
              {event ? (
                <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
                  {formatDayTime(event.createdAt)}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
