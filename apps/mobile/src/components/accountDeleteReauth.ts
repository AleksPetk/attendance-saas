/** Pure helpers for Mobile Account sensitive-action Apple re-verification UX. */

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

/** @deprecated Prefer canConfirmSensitiveWithApple */
export function canConfirmDeleteWithApple(methods?: SignInMethodsSnapshot | null): boolean {
  return canConfirmSensitiveWithApple(methods);
}
