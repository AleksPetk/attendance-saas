import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AppLocale } from "@checkstation/i18n";

export type ProductTourPrefs = {
  version: 1;
  seen: boolean;
  locale?: AppLocale;
};

const STORAGE_KEY = "checkstation.productTour.v1";
const DEFAULT_PREFS: ProductTourPrefs = { version: 1, seen: false };

type RawTourPrefs = {
  version?: number;
  seen?: boolean;
  locale?: string;
};

function normalize(raw: RawTourPrefs | null | undefined): ProductTourPrefs {
  const locale = raw?.locale === "ja" || raw?.locale === "en" ? raw.locale : undefined;
  return {
    version: 1,
    seen: Boolean(raw?.seen),
    ...(locale ? { locale } : {}),
  };
}

export async function loadProductTourPrefs(): Promise<ProductTourPrefs> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return normalize(JSON.parse(raw) as RawTourPrefs);
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export async function saveProductTourPrefs(
  patch: Partial<ProductTourPrefs>,
): Promise<ProductTourPrefs> {
  const current = await loadProductTourPrefs();
  const next = normalize({ ...current, ...patch });
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
  return next;
}
