import { Component, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { LoadingState } from "./components.jsx";

function RouteLoadingFallback() {
  const { t } = useTranslation("workspace");
  return (
    <div className="page">
      <LoadingState label={t("loadingWorkspace")} />
    </div>
  );
}

class LazyRouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page" style={{ padding: "var(--space-8)" }}>
          <div className="empty-state">
            <h2>Page failed to load</h2>
            <p>Try refreshing the page. If the problem continues, check your connection.</p>
            <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
              Refresh
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function RouteSuspense({ children, label }) {
  return (
    <LazyRouteErrorBoundary>
      <Suspense fallback={label ? <LoadingState label={label} /> : <RouteLoadingFallback />}>
        {children}
      </Suspense>
    </LazyRouteErrorBoundary>
  );
}
