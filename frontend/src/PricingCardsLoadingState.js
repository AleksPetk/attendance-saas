import { createElement } from "react";

export default function PricingCardsLoadingState({ cardCount = 3, compact = false }) {
  return createElement(
    "div",
    {
      className: compact ? "pricing-cards-loading is-compact" : "pricing-cards-loading",
      role: "status",
      "aria-live": "polite",
      "aria-label": "Loading current pricing presentation",
    },
    createElement(
      "div",
      { className: "pricing-cards-loading-grid", "aria-hidden": "true" },
      Array.from({ length: cardCount }, (_, index) =>
        createElement(
          "div",
          { className: "pricing-card-loading-placeholder", key: index },
          createElement("span", { className: "pricing-loading-line is-short" }),
          createElement("span", { className: "pricing-loading-line is-price" }),
          createElement("span", { className: "pricing-loading-line" }),
          createElement("span", { className: "pricing-loading-line" }),
          createElement("span", { className: "pricing-loading-line is-medium" }),
          createElement("span", { className: "pricing-loading-button" }),
        ),
      ),
    ),
    createElement("span", { className: "sr-only" }, "Loading pricing…"),
  );
}
