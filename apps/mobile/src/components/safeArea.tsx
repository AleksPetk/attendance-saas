import type { ReactNode } from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space } from "../theme/tokens";

/**
 * Small gap above chrome, on top of the real device inset.
 * This is the only extra top spacing; do not stack another status-bar band on it.
 */
export const topComfortGap = space.sm;

/**
 * Full-screen modal windows often report a zero native inset.
 * Padding comes from the app SafeAreaProvider, which has the real device insets.
 */
export function FullScreenSafeArea({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }, style]}>
      {children}
    </View>
  );
}

/** iOS page sheets already start below the status area. Android modals do not. */
export function useSheetSafePadding(): ViewStyle {
  const insets = useSafeAreaInsets();
  return {
    paddingTop: Platform.OS === "ios" ? 0 : insets.top,
    paddingBottom: insets.bottom,
    paddingLeft: insets.left,
    paddingRight: insets.right,
  };
}
