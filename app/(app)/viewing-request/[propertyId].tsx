import React, { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar } from "react-native-calendars";
import { useTheme } from "@/theme";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { FullScreenLoader } from "@/components/FullScreenLoader";
import { useToast } from "@/components/Toast";
import { useAsyncData } from "@/hooks/useAsyncData";
import { getProperty } from "@/services/properties.service";
import { submitViewingRequest } from "@/services/viewingRequests.service";
import {
  formatTimeInput,
  isWithinViewingHours,
  normalizeTimeInput,
  quickTimesFor,
  validateViewingSlot,
} from "@/services/viewingRequests.logic";
import { isListedStatus } from "@/constants/propertyStatus";
import { logError, toUserMessage } from "@/services/errors";
import {
  VIEWING_EARLIEST_TIME,
  VIEWING_LATEST_TIME,
  VIEWING_MAX_DAYS_AHEAD,
  VIEWING_MESSAGE_MAX_LENGTH,
} from "@/constants/viewing";
import { format, addDays } from "date-fns";

export default function ViewingRequestFlow() {
  const theme = useTheme();
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [date, setDate] = useState<string | null>(null);
  const [timeText, setTimeText] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false); // blocks a second tap before React re-renders the disabled button

  const property = useAsyncData(() => getProperty(propertyId as string), [propertyId], {
    enabled: !!propertyId,
    context: "property",
  });

  const now = useMemo(() => new Date(), []);
  const minDate = format(now, "yyyy-MM-dd");
  const maxDate = format(addDays(now, VIEWING_MAX_DAYS_AHEAD), "yyyy-MM-dd");
  const quickTimes = quickTimesFor(date, new Date());

  // The tenant types (or taps) their own time. Validation mirrors firestore.rules exactly.
  const time = normalizeTimeInput(timeText);
  let timeProblem: string | null = null;
  if (timeText.length === 5) {
    if (!time) timeProblem = "Enter the time as 24-hour HH:mm, for example 13:15.";
    else if (!isWithinViewingHours(time)) {
      timeProblem = `Viewings can be requested between ${VIEWING_EARLIEST_TIME} and ${VIEWING_LATEST_TIME}.`;
    } else if (date) {
      const check = validateViewingSlot({ requestedDate: date, requestedTime: time }, new Date());
      if (!check.ok) timeProblem = check.reason;
    }
  }
  const canSubmit = !!date && !!time && !timeProblem;

  if (property.loading) return <FullScreenLoader />;
  if (property.error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: "center" }}>
        <ErrorState message={property.error} onRetry={property.reload} />
      </SafeAreaView>
    );
  }
  if (!property.data || !isListedStatus(property.data.status)) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: "center", padding: theme.spacing.lg, gap: 12 }}>
        <Text style={{ ...theme.typography.h2, color: theme.colors.textPrimary, textAlign: "center" }}>
          This property isn't available for viewings.
        </Text>
        <Button label="Go back" variant="outline" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const listing = property.data;

  async function handleSubmit() {
    if (inFlight.current) return;
    if (!profile || !date || !time || timeProblem) {
      showToast(timeProblem ?? "Choose a date and time first.", "error");
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    try {
      await submitViewingRequest({
        propertyId: listing.id,
        tenant: { id: profile.id, firstName: profile.firstName, lastName: profile.lastName },
        requestedDate: date,
        requestedTime: time,
        message,
      });
      showToast("Viewing request sent. We'll let you know when the landlord responds.", "success");
      router.replace("/(tenant)/activity");
    } catch (error) {
      logError("viewingRequest.submit", error);
      showToast(toUserMessage(error, "viewing"), "error");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <Text style={{ ...theme.typography.h1, color: theme.colors.textPrimary }}>Request a viewing</Text>
        <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary, marginTop: 6 }} numberOfLines={2}>
          {listing.title}
        </Text>
        <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary, marginTop: 4, marginBottom: theme.spacing.lg }}>
          Choose a date and time that works for you — the landlord will confirm.
        </Text>

        <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.textPrimary, marginBottom: 8 }}>Choose date</Text>
        <View style={{ borderRadius: theme.radius.md, overflow: "hidden", marginBottom: theme.spacing.lg }}>
          <Calendar
            minDate={minDate}
            maxDate={maxDate}
            onDayPress={(day) => setDate(day.dateString)}
            markedDates={date ? { [date]: { selected: true, selectedColor: theme.colors.accent } } : {}}
            theme={{
              calendarBackground: theme.colors.surface,
              dayTextColor: theme.colors.textPrimary,
              monthTextColor: theme.colors.textPrimary,
              todayTextColor: theme.colors.accent,
              arrowColor: theme.colors.accent,
              textDisabledColor: theme.colors.textMuted,
            }}
          />
        </View>

        <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.textPrimary, marginBottom: 8 }}>Choose time</Text>
        <TextInput
          value={timeText}
          onChangeText={(t) => setTimeText(formatTimeInput(t))}
          keyboardType="number-pad"
          maxLength={5}
          placeholder="HH:mm, e.g. 13:15"
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="Viewing time, 24-hour format"
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: timeProblem ? theme.colors.danger : theme.colors.border,
            padding: 14,
            fontSize: 18,
            color: theme.colors.textPrimary,
          }}
        />
        <Text style={{ ...theme.typography.caption, color: timeProblem ? theme.colors.danger : theme.colors.textMuted, marginTop: 6 }}>
          {timeProblem ?? `Use 24-hour time between ${VIEWING_EARLIEST_TIME} and ${VIEWING_LATEST_TIME}.`}
        </Text>
        {quickTimes.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10, marginBottom: theme.spacing.lg }}>
            {quickTimes.map((slot) => (
              <Pressable
                key={slot}
                onPress={() => setTimeText(slot)}
                accessibilityRole="button"
                accessibilityState={{ selected: time === slot }}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: theme.radius.pill,
                  backgroundColor: time === slot ? theme.colors.accent : theme.colors.surface,
                  borderWidth: 1,
                  borderColor: time === slot ? theme.colors.accent : theme.colors.border,
                }}
              >
                <Text style={{ color: time === slot ? theme.colors.textInverse : theme.colors.textPrimary }}>{slot}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={{ marginBottom: theme.spacing.lg }} />
        )}

        <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.textPrimary, marginBottom: 8 }}>
          Message (optional)
        </Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          maxLength={VIEWING_MESSAGE_MAX_LENGTH}
          placeholder="Anything you'd like the landlord to know..."
          placeholderTextColor={theme.colors.textMuted}
          multiline
          numberOfLines={4}
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: 14,
            minHeight: 100,
            textAlignVertical: "top",
            color: theme.colors.textPrimary,
          }}
        />
      </ScrollView>

      <View style={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xl }}>
        <Button label="Submit request" onPress={handleSubmit} loading={submitting} disabled={!canSubmit || submitting} />
      </View>
    </SafeAreaView>
  );
}
