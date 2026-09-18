/** Pure helpers for Mobile Account sensitive-action provider re-verification UX. */

export type SignInMethodsSnapshot = {
  password?: { enabled?: boolean };
  google?: { linked?: boolean };
  apple?: { linked?: boolean };
};

/**
 * Apple-linked owners without a CheckStation password can Confirm with Apple
 * for sensitive Account actions (delete, login email, backup email).
 */
export function canConfirmSensitiveWithApple(methods?: SignInMethodsSnapshot | null): boolean {
  return Boolean(methods?.apple?.linked) && !Boolean(methods?.password?.enabled);
}

/**
 * Google-linked owners without a CheckStation password can Confirm with Google
 * for sensitive Account / Security actions.
 */
export function canConfirmSensitiveWithGoogle(methods?: SignInMethodsSnapshot | null): boolean {
  return Boolean(methods?.google?.linked) && !Boolean(methods?.password?.enabled);
}

/** @deprecated Prefer canConfirmSensitiveWithApple */
export function canConfirmDeleteWithApple(methods?: SignInMethodsSnapshot | null): boolean {
  return canConfirmSensitiveWithApple(methods);
}

/** @deprecated Prefer canConfirmSensitiveWithGoogle */
export function canConfirmDeleteWithGoogle(methods?: SignInMethodsSnapshot | null): boolean {
  return canConfirmSensitiveWithGoogle(methods);
}

/**
 * When disconnecting a provider without a password, reverify with the OTHER
 * linked provider (matches Browser / validate_sensitive_owner_reauth exclude_provider).
 */
export function remainingProviderForUnlink(
  methods: SignInMethodsSnapshot | null | undefined,
  unlinking: "google" | "apple",
): "google" | "apple" | null {
  if (Boolean(methods?.password?.enabled)) return null;
  if (unlinking === "google" && Boolean(methods?.apple?.linked)) return "apple";
  if (unlinking === "apple" && Boolean(methods?.google?.linked)) return "google";
  return null;
}
