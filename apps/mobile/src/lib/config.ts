import Constants from "expo-constants";
import { createAppConfig, type CheckStationAppConfig } from "@checkstation/config";

export function loadMobileConfig(): CheckStationAppConfig {
  const extra = (Constants.expoConfig?.extra || {}) as { apiBaseUrl?: string };
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
  return createAppConfig({
    environment: __DEV__ ? "development" : "production",
    apiBaseUrl:
      fromEnv
      || extra.apiBaseUrl
      || (__DEV__ ? "http://localhost:8000/api" : "https://workspace.checkstation.app/api"),
  });
}
