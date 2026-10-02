import React, { useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { ArrowLeft, X } from "lucide-react-native";
import { useTheme } from "@/theme";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { MAINTENANCE_CATEGORIES, URGENCY_LEVELS } from "@/constants/categories";
import { uploadMaintenancePhoto, uploadMaintenanceVideo } from "@/services/storage.service";
import { submitMaintenanceRequest } from "@/services/maintenance.service";
import { logError, toUserMessage } from "@/services/errors";
import { getProperty } from "@/services/properties.service";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/config/firebase";
import type { MaintenanceCategory, MaintenanceUrgency } from "@/types";

const STEP_TITLES = [
  "What needs attention?",
  "What is wrong?",
  "How urgent is it?",
  "Add photos",
  "Add a video (optional)",
  "Preferred access time",
  "Review & submit",
];

export default function ReportMaintenanceIssue() {
  const theme = useTheme();
  const { propertyId, tenancyId } = useLocalSearchParams<{ propertyId: string; tenancyId: string }>();
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<MaintenanceCategory | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<MaintenanceUrgency | null>(null);
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [preferredAccessTime, setPreferredAccessTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  function canAdvance(): boolean {
    switch (step) {
      case 0:
        return category !== null;
      case 1:
        return title.trim().length > 2 && description.trim().length > 2;
      case 2:
        return urgency !== null;
      default:
        return true;
    }
  }

  async function pickPhotos() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 6,
    });
    if (!result.canceled) {
      setPhotoUris((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, 6));
    }
  }

  async function pickVideo() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.6,
      videoMaxDuration: 30,
    });
    if (!result.canceled && result.assets[0]) {
      setVideoUri(result.assets[0].uri);
    }
  }

  async function handleSubmit() {
    if (!profile || !propertyId || !tenancyId || !category || !urgency || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    try {
      const property = await getProperty(propertyId);
      if (!property) throw new Error("not-found");

      // Create the request first (without photos) to get an id, then upload
      // photos into maintenance/{id}/photos and patch the doc — this keeps
      // storage paths tied to a real maintenance request id rather than a
      // temporary one.
      const { id, referenceNumber } = await submitMaintenanceRequest({
        propertyId,
        tenancyId,
        tenantId: profile.id,
        landlordId: property.landlordId,
        category,
        title: title.trim(),
        description: description.trim(),
        urgency,
        photos: [],
        preferredAccessTime: preferredAccessTime.trim() || undefined,
      });

      if (photoUris.length > 0 || videoUri) {
        const uploadedPhotos = await Promise.all(
          photoUris.map((uri, i) => uploadMaintenancePhoto(id, uri, i))
        );
        const videoUrl = videoUri ? await uploadMaintenanceVideo(id, videoUri) : undefined;
        await updateDoc(doc(db, "maintenanceRequests", id), {
          photos: uploadedPhotos,
          ...(videoUrl ? { videoUrl } : {}),
        });
      }

      showToast(`Maintenance request submitted — ${referenceNumber}`, "success");
      router.replace(`/maintenance/${id}`);
    } catch (error) {
      logError("maintenance.submit", error);
      showToast(toUserMessage(error, "maintenance"), "error");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  function goNext() {
    if (step === STEP_TITLES.length - 1) {
      handleSubmit();
    } else {
      setStep((s) => s + 1);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: theme.spacing.lg, paddingBottom: 0 }}>
        <Pressable onPress={() => (step === 0 ? router.back() : setStep((s) => s - 1))} hitSlop={10}>
          <ArrowLeft size={22} color={theme.colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1, height: 4, backgroundColor: theme.colors.divider, borderRadius: 2, marginLeft: 14 }}>
          <View
            style={{
              width: `${((step + 1) / STEP_TITLES.length) * 100}%`,
              height: 4,
              backgroundColor: theme.colors.accent,
              borderRadius: 2,
            }}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 140 }}>
        <Text style={{ ...theme.typography.h1, color: theme.colors.textPrimary, marginBottom: theme.spacing.lg }}>
          {STEP_TITLES[step]}
        </Text>

        {step === 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {MAINTENANCE_CATEGORIES.map((cat) => (
              <Pressable
                key={cat.value}
                onPress={() => setCategory(cat.value)}
                style={{
                  width: "47%",
                  padding: 14,
                  borderRadius: theme.radius.md,
                  backgroundColor: category === cat.value ? theme.colors.accentSubtle : theme.colors.surface,
                  borderWidth: 1.5,
                  borderColor: category === cat.value ? theme.colors.accent : theme.colors.border,
                }}
              >
                <Text style={{ fontSize: 24 }}>{cat.emoji}</Text>
                <Text style={{ ...theme.typography.captionMedium, color: theme.colors.textPrimary, marginTop: 6 }}>
                  {cat.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {step === 1 ? (
          <View>
            <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.textPrimary, marginBottom: 8 }}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Kitchen sink leaking"
              placeholderTextColor={theme.colors.textMuted}
              style={inputStyle(theme)}
            />
            <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.textPrimary, marginTop: theme.spacing.md, marginBottom: 8 }}>
              Description
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Water is leaking from underneath the sink."
              placeholderTextColor={theme.colors.textMuted}
              multiline
              numberOfLines={5}
              style={[inputStyle(theme), { minHeight: 120, textAlignVertical: "top" }]}
            />
          </View>
        ) : null}

        {step === 2 ? (
          <View style={{ gap: 10 }}>
            {URGENCY_LEVELS.map((level) => (
              <Pressable
                key={level.value}
                onPress={() => setUrgency(level.value)}
                style={{
                  padding: 14,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.surface,
                  borderWidth: 1.5,
                  borderColor: urgency === level.value ? theme.colors[level.color] : theme.colors.border,
                }}
              >
                <Text style={{ ...theme.typography.bodyMedium, color: theme.colors[level.color] }}>{level.label}</Text>
                <Text style={{ ...theme.typography.caption, color: theme.colors.textSecondary, marginTop: 2 }}>
                  {level.description}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {step === 3 ? (
          <View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: theme.spacing.md }}>
              {photoUris.map((uri) => (
                <View key={uri} style={{ position: "relative" }}>
                  <Image source={{ uri }} style={{ width: 88, height: 88, borderRadius: theme.radius.sm }} />
                  <Pressable
                    onPress={() => setPhotoUris((prev) => prev.filter((u) => u !== uri))}
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      backgroundColor: theme.colors.danger,
                      borderRadius: 10,
                      padding: 3,
                    }}
                  >
                    <X size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </View>
            <Button label="Add photos" variant="outline" onPress={pickPhotos} fullWidth={false} />
            <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 8 }}>
              Up to 6 photos. This helps the landlord assess the problem quickly.
            </Text>
          </View>
        ) : null}

        {step === 4 ? (
          <View>
            {videoUri ? (
              <View style={{ marginBottom: theme.spacing.md }}>
                <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary }}>Video attached ✓</Text>
                <Pressable onPress={() => setVideoUri(null)}>
                  <Text style={{ ...theme.typography.captionMedium, color: theme.colors.danger, marginTop: 6 }}>Remove</Text>
                </Pressable>
              </View>
            ) : (
              <Button label="Add a short video" variant="outline" onPress={pickVideo} fullWidth={false} />
            )}
            <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 8 }}>
              Optional — useful for problems that are hard to explain in photos, like a strange noise.
            </Text>
          </View>
        ) : null}

        {step === 5 ? (
          <View>
            <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.textPrimary, marginBottom: 8 }}>
              When can someone access the property?
            </Text>
            <TextInput
              value={preferredAccessTime}
              onChangeText={setPreferredAccessTime}
              placeholder="e.g. Weekday mornings after 9am"
              placeholderTextColor={theme.colors.textMuted}
              style={inputStyle(theme)}
            />
          </View>
        ) : null}

        {step === 6 ? (
          <View style={{ gap: 10 }}>
            <ReviewRow label="Category" value={MAINTENANCE_CATEGORIES.find((c) => c.value === category)?.label ?? ""} />
            <ReviewRow label="Title" value={title} />
            <ReviewRow label="Description" value={description} />
            <ReviewRow label="Urgency" value={URGENCY_LEVELS.find((u) => u.value === urgency)?.label ?? ""} />
            <ReviewRow label="Photos" value={`${photoUris.length} attached`} />
            <ReviewRow label="Video" value={videoUri ? "1 attached" : "None"} />
            <ReviewRow label="Access time" value={preferredAccessTime || "Not specified"} />
          </View>
        ) : null}
      </ScrollView>

      <View style={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xl }}>
        <Button
          label={step === STEP_TITLES.length - 1 ? "Submit request" : "Continue"}
          onPress={goNext}
          disabled={!canAdvance()}
          loading={submitting}
        />
      </View>
    </SafeAreaView>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.divider }}>
      <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>{label}</Text>
      <Text style={{ ...theme.typography.body, color: theme.colors.textPrimary, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function inputStyle(theme: ReturnType<typeof useTheme>) {
  return {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    color: theme.colors.textPrimary,
    fontSize: 16,
  } as const;
}
