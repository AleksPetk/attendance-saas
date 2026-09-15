import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallbackTitle: string;
  fallbackBody: string;
};

type State = {
  error: Error | null;
};

/**
 * Last-resort UI so a render crash never leaves the Electron window blank/white.
 */
export class DesktopErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[CheckStation] renderer crash", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page" style={{ padding: 32, maxWidth: 520 }}>
        <h1 style={{ marginTop: 0 }}>{this.props.fallbackTitle}</h1>
        <p>{this.props.fallbackBody}</p>
        <p style={{ color: "var(--muted)", fontSize: 13, wordBreak: "break-word" }}>
          {this.state.error.message}
        </p>
        <button
          className="button button-primary"
          type="button"
          onClick={() => {
            this.setState({ error: null });
            window.location.hash = "#/";
            window.location.reload();
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
