import { useColorScheme } from "react-native";
import { lightColors, darkColors, type ThemeColors } from "./colors";
import { typography, fontFamily } from "./typography";
import { spacing, radius, shadow } from "./spacing";

export interface Theme {
  colors: ThemeColors;
  typography: typeof typography;
  spacing: typeof spacing;
  radius: typeof radius;
  shadow: typeof shadow;
  fontFamily: typeof fontFamily;
  isDark: boolean;
}

/** Central theme hook — every screen/component should pull colors from here
 * rather than hard-coding hex values, so light/dark mode stay in sync app-wide. */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  return {
    colors: isDark ? darkColors : lightColors,
    typography,
    spacing,
    radius,
    shadow,
    fontFamily,
    isDark,
  };
}

export * from "./colors";
export * from "./typography";
export * from "./spacing";
