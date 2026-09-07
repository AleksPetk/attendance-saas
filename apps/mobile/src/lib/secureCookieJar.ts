import { CookieJar, type CookieJarStorage, type StoredCookie } from "@checkstation/api";
import * as SecureStore from "expo-secure-store";

const KEY = "checkstation.cookieJar.v1";

export class SecureCookieStorage implements CookieJarStorage {
  async load(): Promise<StoredCookie[]> {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as StoredCookie[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async save(cookies: StoredCookie[]): Promise<void> {
    await SecureStore.setItemAsync(KEY, JSON.stringify(cookies));
  }

  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(KEY);
  }
}

export function createSecureCookieJar(): CookieJar {
  return new CookieJar(new SecureCookieStorage());
}
