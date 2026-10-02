/**
 * ZedBookIt design system — colors.
 * Direction: Apple x Airbnb x premium fintech, with a warm Zambian accent.
 * Primary accent is a deep emerald ("K" for Kwacha green meets copper-earth undertone),
 * paired with a warm copper secondary for CTAs that need to feel premium, not corporate.
 */

const palette = {
  emerald50: "#EAF7F1",
  emerald100: "#CBEBDD",
  emerald300: "#6FC6A0",
  emerald500: "#1E7A5C",
  emerald600: "#166249",
  emerald700: "#0F4A38",

  copper300: "#E8B786",
  copper500: "#C8823E",
  copper600: "#A6672D",

  ink900: "#0B0E12",
  ink800: "#12161C",
  ink700: "#1B2028",
  ink600: "#252B35",
  ink500: "#3A4250",
  ink300: "#6B7280",
  ink100: "#E4E7EC",
  ink50: "#F7F8FA",

  white: "#FFFFFF",
  red500: "#D64545",
  amber500: "#D99A2B",
  blue500: "#3B6FE0",
};

export const lightColors = {
  background: palette.ink50,
  surface: palette.white,
  surfaceElevated: palette.white,
  surfaceSubtle: palette.emerald50,
  border: palette.ink100,
  textPrimary: palette.ink900,
  textSecondary: palette.ink500,
  textMuted: palette.ink300,
  textInverse: palette.white,
  accent: palette.emerald500,
  accentPressed: palette.emerald600,
  accentSubtle: palette.emerald100,
  secondaryAccent: palette.copper500,
  secondaryAccentPressed: palette.copper600,
  danger: palette.red500,
  warning: palette.amber500,
  info: palette.blue500,
  success: palette.emerald500,
  overlay: "rgba(11,14,18,0.55)",
  glass: "rgba(255,255,255,0.72)",
  skeleton: palette.ink100,
  tabBarBackground: "rgba(255,255,255,0.92)",
  divider: palette.ink100,
};

export const darkColors = {
  background: palette.ink900,
  surface: palette.ink800,
  surfaceElevated: palette.ink700,
  surfaceSubtle: palette.emerald700,
  border: palette.ink600,
  textPrimary: palette.ink50,
  textSecondary: palette.ink100,
  textMuted: palette.ink300,
  textInverse: palette.ink900,
  accent: palette.emerald300,
  accentPressed: palette.emerald500,
  accentSubtle: palette.emerald700,
  secondaryAccent: palette.copper300,
  secondaryAccentPressed: palette.copper500,
  danger: "#E77676",
  warning: "#E8B75A",
  info: "#7FA2F0",
  success: palette.emerald300,
  overlay: "rgba(0,0,0,0.6)",
  glass: "rgba(18,22,28,0.72)",
  skeleton: palette.ink600,
  tabBarBackground: "rgba(18,22,28,0.9)",
  divider: palette.ink600,
};

export type ThemeColors = typeof lightColors;
export { palette };
