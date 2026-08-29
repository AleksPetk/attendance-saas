import cafeConfirmation from "./cafe-confirmation-800.webp";
import cafeEmail from "./cafe-email-800.webp";
import clubConfirmation from "./club-confirmation-800.webp";
import clubEmail from "./club-email-800.webp";

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
