import React, { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { X } from "lucide-react-native";
import { useTheme } from "@/theme";
import { Button } from "./Button";
import { PROPERTY_TYPES } from "@/constants/categories";
import { AMENITY_LABELS, DEFAULT_AMENITIES } from "@/constants/amenities";
import { ZAMBIA_CITIES } from "@/constants/locations";
import type { PropertyFilters, PropertyType } from "@/types";

const SCREEN_HEIGHT = Dimensions.get("window").height;

export function FilterSheet({
  visible,
  initialFilters,
  onClose,
  onApply,
}: {
  visible: boolean;
  initialFilters: PropertyFilters;
  onClose: () => void;
  onApply: (filters: PropertyFilters) => void;
}) {
  const theme = useTheme();
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const [draft, setDraft] = useState<PropertyFilters>(initialFilters);
  // Latest filters without re-running the open/close animation whenever the parent re-renders.
  const initialRef = useRef(initialFilters);
  initialRef.current = initialFilters;

  useEffect(() => {
    if (visible) {
      setDraft(initialRef.current);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 18, mass: 0.9 }).start();
    } else {
      Animated.timing(translateY, { toValue: SCREEN_HEIGHT, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible, translateY]);

  function toggleAmenity(key: keyof typeof DEFAULT_AMENITIES) {
    setDraft((d) => ({
      ...d,
      amenities: { ...d.amenities, [key]: !d.amenities?.[key] },
    }));
  }

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: theme.colors.overlay }} onPress={onClose} />
      <Animated.View
        style={{
          transform: [{ translateY }],
          backgroundColor: theme.colors.background,
          borderTopLeftRadius: theme.radius.xl,
          borderTopRightRadius: theme.radius.xl,
          maxHeight: SCREEN_HEIGHT * 0.85,
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            padding: theme.spacing.lg,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          <Text style={{ ...theme.typography.h2, color: theme.colors.textPrimary }}>Filters</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <X size={22} color={theme.colors.textMuted} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
          <FilterGroup title="Property type">
            <ChipRow>
              {PROPERTY_TYPES.map((t) => (
                <Chip
                  key={t.value}
                  label={t.label}
                  selected={draft.type === t.value}
                  onPress={() => setDraft((d) => ({ ...d, type: d.type === t.value ? undefined : (t.value as PropertyType) }))}
                />
              ))}
            </ChipRow>
          </FilterGroup>

          <FilterGroup title="City">
            <ChipRow>
              {ZAMBIA_CITIES.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  selected={draft.city === c.name}
                  onPress={() => setDraft((d) => ({ ...d, city: d.city === c.name ? undefined : c.name }))}
                />
              ))}
            </ChipRow>
          </FilterGroup>

          <FilterGroup title="Bedrooms (minimum)">
            <ChipRow>
              {[1, 2, 3, 4, 5].map((n) => (
                <Chip
                  key={n}
                  label={`${n}+`}
                  selected={draft.bedrooms === n}
                  onPress={() => setDraft((d) => ({ ...d, bedrooms: d.bedrooms === n ? undefined : n }))}
                />
              ))}
            </ChipRow>
          </FilterGroup>

          <FilterGroup title="Bathrooms (minimum)">
            <ChipRow>
              {[1, 2, 3, 4].map((n) => (
                <Chip
                  key={n}
                  label={`${n}+`}
                  selected={draft.bathrooms === n}
                  onPress={() => setDraft((d) => ({ ...d, bathrooms: d.bathrooms === n ? undefined : n }))}
                />
              ))}
            </ChipRow>
          </FilterGroup>

          <FilterGroup title="Amenities">
            <ChipRow>
              {(Object.keys(AMENITY_LABELS) as (keyof typeof AMENITY_LABELS)[]).map((key) => (
                <Chip
                  key={key}
                  label={`${AMENITY_LABELS[key].emoji} ${AMENITY_LABELS[key].label}`}
                  selected={!!draft.amenities?.[key]}
                  onPress={() => toggleAmenity(key)}
                />
              ))}
            </ChipRow>
          </FilterGroup>
        </ScrollView>

        <View style={{ flexDirection: "row", gap: 12, padding: theme.spacing.lg, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
          <View style={{ flex: 1 }}>
            <Button label="Clear all" variant="outline" onPress={() => setDraft({})} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Show results" onPress={() => onApply(draft)} />
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View>
      <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.textPrimary, marginBottom: 10 }}>{title}</Text>
      {children}
    </View>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>;
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: theme.radius.pill,
        backgroundColor: selected ? theme.colors.accent : theme.colors.surface,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
      }}
    >
      <Text style={{ ...theme.typography.caption, color: selected ? theme.colors.textInverse : theme.colors.textSecondary }}>
        {label}
      </Text>
    </Pressable>
  );
}
