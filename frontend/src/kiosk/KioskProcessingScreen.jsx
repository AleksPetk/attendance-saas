import KioskProcessingView from "./KioskProcessingView.jsx";

/** Live kiosk processing while an attendance action is submitted. */
export default function KioskProcessingScreen({
  template = "clean",
  action = "",
  participantName = "",
  photoUrl = null,
  accentStyle,
  accentColor,
}) {
  return (
    <KioskProcessingView
      template={template}
      action={action}
      participantName={participantName}
      photoUrl={photoUrl}
      accentStyle={accentStyle}
      accentColor={accentColor}
      live
    />
  );
}
