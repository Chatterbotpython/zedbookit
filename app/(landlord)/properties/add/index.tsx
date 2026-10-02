import React, { useRef, useState } from "react";
import { Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { ArrowLeft, X } from "lucide-react-native";
import { useTheme } from "@/theme";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { PROPERTY_TYPES } from "@/constants/categories";
import { AMENITY_LABELS, DEFAULT_AMENITIES } from "@/constants/amenities";
import { ZAMBIA_CITIES } from "@/constants/locations";
import { createProperty, updateProperty } from "@/services/properties.service";
import { R2UploadError, uploadPropertyPhoto } from "@/services/storage.service";
import { logError, toUserMessage } from "@/services/errors";
import { MAX_PROPERTY_PHOTOS, PHOTO_UPLOAD_CONCURRENCY } from "@/constants/limits";
import { mapWithConcurrency, mergePhotoSelection, remainingPhotoSlots } from "@/utils/photos";
import { formatRent } from "@/utils/currency";
import type { PropertyAmenities, PropertyType, RentFrequency } from "@/types";

const STEP_TITLES = ["Property type", "Photos", "Basic details", "Location", "Amenities", "Preview"];

export default function AddPropertyWizard() {
  const theme = useTheme();
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState(0);
  const [type, setType] = useState<PropertyType | null>(null);
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [rentFrequency, setRentFrequency] = useState<RentFrequency>("monthly");
  const [bedrooms, setBedrooms] = useState("1");
  const [bathrooms, setBathrooms] = useState("1");
  const [parkingSpaces, setParkingSpaces] = useState("0");
  const [cityId, setCityId] = useState(ZAMBIA_CITIES[0]!.id);
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [hideExactAddress, setHideExactAddress] = useState(true);
  const [amenities, setAmenities] = useState<PropertyAmenities>(DEFAULT_AMENITIES);
  const [submitting, setSubmitting] = useState(false);
  // Remembers the property doc if photo upload fails after it was created, so
  // pressing Submit for approval again retries the upload instead of creating a duplicate.
  const createdPropertyId = useRef<string | null>(null);

  const inFlight = useRef(false); // blocks a second tap before the disabled state renders
  // True once the listing document exists but its photos failed to attach, so a retry is possible.
  const [needsRetry, setNeedsRetry] = useState(false);

  const city = ZAMBIA_CITIES.find((c) => c.id === cityId)!;

  /**
   * This screen is a hidden TAB, and tab screens stay mounted after you leave them, so its
   * state outlives a submission. Without this reset, `createdPropertyId` still pointed at the
   * FIRST listing and a second "Add property" re-uploaded photos onto it instead of creating a
   * new one - which looked like "only one property at a time".
   */
  function resetWizard() {
    createdPropertyId.current = null;
    setStep(0);
    setType(null);
    setPhotoUris([]);
    setTitle("");
    setDescription("");
    setPrice("");
    setRentFrequency("monthly");
    setBedrooms("1");
    setBathrooms("1");
    setParkingSpaces("0");
    setCityId(ZAMBIA_CITIES[0]!.id);
    setArea("");
    setAddress("");
    setHideExactAddress(true);
    setAmenities(DEFAULT_AMENITIES);
    setNeedsRetry(false);
  }

  function canAdvance(): boolean {
    switch (step) {
      case 0:
        return type !== null;
      case 1:
        return photoUris.length > 0;
      case 2:
        return title.trim().length > 2 && description.trim().length > 5 && Number(price) > 0;
      case 3:
        return area.trim().length > 0;
      default:
        return true;
    }
  }

  async function pickPhotos() {
    const remaining = remainingPhotoSlots(photoUris.length);
    if (remaining === 0) {
      showToast(`You can add up to ${MAX_PROPERTY_PHOTOS} photos per property.`, "info");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: remaining,
    });
    if (result.canceled) return;
    // Merge into the existing selection - never replace/slice it.
    const merged = mergePhotoSelection(photoUris, result.assets.map((a) => a.uri));
    setPhotoUris(merged.photos);
    if (merged.droppedForLimit > 0) {
      showToast(`Only ${MAX_PROPERTY_PHOTOS} photos are allowed - ${merged.droppedForLimit} weren't added.`, "info");
    }
  }


  async function handleSubmit() {
    if (!profile || !type || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    // Which step is running, so an R2 failure isn't reported as a Firestore one.
    let stage: "create" | "upload" | "update" = "create";
    try {
      const id = createdPropertyId.current ?? await createProperty({
        landlordId: profile.id,
        type,
        title: title.trim(),
        description: description.trim(),
        price: Number(price),
        currency: "ZMW",
        rentFrequency,
        bedrooms: Number(bedrooms) || 0,
        bathrooms: Number(bathrooms) || 0,
        parkingSpaces: Number(parkingSpaces) || 0,
        amenities,
        location: {
          province: city.province,
          city: city.name,
          area: area.trim(),
          address: address.trim() || undefined,
          hideExactAddress,
        },
        photos: [],
      });

      createdPropertyId.current = id;

      stage = "upload";
      const uploadedPhotos = await mapWithConcurrency(photoUris, PHOTO_UPLOAD_CONCURRENCY, (uri, i) => uploadPropertyPhoto(id, uri, i));
      stage = "update";
      await updateProperty(id, { photos: uploadedPhotos });

      showToast("Property submitted for approval.", "success");
      resetWizard(); // the next "Add property" must start from a blank form
      router.replace("/(landlord)/properties");
    } catch (error) {
      if (stage === "upload" || stage === "update") setNeedsRetry(true);
      if (stage === "upload") {
        const reason = error instanceof R2UploadError ? error.message : "Photo upload failed.";
        showToast(`Your listing was saved, but its photos weren't uploaded. ${reason} Tap "Submit for approval" to retry.`, "error");
      } else if (stage === "update") {
        showToast(`Photos uploaded, but we couldn't attach them to your listing. ${toUserMessage(error, "property")} Tap "Submit for approval" to retry.`, "error");
      } else {
        logError("property.create", error);
        showToast(toUserMessage(error, "property"), "error");
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  function goNext() {
    if (step === STEP_TITLES.length - 1) handleSubmit();
    else setStep((s) => s + 1);
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
            {PROPERTY_TYPES.map((t) => (
              <Pressable
                key={t.value}
                onPress={() => setType(t.value)}
                style={{
                  width: "47%",
                  padding: 16,
                  borderRadius: theme.radius.md,
                  backgroundColor: type === t.value ? theme.colors.accentSubtle : theme.colors.surface,
                  borderWidth: 1.5,
                  borderColor: type === t.value ? theme.colors.accent : theme.colors.border,
                }}
              >
                <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.textPrimary }}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {step === 1 ? (
          <View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: theme.spacing.md }}>
              {photoUris.map((uri, i) => (
                <View key={uri} style={{ position: "relative" }}>
                  <Image source={{ uri }} style={{ width: 100, height: 100, borderRadius: theme.radius.sm }} />
                  {i === 0 ? (
                    <View
                      style={{
                        position: "absolute",
                        bottom: 4,
                        left: 4,
                        backgroundColor: theme.colors.accent,
                        borderRadius: 6,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                      }}
                    >
                      <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>MAIN</Text>
                    </View>
                  ) : null}
                  <Pressable
                    onPress={() => setPhotoUris((prev) => prev.filter((u) => u !== uri))}
                    style={{ position: "absolute", top: -6, right: -6, backgroundColor: theme.colors.danger, borderRadius: 10, padding: 3 }}
                  >
                    <X size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </View>
            <Button
              label={photoUris.length >= MAX_PROPERTY_PHOTOS ? "Photo limit reached" : "Add photos"}
              variant="outline"
              onPress={pickPhotos}
              disabled={photoUris.length >= MAX_PROPERTY_PHOTOS}
              fullWidth={false}
            />
            <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 8 }}>
              {photoUris.length} / {MAX_PROPERTY_PHOTOS} photos. The first photo becomes the main listing image.
            </Text>
          </View>
        ) : null}

        {step === 2 ? (
          <View>
            <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. 3 Bedroom Modern House" theme={theme} />
            <Field
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="Describe the property..."
              multiline
              theme={theme}
            />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field label="Price (ZMW)" value={price} onChangeText={setPrice} placeholder="8500" keyboardType="numeric" theme={theme} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.textPrimary, marginBottom: 8 }}>Frequency</Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {(["monthly", "weekly", "daily"] as RentFrequency[]).map((freq) => (
                    <Pressable
                      key={freq}
                      onPress={() => setRentFrequency(freq)}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: theme.radius.sm,
                        alignItems: "center",
                        backgroundColor: rentFrequency === freq ? theme.colors.accent : theme.colors.surface,
                        borderWidth: 1,
                        borderColor: rentFrequency === freq ? theme.colors.accent : theme.colors.border,
                      }}
                    >
                      <Text style={{ fontSize: 12, color: rentFrequency === freq ? "#fff" : theme.colors.textPrimary }}>
                        {freq}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field label="Bedrooms" value={bedrooms} onChangeText={setBedrooms} keyboardType="numeric" theme={theme} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Bathrooms" value={bathrooms} onChangeText={setBathrooms} keyboardType="numeric" theme={theme} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Parking" value={parkingSpaces} onChangeText={setParkingSpaces} keyboardType="numeric" theme={theme} />
              </View>
            </View>
          </View>
        ) : null}

        {step === 3 ? (
          <View>
            <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.textPrimary, marginBottom: 8 }}>City</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: theme.spacing.md }}>
              {ZAMBIA_CITIES.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setCityId(c.id)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: theme.radius.pill,
                    backgroundColor: cityId === c.id ? theme.colors.accent : theme.colors.surface,
                    borderWidth: 1,
                    borderColor: cityId === c.id ? theme.colors.accent : theme.colors.border,
                  }}
                >
                  <Text style={{ color: cityId === c.id ? "#fff" : theme.colors.textPrimary }}>{c.name}</Text>
                </Pressable>
              ))}
            </View>
            <Field label="Area / neighbourhood" value={area} onChangeText={setArea} placeholder="e.g. Chalala" theme={theme} />
            <Field label="Street address (optional)" value={address} onChangeText={setAddress} placeholder="Plot 123, ..." theme={theme} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
              <Text style={{ ...theme.typography.body, color: theme.colors.textPrimary, flex: 1 }}>
                Hide exact address publicly
              </Text>
              <Switch value={hideExactAddress} onValueChange={setHideExactAddress} trackColor={{ true: theme.colors.accent }} />
            </View>
          </View>
        ) : null}

        {step === 4 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {(Object.keys(AMENITY_LABELS) as (keyof PropertyAmenities)[]).map((key) => (
              <Pressable
                key={key}
                onPress={() => setAmenities((a) => ({ ...a, [key]: !a[key] }))}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: theme.radius.pill,
                  backgroundColor: amenities[key] ? theme.colors.accent : theme.colors.surface,
                  borderWidth: 1,
                  borderColor: amenities[key] ? theme.colors.accent : theme.colors.border,
                }}
              >
                <Text style={{ color: amenities[key] ? "#fff" : theme.colors.textPrimary }}>
                  {AMENITY_LABELS[key].emoji} {AMENITY_LABELS[key].label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {step === 5 ? (
          <View>
            {photoUris[0] ? (
              <Image source={{ uri: photoUris[0] }} style={{ width: "100%", height: 180, borderRadius: theme.radius.md }} />
            ) : null}
            <Text style={{ ...theme.typography.h2, color: theme.colors.textPrimary, marginTop: 12 }}>{title || "Untitled"}</Text>
            <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.accent, marginTop: 4 }}>
              {price ? formatRent(Number(price), rentFrequency) : "—"}
            </Text>
            <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary, marginTop: 4 }}>
              📍 {area || "—"}, {city.name}
            </Text>
            <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 12 }}>
              This listing will be submitted for admin approval before it appears in search.
            </Text>
            {needsRetry ? (
              <View style={{ marginTop: 16, gap: 8 }}>
                <Text style={{ ...theme.typography.caption, color: theme.colors.textSecondary }}>
                  This listing was saved but its photos haven't finished uploading. Submit again to retry, or discard it and
                  start a new listing.
                </Text>
                <Button label="Discard and start a new listing" variant="outline" onPress={resetWizard} disabled={submitting} />
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xl }}>
        <Button
          label={step === STEP_TITLES.length - 1 ? "Submit for approval" : "Continue"}
          onPress={goNext}
          disabled={!canAdvance()}
          loading={submitting}
        />
      </View>
    </SafeAreaView>
  );
}

function Field({
  label,
  theme,
  ...rest
}: { label: string; theme: ReturnType<typeof useTheme> } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginBottom: theme.spacing.md }}>
      <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.textPrimary, marginBottom: 8 }}>{label}</Text>
      <TextInput
        placeholderTextColor={theme.colors.textMuted}
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: 14,
          color: theme.colors.textPrimary,
          fontSize: 16,
          minHeight: rest.multiline ? 100 : undefined,
          textAlignVertical: rest.multiline ? "top" : "center",
        }}
        {...rest}
      />
    </View>
  );
}
