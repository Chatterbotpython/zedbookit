import { Platform } from "react-native";

/**
 * Typography scale. Uses the system font (San Francisco / Roboto) for a native,
 * premium feel rather than a generic web font — this is what makes the app read
 * as "Apple-like" rather than "Bootstrap template".
 */
export const fontFamily = Platform.select({
  ios: "System",
  android: "sans-serif",
  default: "System",
});

export const typography = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: "700" as const, letterSpacing: -0.5 },
  h1: { fontSize: 28, lineHeight: 34, fontWeight: "700" as const, letterSpacing: -0.3 },
  h2: { fontSize: 22, lineHeight: 28, fontWeight: "700" as const, letterSpacing: -0.2 },
  h3: { fontSize: 18, lineHeight: 24, fontWeight: "600" as const },
  bodyLarge: { fontSize: 17, lineHeight: 24, fontWeight: "400" as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400" as const },
  bodyMedium: { fontSize: 15, lineHeight: 22, fontWeight: "600" as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "400" as const },
  captionMedium: { fontSize: 13, lineHeight: 18, fontWeight: "600" as const },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: "600" as const, letterSpacing: 0.3 },
};
