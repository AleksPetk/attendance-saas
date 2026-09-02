import activityHistory from "./activity-history-1280.webp";
import attendanceReport from "./attendance-report-960.webp";
import jaActivityHistory from "./ja-activity-history-1280.webp";
import jaAttendanceReport from "./ja-attendance-report-960.webp";

export const historyFeatureImages = {
  main: {
    src: activityHistory,
    alt: "CheckStation History Activity Log showing recorded check-in and check-out actions.",
    width: 1280,
    height: 720,
  },
  inset: {
    src: attendanceReport,
    alt: "CheckStation Attendance Report showing recorded attendance ready to review and export.",
    width: 960,
    height: 540,
  },
};

export const historyFeatureJaImages = {
  main: {
    src: jaActivityHistory,
    alt: "CheckStationの履歴画面で、記録されたチェックインとチェックアウトを確認している様子。",
    width: 1280,
    height: 720,
  },
  inset: {
    src: jaAttendanceReport,
    alt: "CheckStationの出席レポート画面で、出席記録を確認・エクスポートしている様子。",
    width: 960,
    height: 540,
  },
};
