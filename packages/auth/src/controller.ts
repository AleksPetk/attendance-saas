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
    const result = await this.api.post<Record<string, unknown>>(endpoints.ownerLogin(), {
      email,
      password,
    });
    if (result?.two_factor_required) {
      this.setState({
        status: "needs_2fa",
        session: null,
        twoFactorPending: true,
        bootstrapError: null,
      });
      return { kind: "two_factor_required" };
    }
    const session = await this.api.get<WorkspaceSession>(endpoints.workspace());
    this.applySession(session);
    return { kind: "authenticated", session };
  }

  async completeOwnerTotp(code: string): Promise<WorkspaceSession> {
    await this.api.post(endpoints.ownerTotpChallenge(), { code });
    const session = await this.api.get<WorkspaceSession>(endpoints.workspace());
    this.applySession(session);
    return session;
  }

  async loginStaff(workspaceId: string, username: string, password: string): Promise<WorkspaceSession> {
    await this.api.post(endpoints.staffLogin(), {
      workspace_id: workspaceId,
      username,
      password,
    });
    const session = await this.api.get<WorkspaceSession>(endpoints.workspace());
    this.applySession(session);
    return session;
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
