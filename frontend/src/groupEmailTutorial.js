export function groupEmailTutorialPanels(search = "") {
  const mode = new URLSearchParams(search).get("tutorial");
  return {
    advanced: mode === "email-advanced" || mode === "email-sender" || mode === "email-forward",
    sender: mode === "email-sender",
    forwarding: mode === "email-forward",
  };
}
