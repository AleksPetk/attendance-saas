/**
 * Expo config for CheckStation Mobile.
 *
 * Native Google Sign-In (iOS):
 * - iosClientId + URL scheme identify the iOS app
 * - webClientId (existing Browser Web OAuth client) becomes ID-token audience
 *
 * These values are public OAuth client IDs, not secrets.
 * Browser Google OAuth continues to use the same Web client on the backend.
 */

const GOOGLE_IOS_CLIENT_ID =
  "533996414208-a130ppp91kc0seu6jondvrth2i94i7qa.apps.googleusercontent.com";
const GOOGLE_IOS_URL_SCHEME =
  "com.googleusercontent.apps.533996414208-a130ppp91kc0seu6jondvrth2i94i7qa";
const GOOGLE_WEB_CLIENT_ID =
  "533996414208-meftj1qs2q24cq1hejafcusnblhuqlnp.apps.googleusercontent.com";

module.exports = ({ config }) => {
  const googleIosClientId = (
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
    GOOGLE_IOS_CLIENT_ID
  ).trim();

  const googleIosUrlScheme = (
    process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME ||
    GOOGLE_IOS_URL_SCHEME
  ).trim();

  const googleWebClientId = (
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    GOOGLE_WEB_CLIENT_ID
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
      googleWebClientId,
    },
  };
};
