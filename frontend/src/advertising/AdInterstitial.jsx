import { Component } from "react";
import "./advertising.css";

class AdFailOpenBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFailOpen?.();
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function AdInterstitialPanel({ model, placement, onContinue }) {
  return (
    <div className="ad-interstitial-backdrop" role="dialog" aria-modal="true" aria-labelledby="ad-interstitial-title">
      <div className="ad-interstitial" data-ad-placement={placement}>
        <p className="ad-kicker">{model.kicker}</p>
        <h2 id="ad-interstitial-title">{model.headline}</h2>
        <button type="button" className="btn-primary" onClick={onContinue}>
          {model.continueLabel || "Continue"}
        </button>
      </div>
    </div>
  );
}

/**
 * Full-screen mock interstitial. Parent must only mount this after a show decision.
 * Provider/render failure continues via onContinue (fail-open).
 */
export default function AdInterstitial({ placement, model, onContinue }) {
  if (!model) {
    return null;
  }
  return (
    <AdFailOpenBoundary onFailOpen={onContinue}>
      <AdInterstitialPanel model={model} placement={placement} onContinue={onContinue} />
    </AdFailOpenBoundary>
  );
}

export { AdFailOpenBoundary };
