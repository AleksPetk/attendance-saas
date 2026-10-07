import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppLocale } from "@checkstation/i18n";
import { SUPPORTED_LOCALES } from "@checkstation/i18n";
import {
  PRODUCT_TOUR_SLIDE_COUNT,
  productTourSlides,
  productTourUi,
  type ProductTourSlideCopy,
} from "../../../desktop/src/productTour/productTourContent";
import { FullScreenSafeArea, topComfortGap } from "../components/safeArea";
import { Button } from "../components/ui";
import { colors, radii, shadows, space, touch, type } from "../theme/tokens";
import { MOBILE_TOUR_SLIDES, mobileTourAlt } from "./productTourAssets";
import { resolveProductTourLayout, productTourSafeInsetsForLayout } from "./productTourLayout";

export type ProductTourMode = "first-launch" | "replay-auth" | "replay-help";
export { resolveProductTourLayout, productTourSafeInsetsForLayout } from "./productTourLayout";

const MODAL_ORIENTATIONS = [
  "portrait",
  "portrait-upside-down",
  "landscape",
  "landscape-left",
  "landscape-right",
] as const;

/** Horizontal margin inside the safe-area on phone landscape. */
const PHONE_LANDSCAPE_GUTTER = 12;
/** Usable chrome heights (insets applied separately on those surfaces). */
const PHONE_LANDSCAPE_HEADER_CONTENT = 44;
const PHONE_LANDSCAPE_FOOTER_CONTENT = 56;

type Props = {
  locale: AppLocale;
  mode: ProductTourMode;
  onLocaleChange: (locale: AppLocale) => void;
  onSkip: () => void;
  onClose: () => void;
  onCreateAccount: () => void;
  onSignIn: () => void;
};

export function MobileProductTour({
  locale,
  mode,
  onLocaleChange,
  onSkip,
  onClose,
  onCreateAccount,
  onSignIn,
}: Props) {
  const { width, height } = useWindowDimensions();
  const rawInsets = useSafeAreaInsets();
  const layout = resolveProductTourLayout(width, height);
  const phoneLandscape = layout === "phone-landscape";
  const tabletLandscape = layout === "tablet-landscape";
  const split = tabletLandscape; // portrait/tablet only — phone landscape has its own shell
  const compactPortrait = !phoneLandscape && height < 520;
  const insets = phoneLandscape
    ? productTourSafeInsetsForLayout(layout, rawInsets)
    : rawInsets;
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<ProductTourSlideCopy>>(null);
  const slides = useMemo(() => productTourSlides(locale), [locale]);
  const ui = useMemo(() => productTourUi(locale), [locale]);
  const isLast = index >= PRODUCT_TOUR_SLIDE_COUNT - 1;
  const isFirst = index <= 0;
  const isReplay = mode !== "first-launch";

  const landscapePadLeft = insets.left + PHONE_LANDSCAPE_GUTTER;
  const landscapePadRight = insets.right + PHONE_LANDSCAPE_GUTTER;
  const landscapeHeadlineSize = height < 360 ? 24 : height < 400 ? 26 : 28;
  const landscapeBodySize = height < 360 ? 15 : 16;

  useEffect(() => {
    listRef.current?.scrollToIndex({ index: 0, animated: false });
    setIndex(0);
  }, [locale]);

  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index, animated: false });
    });
    return () => cancelAnimationFrame(handle);
  }, [width, index]);

  const goTo = useCallback((next: number) => {
    if (next < 0 || next >= PRODUCT_TOUR_SLIDE_COUNT) return;
    setIndex(next);
    listRef.current?.scrollToIndex({ index: next, animated: true });
  }, []);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((item) => item.isViewable && typeof item.index === "number");
    if (typeof first?.index === "number") setIndex(first.index);
  }).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const pageWidth = event.nativeEvent.layoutMeasurement.width || width;
      const next = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
      if (next >= 0 && next < PRODUCT_TOUR_SLIDE_COUNT) setIndex(next);
    },
    [width],
  );

  const imageMaxHeight = useMemo(() => {
    if (phoneLandscape) return undefined;
    const headerH = (compactPortrait ? 48 : 56) + topComfortGap;
    const footerH = compactPortrait ? 72 : 88;
    const usable = Math.max(120, height - insets.top - insets.bottom - headerH - footerH - space.lg);
    if (tabletLandscape) return Math.min(usable * 0.92, 560);
    if (layout === "tablet-portrait") return Math.min(usable * 0.55, 480);
    return Math.min(usable * (compactPortrait ? 0.48 : 0.55), 360);
  }, [compactPortrait, height, insets.bottom, insets.top, layout, phoneLandscape, tabletLandscape]);

  const renderPhoneLandscapeSlide = useCallback(
    ({ item }: ListRenderItemInfo<ProductTourSlideCopy>) => {
      const asset = MOBILE_TOUR_SLIDES.find((slide) => slide.id === item.id);
      return (
        <View
          style={[
            styles.plSlide,
            {
              width,
              paddingLeft: landscapePadLeft,
              paddingRight: landscapePadRight,
            },
          ]}
        >
          <View style={styles.plCopy}>
            <Text
              accessibilityRole="header"
              numberOfLines={3}
              style={[styles.plHeadline, { fontSize: landscapeHeadlineSize, lineHeight: landscapeHeadlineSize + 4 }]}
            >
              {item.headline}
            </Text>
            <Text
              numberOfLines={5}
              style={[styles.plBody, { fontSize: landscapeBodySize, lineHeight: landscapeBodySize + 5 }]}
            >
              {item.body}
            </Text>
            {item.banner ? (
              <View style={styles.plBanner}>
                <Text numberOfLines={2} style={styles.plBannerText}>
                  {item.banner}
                </Text>
              </View>
            ) : null}
            {item.points && item.points.length > 0 ? (
              <View style={styles.plPoints}>
                {item.points.slice(0, 2).map((point) => (
                  <View key={point} style={styles.plPoint}>
                    <Text numberOfLines={1} style={styles.plPointText}>
                      {point}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
          <View style={styles.plVisual}>
            {asset ? (
              <View style={styles.plImageFrame}>
                <Image
                  accessibilityLabel={mobileTourAlt(item.id, locale)}
                  resizeMode="contain"
                  source={asset.source}
                  style={styles.plImage}
                />
              </View>
            ) : null}
          </View>
        </View>
      );
    },
    [landscapeBodySize, landscapeHeadlineSize, landscapePadLeft, landscapePadRight, locale, width],
  );

  const renderDefaultSlide = useCallback(
    ({ item }: ListRenderItemInfo<ProductTourSlideCopy>) => {
      const asset = MOBILE_TOUR_SLIDES.find((slide) => slide.id === item.id);
      const copyBlock = (
        <View style={[styles.copy, split && styles.copySplit, compactPortrait && styles.copyCompact]}>
          <Text accessibilityRole="header" style={[styles.headline, compactPortrait && styles.headlineCompact]}>
            {item.headline}
          </Text>
          <Text style={[styles.body, compactPortrait && styles.bodyCompact]}>{item.body}</Text>
          {item.banner ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{item.banner}</Text>
            </View>
          ) : null}
          {item.points && item.points.length > 0 ? (
            <View style={styles.points}>
              {item.points.map((point) => (
                <View key={point} style={styles.pointChip}>
                  <Text style={styles.pointText}>{point}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      );

      const visualBlock = asset ? (
        <View style={[styles.visual, split && styles.visualSplit]}>
          <View style={[styles.imageFrame, imageMaxHeight ? { maxHeight: imageMaxHeight + space.md } : null]}>
            <Image
              accessibilityLabel={mobileTourAlt(item.id, locale)}
              resizeMode="contain"
              source={asset.source}
              style={imageMaxHeight ? { width: "100%", height: imageMaxHeight } : styles.imageFill}
            />
          </View>
        </View>
      ) : null;

      // Tablet landscape: fixed centered slide — no vertical ScrollView.
      if (split) {
        return (
          <View style={[styles.slidePage, { width }]}>
            <View style={styles.tabletLandscapeMain}>
              <View style={[styles.slideInner, styles.slideInnerSplit]}>
                {copyBlock}
                {visualBlock}
              </View>
            </View>
          </View>
        );
      }

      return (
        <View style={[styles.slidePage, { width }]}>
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.slideScroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.slideInner}>
              {copyBlock}
              {visualBlock}
            </View>
          </ScrollView>
        </View>
      );
    },
    [compactPortrait, imageMaxHeight, locale, split, width],
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<ProductTourSlideCopy> | null | undefined, itemIndex: number) => ({
      length: width,
      offset: width * itemIndex,
      index: itemIndex,
    }),
    [width],
  );

  const languageControls = (
    <View accessibilityLabel={ui.languageLabel} style={styles.lang}>
      {SUPPORTED_LOCALES.map((code) => (
        <Pressable
          key={code}
          accessibilityRole="button"
          accessibilityState={{ selected: locale === code }}
          onPress={() => onLocaleChange(code)}
          style={[
            styles.langBtn,
            phoneLandscape && styles.plLangBtn,
            locale === code && styles.langBtnActive,
          ]}
        >
          <Text style={[styles.langText, locale === code && styles.langTextActive]}>
            {code === "en" ? "EN" : "JA"}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const skipControl =
    !isLast ? (
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={onSkip}
        style={({ pressed }) => [styles.skipBtn, phoneLandscape && styles.plSkipBtn, pressed && styles.pressed]}
      >
        <Text style={styles.skipText}>{ui.skip}</Text>
      </Pressable>
    ) : null;

  const slideList = (
    <FlatList
      key={`tour-pages-${Math.round(width)}-${layout}`}
      ref={listRef}
      data={slides}
      extraData={`${locale}-${layout}-${imageMaxHeight ?? "pl"}-${index}-${landscapePadLeft}-${landscapePadRight}`}
      getItemLayout={getItemLayout}
      horizontal
      initialNumToRender={2}
      initialScrollIndex={index}
      keyExtractor={(item) => item.id}
      maxToRenderPerBatch={2}
      onMomentumScrollEnd={onMomentumScrollEnd}
      onScrollToIndexFailed={(info) => {
        requestAnimationFrame(() => {
          listRef.current?.scrollToIndex({ index: info.index, animated: false });
        });
      }}
      onViewableItemsChanged={onViewableItemsChanged}
      pagingEnabled
      renderItem={phoneLandscape ? renderPhoneLandscapeSlide : renderDefaultSlide}
      showsHorizontalScrollIndicator={false}
      style={styles.list}
      viewabilityConfig={viewabilityConfig}
      windowSize={3}
    />
  );

  const phoneLandscapeShell = (
    <View style={styles.plRoot}>
      <View
        style={[
          styles.plHeader,
          {
            paddingTop: insets.top,
            paddingLeft: landscapePadLeft,
            paddingRight: landscapePadRight,
          },
        ]}
      >
        <View style={styles.plHeaderRow}>
          <View style={styles.brand}>
            <Text numberOfLines={1} style={styles.plBrandText}>
              {ui.brand}
            </Text>
          </View>
          <View style={styles.headerActions}>
            {languageControls}
            {skipControl}
          </View>
        </View>
      </View>

      <View style={styles.main}>{slideList}</View>

      <View
        style={[
          styles.plFooter,
          {
            paddingBottom: Math.max(insets.bottom, 4),
            paddingLeft: landscapePadLeft,
            paddingRight: landscapePadRight,
          },
        ]}
      >
        <View style={styles.plFooterRow}>
          <View
            accessibilityLabel={ui.progressLabel(index + 1, PRODUCT_TOUR_SLIDE_COUNT)}
            style={styles.plDots}
          >
            {slides.map((slide, dotIndex) => (
              <Pressable
                key={slide.id}
                accessibilityLabel={ui.progressLabel(dotIndex + 1, PRODUCT_TOUR_SLIDE_COUNT)}
                accessibilityRole="button"
                accessibilityState={{ selected: dotIndex === index }}
                onPress={() => goTo(dotIndex)}
                style={[styles.dot, dotIndex === index && styles.dotActive]}
              />
            ))}
          </View>
          <View style={styles.plNav}>
            <View style={styles.plNavStart}>
              {!isFirst ? (
                <Button label={ui.back} onPress={() => goTo(index - 1)} variant="secondary" />
              ) : (
                <View style={styles.plNavSpacer} />
              )}
            </View>
            <View style={styles.navEnd}>
              {isLast ? (
                <>
                  <Button label={ui.signIn} onPress={onSignIn} variant="secondary" />
                  <Button label={ui.createAccount} onPress={onCreateAccount} />
                </>
              ) : (
                <Button label={ui.next} onPress={() => goTo(index + 1)} />
              )}
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  const defaultShell = (
    <FullScreenSafeArea style={styles.safe}>
      <View
        style={[
          styles.header,
          compactPortrait && styles.headerCompact,
          { paddingTop: topComfortGap },
        ]}
      >
        <View style={styles.brand}>
          <Text numberOfLines={1} style={styles.brandText}>
            {ui.brand}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {languageControls}
          {skipControl}
        </View>
      </View>

      <View style={styles.main}>{slideList}</View>

      <View style={[styles.footer, compactPortrait && styles.footerCompact]}>
        <View accessibilityLabel={ui.progressLabel(index + 1, PRODUCT_TOUR_SLIDE_COUNT)} style={styles.dots}>
          {slides.map((slide, dotIndex) => (
            <Pressable
              key={slide.id}
              accessibilityLabel={ui.progressLabel(dotIndex + 1, PRODUCT_TOUR_SLIDE_COUNT)}
              accessibilityRole="button"
              accessibilityState={{ selected: dotIndex === index }}
              onPress={() => goTo(dotIndex)}
              style={[styles.dot, dotIndex === index && styles.dotActive]}
            />
          ))}
        </View>
        <View style={styles.nav}>
          <View style={styles.navStart}>
            {!isFirst ? (
              <Button label={ui.back} onPress={() => goTo(index - 1)} variant="secondary" />
            ) : (
              <View style={styles.navSpacer} />
            )}
          </View>
          <View style={styles.navEnd}>
            {isLast ? (
              <>
                <Button label={ui.signIn} onPress={onSignIn} variant="secondary" />
                <Button label={ui.createAccount} onPress={onCreateAccount} />
              </>
            ) : (
              <Button label={ui.next} onPress={() => goTo(index + 1)} />
            )}
          </View>
        </View>
      </View>
    </FullScreenSafeArea>
  );

  return (
    <Modal
      animationType="fade"
      onRequestClose={() => {
        if (isReplay) onClose();
        else onSkip();
      }}
      presentationStyle="fullScreen"
      statusBarTranslucent
      supportedOrientations={[...MODAL_ORIENTATIONS]}
      visible
    >
      {phoneLandscape ? phoneLandscapeShell : defaultShell}
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  /* ===== Phone landscape full-bleed shell ===== */
  plRoot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  plHeader: {
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    justifyContent: "flex-end",
  },
  plHeaderRow: {
    height: PHONE_LANDSCAPE_HEADER_CONTENT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  plBrandText: {
    ...type.label,
    fontSize: 15,
    color: colors.text,
    letterSpacing: -0.2,
  },
  plLangBtn: {
    minWidth: 38,
    minHeight: 30,
  },
  plSkipBtn: {
    minHeight: 36,
    paddingHorizontal: space.xs,
  },
  plFooter: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    justifyContent: "flex-start",
    paddingTop: 4,
  },
  plFooterRow: {
    minHeight: PHONE_LANDSCAPE_FOOTER_CONTENT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  plDots: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  plNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    flexShrink: 0,
  },
  plNavStart: {
    width: 96,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  plNavSpacer: {
    width: 96,
    height: 40,
  },
  plSlide: {
    flex: 1,
    height: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  plCopy: {
    flex: 0.33,
    minWidth: 0,
    justifyContent: "center",
    gap: 6,
    maxWidth: 320,
  },
  plHeadline: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: "700",
    letterSpacing: -0.35,
    color: colors.text,
  },
  plBody: {
    fontSize: 16,
    lineHeight: 21,
    color: colors.textMuted,
  },
  plBanner: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.blueSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.infoBorder,
  },
  plBannerText: {
    fontSize: 14,
    lineHeight: 17,
    fontWeight: "700",
    color: colors.infoText,
  },
  plPoints: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  plPoint: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  plPointText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: colors.text,
  },
  plVisual: {
    flex: 0.67,
    minWidth: 0,
    minHeight: 0,
    height: "100%",
    paddingVertical: 0,
  },
  plImageFrame: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.sm,
    overflow: "hidden",
  },
  plImage: {
    width: "100%",
    height: "100%",
  },

  /* ===== Shared / portrait / tablet ===== */
  header: {
    minHeight: 56,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerCompact: {
    minHeight: 44,
    paddingBottom: space.xs,
  },
  brand: {
    flexShrink: 1,
    minWidth: 0,
    marginRight: space.sm,
  },
  brandText: {
    ...type.label,
    fontSize: 16,
    color: colors.text,
    letterSpacing: -0.2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    flexShrink: 0,
  },
  lang: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  langBtn: {
    minWidth: 40,
    minHeight: 32,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.sm,
  },
  langBtnActive: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  langText: {
    ...type.captionStrong,
    color: colors.textMuted,
  },
  langTextActive: {
    color: colors.blue,
  },
  skipBtn: {
    minHeight: touch.min,
    justifyContent: "center",
    paddingHorizontal: space.sm,
  },
  skipText: {
    ...type.label,
    color: colors.textMuted,
  },
  pressed: {
    opacity: 0.7,
  },
  main: {
    flex: 1,
    minHeight: 0,
  },
  list: {
    flex: 1,
  },
  slidePage: {
    height: "100%",
  },
  slideScroll: {
    flexGrow: 1,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  tabletLandscapeMain: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    justifyContent: "center",
  },
  slideInner: {
    flexGrow: 1,
    gap: space.md,
    justifyContent: "flex-start",
  },
  slideInnerSplit: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 0,
  },
  copy: {
    gap: space.sm,
    maxWidth: 560,
  },
  copySplit: {
    flex: 0.36,
    maxWidth: undefined,
    minWidth: 0,
  },
  copyCompact: {
    gap: space.xs,
  },
  headline: {
    ...type.headline,
    fontSize: 24,
    lineHeight: 30,
    color: colors.text,
  },
  headlineCompact: {
    fontSize: 18,
    lineHeight: 24,
  },
  body: {
    ...type.body,
    color: colors.textMuted,
  },
  bodyCompact: {
    fontSize: 13,
    lineHeight: 18,
  },
  banner: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.blueSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.infoBorder,
  },
  bannerText: {
    ...type.captionStrong,
    color: colors.infoText,
  },
  points: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  pointChip: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pointText: {
    ...type.captionStrong,
    color: colors.text,
  },
  visual: {
    flexGrow: 1,
    minHeight: 0,
    justifyContent: "center",
  },
  visualSplit: {
    flex: 0.64,
  },
  imageFrame: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    padding: space.sm,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.md,
    overflow: "hidden",
  },
  imageFill: {
    width: "100%",
    height: "100%",
  },
  footer: {
    minHeight: 88,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    gap: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  footerCompact: {
    minHeight: 72,
    paddingTop: space.xs,
    paddingBottom: space.xs,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.borderStrong,
  },
  dotActive: {
    width: 20,
    borderRadius: radii.pill,
    backgroundColor: colors.blue,
  },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  navStart: {
    flexDirection: "row",
    alignItems: "center",
  },
  navEnd: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginLeft: "auto",
    flexShrink: 1,
  },
  navSpacer: {
    width: 96,
    height: touch.min,
  },
});
