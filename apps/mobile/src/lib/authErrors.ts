import { ApiError, NetworkError, TimeoutError, fieldErrorsFromBody } from "@checkstation/api";

export type SignInMode = "owner" | "staff";
type Translate = (key: string) => string;

export function signInErrorMessage(error: unknown, mode: SignInMode, t: Translate): string {
  if (error instanceof NetworkError || error instanceof TimeoutError) {
    return t("auth.connectionError");
  }
  if (!(error instanceof ApiError)) return t("common.error");

  if (error.status === 429 || error.data.code === "rate_limited") {
    return t("auth.rateLimited");
  }

  const fields = fieldErrorsFromBody(error.data);
  const fieldMessage =
    mode === "owner"
      ? fields.email || fields.password
      : fields.workspace_id || fields.username || fields.password;
  if (fieldMessage) return fieldMessage;

  if (
    error.status === 401
    || error.data.code === "not_authenticated"
    || error.data.detail === "Authentication credentials were not provided."
  ) {
    return t(mode === "owner" ? "auth.invalidOwnerCredentials" : "auth.invalidStaffCredentials");
  }

  if (typeof error.data.detail === "string" && error.data.detail.trim()) {
    return error.data.detail;
  }
  return t("common.error");
}
