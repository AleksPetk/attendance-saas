import KioskConfirmationView from "./KioskConfirmationView.jsx";

/** Live kiosk confirmation after a successful action. */
export default function KioskConfirmationScreen({ template = "clean", message, accentStyle, accentColor }) {
  return (
    <KioskConfirmationView
      template={template}
      message={message}
      accentStyle={accentStyle}
      accentColor={accentColor}
      live
    />
  );
}

/** Settings preview — same layout as live, compact sizing. */
export function KioskConfirmationPreview({
  template = "clean",
  message,
  accentStyle,
  accentColor,
  compact = true,
}) {
  return (
    <KioskConfirmationView
      template={template}
      message={message}
      accentStyle={accentStyle}
      accentColor={accentColor}
      compact={compact}
    />
  );
}
