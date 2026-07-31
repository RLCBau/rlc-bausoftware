import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RLC_CONTROL, RLC_RADIUS, RLC_TEXT_SCALING, RLC_TYPOGRAPHY, createRlcStyles } from "../ui/theme";
export type RlcCategoryItem = {
  key: string;
  label: string;
  count: number;
  icon: "clipboard-outline" | "camera-outline" | "book-outline" | "newspaper-outline" | "pricetag-outline" | "receipt-outline" | "resize-outline" | "calculator-outline" | "cube-outline" | "document-text-outline";
};
type Props = {
  title?: string;
  items: RlcCategoryItem[];
  activeKey: string;
  onPress: (key: string) => void;
  onRefresh?: () => void;
};
export default function RlcCategoryGrid({
  title = "Übersicht",
  items,
  activeKey,
  onPress,
  onRefresh
}: Props) {
  return <View style={s.box}>
      <View style={s.head}>
        <View style={s.headLeft}>
          <Ionicons name="list-outline" size={20} color={COLORS.accentDark} />
          <Text {...RLC_TEXT_SCALING} style={s.title}>{title}</Text>
        </View>

        {onRefresh ? <Pressable style={s.refreshBtn} onPress={onRefresh}>
            <Ionicons name="refresh-outline" size={18} color={COLORS.accentDark} />
            <Text {...RLC_TEXT_SCALING} style={s.refreshTxt}>Aktualisieren</Text>
          </Pressable> : null}
      </View>

      <View style={s.grid}>
        {items.map(it => {
        const active = activeKey === it.key;
        const zero = Number(it.count || 0) <= 0;
        return <Pressable key={it.key} style={[s.tile, active && s.tileActive]} onPress={() => onPress(it.key)}>
              <View style={[s.iconBox, active && s.iconBoxActive]}>
                <Ionicons name={it.icon} size={21} color={active ? COLORS.textLight : COLORS.accentDark} />
              </View>

              <Text {...RLC_TEXT_SCALING} style={[s.label, active && s.labelActive]} numberOfLines={2}>
                {it.label}
              </Text>

              <View style={[s.badge, active && s.badgeActive, zero && s.badgeZero]}>
                <Text {...RLC_TEXT_SCALING} style={[s.badgeTxt, active && s.badgeTxtActive, zero && s.badgeTxtZero]}>
                  {it.count}
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={18} color={active ? COLORS.textLight : COLORS.sub} />
            </Pressable>;
      })}
      </View>
    </View>;
}
const s = createRlcStyles("RlcCategoryGrid", {
  box: {
    marginTop: 18,
    padding: 14,
    borderRadius: RLC_RADIUS.hero,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12
  },
  headLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  title: {
    ...RLC_TYPOGRAPHY.sectionTitle,
    color: COLORS.text
  },
  refreshBtn: {
    minHeight: RLC_CONTROL.compactMinHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: COLORS.accentSoft
  },
  refreshTxt: {
    ...RLC_TYPOGRAPHY.label,
    color: COLORS.accentDark
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  tile: {
    width: "100%",
    minHeight: 48,
    borderRadius: RLC_RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.inputBg,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    gap: 8
  },
  tileActive: {
    backgroundColor: COLORS.accentDark,
    borderColor: COLORS.accentDark
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accentSoft
  },
  iconBoxActive: {
    backgroundColor: "rgba(255,255,255,0.18)"
  },
  label: {
    flex: 1,
    ...RLC_TYPOGRAPHY.cardTitle,
    color: COLORS.text
  },
  labelActive: {
    color: COLORS.textLight
  },
  badge: {
    minWidth: 28,
    height: 28,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accentDark
  },
  badgeActive: {
    backgroundColor: COLORS.textLight
  },
  badgeZero: {
    backgroundColor: COLORS.card2
  },
  badgeTxt: {
    ...RLC_TYPOGRAPHY.label,
    fontWeight: "600",
    color: COLORS.textLight
  },
  badgeTxtActive: {
    color: COLORS.accentDark
  },
  badgeTxtZero: {
    color: COLORS.sub
  }
});
