/**
 * Expo config for CheckStation Mobile.
 *
 * Native Google Sign-In (iOS) uses the public iOS OAuth client ID + URL scheme.
 * These are not secrets. EAS production/preview env can override them; defaults
 * match the CheckStation iOS client in Google Cloud.
 *
 * Browser Google OAuth continues to use the separate Web client on the backend.
 */

const GOOGLE_IOS_CLIENT_ID =
  "533996414208-a130ppp91kc0seu6jondvrth2i94i7qa.apps.googleusercontent.com";
const GOOGLE_IOS_URL_SCHEME =
  "com.googleusercontent.apps.533996414208-a130ppp91kc0seu6jondvrth2i94i7qa";

module.exports = ({ config }) => {
  const googleIosClientId = (
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
    GOOGLE_IOS_CLIENT_ID
  ).trim();

  const googleIosUrlScheme = (
    process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME ||
    GOOGLE_IOS_URL_SCHEME
  ).trim();

  return {
    ...config,
    plugins: [
      ...(config.plugins || []),
      [
        "@react-native-google-signin/google-signin",
        {
          iosUrlScheme: googleIosUrlScheme,
        },
      ],
    ],
    extra: {
      ...(config.extra || {}),
      googleIosClientId,
      googleIosUrlScheme,
    },
  };
};
