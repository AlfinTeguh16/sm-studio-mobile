import React from "react";
import { ViewStyle } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
  Edge,
} from "react-native-safe-area-context";

type Size = "xs" | "sm" | "md" | "none";

const PAD: Record<Size, { top: number; bottom: number }> = {
  none: { top: 0, bottom: 0 },
  xs:   { top: 0.1, bottom: 0.1 },
  sm:   { top: 6, bottom: 10 },
  md:   { top: 10, bottom: 16 },
};

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
  /** skala padding ekstra di luar insets (default: "sm") */
  size?: Size;
  /** edges mana yang mau dipakai (default: top & bottom) */
  edges?: Edge[];
  /** tambahan padding manual */
  topExtra?: number;
  bottomExtra?: number;
  backgroundColor?: string;
};

export default function SafeWrap({
  children,
  style,
  size = "xs",
  edges = ["top", "bottom"],
  topExtra = 0,
  bottomExtra = 0,
  backgroundColor = "#fff",
}: Props) {
  const insets = useSafeAreaInsets();

  const useTop = edges.includes("top" as Edge);
  const useBottom = edges.includes("bottom" as Edge);

  const paddingTop =
    (useTop ? insets.top : 0) + PAD[size].top + topExtra;
  const paddingBottom =
    (useBottom ? insets.bottom : 0) + PAD[size].bottom + bottomExtra;

  return (
    <SafeAreaView
      edges={edges}
      style={[
        { flex: 1, backgroundColor, paddingTop, paddingBottom },
        style,
      ]}
    >
      {children}
    </SafeAreaView>
  );
}
