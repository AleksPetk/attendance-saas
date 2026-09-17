/** Pure helpers for Mobile Account → Delete Account re-verification UX. */

export type SignInMethodsSnapshot = {
  password?: { enabled?: boolean };
  google?: { linked?: boolean };
  apple?: { linked?: boolean };
};

/** Apple-linked owners without a CheckStation password can Confirm with Apple. */
export function canConfirmDeleteWithApple(methods?: SignInMethodsSnapshot | null): boolean {
  return Boolean(methods?.apple?.linked) && !Boolean(methods?.password?.enabled);
}
