import React, { useState } from "react";
import { Dimensions, FlatList, Modal, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { X } from "lucide-react-native";
import { useTheme } from "@/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

/**
 * Swipeable, paginated gallery with a fullscreen viewer. Pinch-to-zoom is
 * left out of this MVP pass (it needs either a native zoom lib or a fair
 * amount of custom gesture math) — noted as a follow-up in the README.
 */
export function PropertyGallery({ photos, height = 320 }: { photos: string[]; height?: number }) {
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  if (photos.length === 0) {
    return (
      <View style={{ height, backgroundColor: theme.colors.skeleton, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: theme.colors.textMuted }}>No photos yet</Text>
      </View>
    );
  }

  return (
    <View>
      <FlatList
        data={photos}
        keyExtractor={(uri, i) => `${uri}-${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))}
        renderItem={({ item }) => (
          <Pressable onPress={() => setFullscreen(true)}>
            <Image source={{ uri: item }} style={{ width: SCREEN_WIDTH, height }} contentFit="cover" transition={150} />
          </Pressable>
        )}
      />
      <View style={{ position: "absolute", bottom: 12, alignSelf: "center", flexDirection: "row", gap: 6 }}>
        {photos.map((_, i) => (
          <View
            key={i}
            style={{
              width: i === index ? 16 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: i === index ? "#FFFFFF" : "rgba(255,255,255,0.5)",
            }}
          />
        ))}
      </View>

      <Modal visible={fullscreen} animationType="fade" onRequestClose={() => setFullscreen(false)}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <FlatList
            data={photos}
            keyExtractor={(uri, i) => `full-${uri}-${i}`}
            horizontal
            pagingEnabled
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * i, index: i })}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <Image source={{ uri: item }} style={{ width: SCREEN_WIDTH, height: "100%" }} contentFit="contain" />
            )}
          />
          <Pressable
            onPress={() => setFullscreen(false)}
            style={{
              position: "absolute",
              top: 56,
              right: 20,
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: "rgba(255,255,255,0.15)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={22} color="#fff" />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}
