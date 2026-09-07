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

  async loginOwner(email: string, password: string): Promise<OwnerLoginResult> {
    try {
      await this.api.post<WorkspaceSession>(endpoints.ownerLogin(), { email, password });
    } catch (error) {
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
      throw error;
    }
    // Verify that the newly issued Django session is usable before entering
    // the authenticated app; this also catches transport regressions early.
    const session = await this.api.get<WorkspaceSession>(endpoints.workspace());
    const state = this.applySession(session);
    return { kind: "authenticated", session: state.session! };
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
   * OAuth (Google/Apple) uses browser redirects to the web SPA today.
   * Native deep-link completion is not implemented — see APPS.md.
   */
  getOAuthGapNote(): string {
    return (
      "Owner Google/Apple sign-in still uses web redirect callbacks "
      + "(/api/auth/{google|apple}/callback → FRONTEND_BASE_URL). "
      + "Native ASWebAuthenticationSession / Intent deep links require backend "
      + "callback support before production OAuth on mobile/desktop."
    );
  }
}
