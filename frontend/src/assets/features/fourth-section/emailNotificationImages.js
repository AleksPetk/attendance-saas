import cafeConfirmation from "./cafe-confirmation-800.webp";
import cafeEmail from "./cafe-email-800.webp";
import clubConfirmation from "./club-confirmation-800.webp";
import clubEmail from "./club-email-800.webp";
import jaCafeConfirmation from "./ja-cafe-confirmation-800.webp";
import jaCafeEmail from "./ja-cafe-email-800.webp";
import jaClubConfirmation from "./ja-club-confirmation-800.webp";
import jaClubEmail from "./ja-club-email-800.webp";

export const emailNotificationPairs = [
  {
    label: "Club check-out confirmation and received email",
    images: [
      {
        src: clubConfirmation,
        alt: "Pulse Club kiosk showing a completed participant check-out.",
      },
      {
        src: clubEmail,
        alt: "CheckStation check-out notification received by email for the Club participant.",
      },
    ],
  },
  {
    label: "Café check-in confirmation and received email",
    images: [
      {
        src: cafeConfirmation,
        alt: "Ember Café kiosk showing a completed participant check-in.",
      },
      {
        src: cafeEmail,
        alt: "CheckStation check-in notification received by email for the Café participant.",
      },
    ],
  },
];

export const emailNotificationJaPairs = [
  {
    label: "クラブのチェックアウト確認と受信メール",
    images: [
      {
        src: jaClubConfirmation,
        alt: "パルスクラブのキオスクに表示された参加者のチェックアウト完了画面。",
      },
      {
        src: jaClubEmail,
        alt: "クラブ参加者のチェックアウト通知をCheckStationから受信したメール画面。",
      },
    ],
  },
  {
    label: "カフェのチェックイン確認と受信メール",
    images: [
      {
        src: jaCafeConfirmation,
        alt: "灯りカフェのキオスクに表示された参加者のチェックイン完了画面。",
      },
      {
        src: jaCafeEmail,
        alt: "カフェ参加者のチェックイン通知をCheckStationから受信したメール画面。",
      },
    ],
  },
];
