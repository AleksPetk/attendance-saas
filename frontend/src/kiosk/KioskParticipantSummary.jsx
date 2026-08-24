import { KioskPersonAvatar } from "./kioskParticipantAvatar.jsx";

function formatAttendanceStatus(attendanceState) {
  if (!attendanceState) return "";
  if (attendanceState.is_checked_in) {
    return attendanceState.is_on_break ? "Status: checked in, on break" : "Status: checked in";
  }
  return "Status: not checked in";
}

/**
 * Compact participant summary for Choose Action / Processing flow stages.
 * Uses a small avatar (photo or initials) — never full selection-card proportions.
 */
export function KioskParticipantSummary({
  name,
  photoUrl,
  status,
  attendanceState,
  className = "",
}) {
  const displayName = (name || "").trim();
  if (!displayName) return null;

  const statusLine = status || formatAttendanceStatus(attendanceState);

  return (
    <div className={`kiosk-participant-summary ${className}`.trim()}>
      <KioskPersonAvatar name={displayName} photoUrl={photoUrl} size="compact" />
      <div className="kiosk-participant-summary-text">
        <strong className="kiosk-participant-summary-name">{displayName}</strong>
        {statusLine ? (
          <div className="hint kiosk-participant-summary-status">{statusLine}</div>
        ) : null}
      </div>
    </div>
  );
}

export { formatAttendanceStatus };
