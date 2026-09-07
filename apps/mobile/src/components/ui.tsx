import React, { forwardRef, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { colors, radii, shadows, space, touch, type } from "../theme/tokens";

const wordmarkSource = require("../../../../frontend/src/assets/brand/logo-text.png");

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function BrandWordmark() {
  return (
    <Image
      accessibilityLabel="CheckStation"
      resizeMode="contain"
      source={wordmarkSource}
      style={styles.wordmark}
    />
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Body({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && { color: colors.textMuted }]}>{children}</Text>;
}

type ButtonVariant = "primary" | "secondary" | "danger";

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
}) {
  const unavailable = Boolean(disabled || loading);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: unavailable }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "secondary" && styles.buttonSecondary,
        variant === "danger" && styles.buttonDanger,
        pressed && !unavailable && styles.buttonPressed,
        unavailable && styles.disabled,
      ]}
    >
      {({ pressed }) => (
        <LinearGradient
          colors={
            variant === "primary"
              ? pressed
                ? [colors.bluePressed, colors.cyan]
                : [colors.blue, colors.cyan]
              : variant === "danger"
                ? [colors.danger, colors.danger]
                : pressed
                  ? [colors.surfaceMuted, colors.surfaceMuted]
                  : [colors.surface, colors.surface]
          }
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.buttonSurface}
        >
          {loading ? (
            <ActivityIndicator color={variant === "secondary" ? colors.blue : colors.surface} size="small" />
          ) : null}
          <Text style={[styles.buttonLabel, variant === "secondary" && styles.buttonLabelSecondary]}>
            {label}
          </Text>
        </LinearGradient>
      )}
    </Pressable>
  );
}

export type FieldProps = TextInputProps & {
  label: string;
  hint?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  rightAccessory?: React.ReactNode;
};

export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, hint, error, containerStyle, onBlur, onFocus, style, rightAccessory, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      <View style={[styles.inputWrap, focused && styles.inputFocused, Boolean(error) && styles.inputError]}>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityState={{ disabled: rest.editable === false }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.blue}
          style={[styles.input, rightAccessory ? styles.inputWithAccessory : null, style]}
          {...rest}
        />
        {rightAccessory ? <View style={styles.inputAccessory}>{rightAccessory}</View> : null}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
});

export function Alert({
  message,
  variant = "error",
}: {
  message?: string;
  variant?: "error" | "success" | "warning" | "info";
}) {
  if (!message) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[
        styles.alert,
        variant === "success" && styles.alertSuccess,
        variant === "warning" && styles.alertWarning,
        variant === "info" && styles.alertInfo,
      ]}
    >
      <Text
        style={[
          styles.alertText,
          variant === "success" && styles.alertTextSuccess,
          variant === "warning" && styles.alertTextWarning,
          variant === "info" && styles.alertTextInfo,
        ]}
      >
        {message}
      </Text>
    </View>
  );
}

export function TextLink({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.textLinkHit, pressed && !disabled && styles.textLinkPressed]}
    >
      <Text style={[styles.textLink, disabled && styles.disabled]}>{label}</Text>
    </Pressable>
  );
}

export function PasswordVisibilityButton({
  visible,
  onPress,
  showLabel,
  hideLabel,
}: {
  visible: boolean;
  onPress: () => void;
  showLabel: string;
  hideLabel: string;
}) {
  return (
    <Pressable
      accessibilityLabel={visible ? hideLabel : showLabel}
      accessibilityRole="button"
      accessibilityState={{ selected: visible }}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.passwordToggle, pressed && styles.passwordTogglePressed]}
    >
      <View style={styles.eyeOutline}>
        <View style={styles.eyePupil} />
      </View>
      {!visible ? <View style={styles.eyeSlash} /> : null}
    </Pressable>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  accessibilityLabel,
}: {
  value: T;
  options: ReadonlyArray<{ label: string; value: T }>;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  return (
    <View accessibilityLabel={accessibilityLabel} accessibilityRole="tablist" style={styles.segments}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              index < options.length - 1 && styles.segmentBorder,
              selected && styles.segmentSelected,
              pressed && !selected && styles.segmentPressed,
            ]}
          >
            <Text style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ListRow({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && onPress ? { backgroundColor: colors.surfaceMuted } : null]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <View accessibilityLiveRegion="polite" accessibilityRole="progressbar" style={styles.center}>
      <ActivityIndicator color={colors.blue} />
      <Text style={[styles.body, { color: colors.textMuted, marginTop: space.sm }]}>{label}</Text>
    </View>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <View style={[styles.center, styles.emptyState]}>
      <Text style={[styles.body, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: space.lg,
  },
  wordmark: { width: 216, height: 72, alignSelf: "center" },
  title: { ...type.title, color: colors.text, marginBottom: space.md },
  body: { ...type.body, color: colors.text },
  button: {
    minHeight: touch.min,
    overflow: "hidden",
    borderRadius: radii.sm,
    ...shadows.sm,
  },
  buttonSecondary: { borderWidth: 1, borderColor: colors.borderStrong, shadowOpacity: 0, elevation: 0 },
  buttonDanger: { borderWidth: 1, borderColor: colors.dangerPressed },
  buttonPressed: { transform: [{ translateY: 1 }] },
  buttonSurface: {
    minHeight: touch.min,
    paddingHorizontal: space.lg,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  buttonLabel: { ...type.bodyStrong, color: colors.surface },
  buttonLabelSecondary: { color: colors.text },
  disabled: { opacity: 0.55, shadowOpacity: 0, elevation: 0 },
  field: { gap: space.sm },
  label: { ...type.label, color: colors.textSecondary },
  fieldHint: { ...type.caption, color: colors.textMuted, marginTop: -space.xs },
  inputWrap: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  input: { flex: 1, minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, color: colors.text, fontSize: 16 },
  inputWithAccessory: { paddingRight: 52 },
  inputAccessory: { position: "absolute", right: 3, top: 0, bottom: 0, justifyContent: "center" },
  inputFocused: {
    borderColor: colors.blue,
    shadowColor: colors.blue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
  },
  inputError: { borderColor: colors.danger },
  fieldError: { ...type.caption, color: colors.danger, fontWeight: "500" },
  alert: {
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: space.md,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  alertText: { ...type.label, fontWeight: "500", color: colors.dangerText },
  alertSuccess: { backgroundColor: colors.successSoft, borderColor: colors.successBorder },
  alertTextSuccess: { color: colors.successText },
  alertWarning: { backgroundColor: colors.warningSoft, borderColor: colors.warningBorder },
  alertTextWarning: { color: colors.warningText },
  alertInfo: { backgroundColor: colors.infoSoft, borderColor: colors.infoBorder },
  alertTextInfo: { color: colors.infoText },
  textLinkHit: { minHeight: 32, alignSelf: "center", justifyContent: "center", paddingHorizontal: space.xs },
  textLink: { ...type.caption, color: colors.blue, textAlign: "center", textDecorationLine: "underline" },
  textLinkPressed: { opacity: 0.65 },
  passwordToggle: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radii.sm },
  passwordTogglePressed: { backgroundColor: colors.surfaceMuted },
  eyeOutline: { width: 21, height: 13, borderWidth: 1.8, borderColor: colors.textMuted, borderRadius: 11, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-1deg" }] },
  eyePupil: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.textMuted },
  eyeSlash: { position: "absolute", width: 25, height: 1.8, borderRadius: 1, backgroundColor: colors.textMuted, transform: [{ rotate: "45deg" }] },
  segments: {
    minHeight: touch.min,
    flexDirection: "row",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  segment: { minHeight: touch.min, flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.md },
  segmentBorder: { borderRightWidth: 1, borderRightColor: colors.border },
  segmentSelected: { backgroundColor: colors.primarySoft },
  segmentPressed: { backgroundColor: colors.surfaceMuted },
  segmentLabel: { ...type.captionStrong, color: colors.textSecondary },
  segmentLabelSelected: { color: colors.blue },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: space.xlg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: space.md,
    ...shadows.sm,
  },
  row: {
    minHeight: touch.min,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowTitle: { ...type.bodyStrong, color: colors.text },
  rowSubtitle: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
  emptyState: { borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong, borderRadius: radii.md },
});
