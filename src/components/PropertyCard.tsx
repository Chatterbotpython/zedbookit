import React from "react";
import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { Heart } from "lucide-react-native";
import { useTheme } from "@/theme";
import { formatRent } from "@/utils/currency";
import { PROPERTY_TYPES } from "@/constants/categories";
import { VerifiedBadge } from "./Badge";
import type { Property } from "@/types";

interface Props {
  property: Property;
  isFavorited: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
}

export function PropertyCard({ property, isFavorited, onPress, onToggleFavorite }: Props) {
  const theme = useTheme();
  const typeLabel = PROPERTY_TYPES.find((t) => t.value === property.type)?.label ?? property.type;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.95 : 1, marginBottom: theme.spacing.lg }]}
    >
      <View style={{ borderRadius: theme.radius.lg, overflow: "hidden" }}>
        <Image
          source={{ uri: property.photos[0] }}
          style={{ width: "100%", height: 200, backgroundColor: theme.colors.skeleton }}
          contentFit="cover"
          transition={200}
        />
        <View style={{ position: "absolute", top: 12, left: 12 }}>
          {property.isVerified ? <VerifiedBadge /> : null}
        </View>
        <Pressable
          onPress={onToggleFavorite}
          hitSlop={10}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: "rgba(11,14,18,0.45)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Heart
            size={18}
            color="#FFFFFF"
            fill={isFavorited ? "#FFFFFF" : "transparent"}
            strokeWidth={2}
          />
        </Pressable>
      </View>

      <View style={{ paddingTop: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Text style={{ ...theme.typography.h3, color: theme.colors.textPrimary, flex: 1 }} numberOfLines={1}>
            {property.title}
          </Text>
        </View>
        <Text style={{ ...theme.typography.bodyMedium, color: theme.colors.accent, marginTop: 2 }}>
          {formatRent(property.price, property.rentFrequency)}
        </Text>
        <Text style={{ ...theme.typography.caption, color: theme.colors.textSecondary, marginTop: 2 }}>
          📍 {property.location.area}, {property.location.city}
        </Text>
        <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
          <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>{typeLabel}</Text>
          <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
            {property.bedrooms} bed
          </Text>
          <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
            {property.bathrooms} bath
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
