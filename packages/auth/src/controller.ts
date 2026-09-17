import { ApiError, endpoints, type ApiClient, type TransportApiClient } from "@checkstation/api";
import type { WorkspaceSession } from "@checkstation/domain";

export type AuthStatus =
  | "unknown"
  | "anonymous"
  | "needs_2fa"
  | "authenticated"
  | "kiosk_locked";

export type AuthState = {
  status: AuthStatus;
  session: WorkspaceSession | null;
  twoFactorPending: boolean;
  bootstrapError: string | null;
};

export type AuthListener = (state: AuthState) => void;

export type OwnerLoginResult =
  | { kind: "authenticated"; session: WorkspaceSession }
  | { kind: "two_factor_required" };

/** ApiClient or Electron TransportApiClient (cookies stay in main process). */
export type AuthApi = ApiClient | TransportApiClient;

function normalizeWorkspaceSession(payload: WorkspaceSession): WorkspaceSession {
  if (payload.workspace) return payload;
  return {
    ...payload,
    workspace: { ...payload },
  };
}

export class AuthController {
  private state: AuthState = {
    status: "unknown",
    session: null,
    twoFactorPending: false,
    bootstrapError: null,
  };
  private listeners = new Set<AuthListener>();

  constructor(private readonly api: AuthApi) {
    this.api.setSessionExpiredListener(() => {
      void this.handleSessionExpired();
    });
  }

  getState(): AuthState {
    return this.state;
  }

  subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<AuthState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  async bootstrap(): Promise<AuthState> {
    await this.api.init();
    try {
      await this.api.ensureCsrf();
      const session = await this.api.get<WorkspaceSession>(endpoints.workspace());
      return this.applySession(session);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        this.setState({
          status: "anonymous",
          session: null,
          twoFactorPending: false,
          bootstrapError: null,
        });
        return this.state;
      }
      this.setState({
        status: "anonymous",
        session: null,
        twoFactorPending: false,
        bootstrapError: err instanceof Error ? err.message : "Bootstrap failed",
      });
      return this.state;
    }
  }

  private applySession(session: WorkspaceSession): AuthState {
    session = normalizeWorkspaceSession(session);
    if (session?.kiosk_locked) {
      this.setState({
        status: "kiosk_locked",
        session,
        twoFactorPending: false,
        bootstrapError: null,
      });
      return this.state;
    }
    this.setState({
      status: "authenticated",
      session,
      twoFactorPending: false,
      bootstrapError: null,
    });
    return this.state;
  }

  private async finishOwnerFirstFactor(): Promise<OwnerLoginResult> {
    // Verify that the newly issued Django session is usable before entering
    // the authenticated app; this also catches transport regressions early.
    const session = await this.api.get<WorkspaceSession>(endpoints.workspace());
    const state = this.applySession(session);
    return { kind: "authenticated", session: state.session! };
  }

  private mapOwnerFirstFactorError(error: unknown): OwnerLoginResult | null {
    // The production endpoint represents a valid first factor requiring 2FA
    // as a 403 response with this code; ApiClient correctly throws for it.
    if (error instanceof ApiError && error.data.code === "two_factor_required") {
      this.setState({
        status: "needs_2fa",
        session: null,
        twoFactorPending: true,
        bootstrapError: null,
      });
      return { kind: "two_factor_required" };
    }
    return null;
  }

  async loginOwner(email: string, password: string): Promise<OwnerLoginResult> {
    try {
      await this.api.post<WorkspaceSession>(endpoints.ownerLogin(), { email, password });
    } catch (error) {
      const mapped = this.mapOwnerFirstFactorError(error);
      if (mapped) return mapped;
      throw error;
    }
    return this.finishOwnerFirstFactor();
  }

  /**
   * Complete native iOS Sign in with Apple after obtaining an identityToken.
   * Uses the same Django session / cookie jar path as password login.
   */
  async completeAppleNative(payload: {
    identityToken: string;
    nonce: string;
    intent: "login" | "register";
    legalAcknowledgement?: boolean;
    fullName?: {
      givenName?: string | null;
      familyName?: string | null;
    } | null;
  }): Promise<OwnerLoginResult> {
    try {
      await this.api.post<WorkspaceSession>(endpoints.appleNativeComplete(), {
        identity_token: payload.identityToken,
        nonce: payload.nonce,
        intent: payload.intent,
        legal_acknowledgement: Boolean(payload.legalAcknowledgement),
        full_name: payload.fullName
          ? {
              givenName: payload.fullName.givenName || "",
              familyName: payload.fullName.familyName || "",
            }
          : undefined,
      });
    } catch (error) {
      const mapped = this.mapOwnerFirstFactorError(error);
      if (mapped) return mapped;
      throw error;
    }
    return this.finishOwnerFirstFactor();
  }

  /**
   * Re-verify the linked Apple identity for a sensitive action (e.g. account deletion).
   * Records `_owner_oauth_reauth` on the existing authenticated session — does not
   * replace login / finishOwnerFirstFactor.
   */
  async verifyAppleNative(payload: {
    identityToken: string;
    nonce: string;
  }): Promise<{ code: string; detail?: string }> {
    return this.api.post<{ code: string; detail?: string }>(endpoints.appleNativeComplete(), {
      identity_token: payload.identityToken,
      nonce: payload.nonce,
      intent: "verify",
    });
  }

  /**
   * Complete native iOS Google Sign-In after obtaining an ID token.
   * Uses the same Django session / cookie jar path as password / Apple login.
   */
  async completeGoogleNative(payload: {
    identityToken: string;
    nonce: string;
    intent: "login" | "register";
    legalAcknowledgement?: boolean;
  }): Promise<OwnerLoginResult> {
    try {
      await this.api.post<WorkspaceSession>(endpoints.googleNativeComplete(), {
        identity_token: payload.identityToken,
        nonce: payload.nonce,
        intent: payload.intent,
        legal_acknowledgement: Boolean(payload.legalAcknowledgement),
      });
    } catch (error) {
      const mapped = this.mapOwnerFirstFactorError(error);
      if (mapped) return mapped;
      throw error;
    }
    return this.finishOwnerFirstFactor();
  }

  /**
   * Re-verify the linked Google identity for a sensitive action.
   * Records `_owner_oauth_reauth` on the existing authenticated session — does not
   * replace login / finishOwnerFirstFactor.
   */
  async verifyGoogleNative(payload: {
    identityToken: string;
    nonce: string;
  }): Promise<{ code: string; detail?: string }> {
    return this.api.post<{ code: string; detail?: string }>(endpoints.googleNativeComplete(), {
      identity_token: payload.identityToken,
      nonce: payload.nonce,
      intent: "verify",
    });
  }

  async completeOwnerTwoFactor(payload: { code?: string; recovery_code?: string }): Promise<WorkspaceSession> {
    await this.api.post(endpoints.ownerTotpChallenge(), payload);
    const session = await this.api.get<WorkspaceSession>(endpoints.workspace());
    return this.applySession(session).session!;
  }

  async completeOwnerTotp(code: string): Promise<WorkspaceSession> {
    return this.completeOwnerTwoFactor({ code });
  }

  async loginStaff(workspaceId: string, username: string, password: string): Promise<WorkspaceSession> {
    await this.api.post(endpoints.staffLogin(), {
      workspace_id: workspaceId,
      username,
      password,
    });
    const session = await this.api.get<WorkspaceSession>(endpoints.workspace());
    return this.applySession(session).session!;
  }

  /** Re-read the shared workspace snapshot, including entitlements and capacity-resolution state. */
  async refreshWorkspace(): Promise<WorkspaceSession> {
    const session = await this.api.get<WorkspaceSession>(endpoints.workspace());
    return this.applySession(session).session!;
  }

  /**
   * Apply a successful kiosk exit locally before navigation.
   * Mirrors browser clearKioskLockLocally — clears top-level and nested workspace flags.
   */
  applyKioskUnlock(lockPayload?: Partial<WorkspaceSession> | Record<string, unknown>): AuthState {
    const current = this.state.session;
    const flat = current
      ? ({ ...current, ...(current.workspace || {}) } as WorkspaceSession)
      : ({} as WorkspaceSession);
    const payload = (lockPayload || {}) as Partial<WorkspaceSession>;
    const unlocked = {
      kiosk_locked: false as const,
      kiosk_group_id: (payload.kiosk_group_id ?? null) as number | null,
      kiosk_available: Boolean(payload.kiosk_available ?? false),
    };
    const nextWorkspace = {
      ...(typeof flat.workspace === "object" && flat.workspace ? flat.workspace : {}),
      ...unlocked,
    };
    return this.applySession({
      ...flat,
      ...payload,
      ...unlocked,
      workspace: nextWorkspace,
    } as WorkspaceSession);
  }

  async logout(): Promise<void> {
    try {
      await this.api.post(endpoints.logout(), {});
    } catch {
      /* still clear local session */
    }
    await this.api.jar.clear();
    this.setState({
      status: "anonymous",
      session: null,
      twoFactorPending: false,
      bootstrapError: null,
    });
  }

  private async handleSessionExpired(): Promise<void> {
    await this.api.jar.clear();
    this.setState({
      status: "anonymous",
      session: null,
      twoFactorPending: false,
      bootstrapError: null,
    });
  }

  /**
   * Browser Google OAuth remains redirect-based; native Apple and Google use
   * /api/auth/{provider}/native/ identity-token completion on iOS.
   */
  getOAuthGapNote(): string {
    return (
      "Browser owner Google sign-in still uses web redirect callbacks "
      + "(/api/auth/google/callback → FRONTEND_BASE_URL). "
      + "Native iOS Google and Apple sign-in use "
      + "/api/auth/google/native/ and /api/auth/apple/native/."
    );
  }
}
