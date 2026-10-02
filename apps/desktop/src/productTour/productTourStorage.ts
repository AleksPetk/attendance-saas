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

type DesktopTourBridge = {
  getProductTourPrefs?: () => Promise<RawTourPrefs>;
  setProductTourPrefs?: (prefs: RawTourPrefs) => Promise<RawTourPrefs>;
};

function bridge(): DesktopTourBridge | undefined {
  return (typeof window !== "undefined" ? window.checkstationDesktop : undefined) as
    | DesktopTourBridge
    | undefined;
}

function normalize(raw: RawTourPrefs | null | undefined): ProductTourPrefs {
  const locale = raw?.locale === "ja" || raw?.locale === "en" ? raw.locale : undefined;
  return {
    version: 1,
    seen: Boolean(raw?.seen),
    ...(locale ? { locale } : {}),
  };
}

function readLocalFallback(): ProductTourPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return normalize(JSON.parse(raw) as Partial<ProductTourPrefs>);
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function writeLocalFallback(prefs: ProductTourPrefs): ProductTourPrefs {
  const next = normalize(prefs);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
  return next;
}

export async function loadProductTourPrefs(): Promise<ProductTourPrefs> {
  const api = bridge();
  if (api?.getProductTourPrefs) {
    try {
      return normalize(await api.getProductTourPrefs());
    } catch {
      return readLocalFallback();
    }
  }
  return readLocalFallback();
}

export async function saveProductTourPrefs(
  patch: Partial<ProductTourPrefs>,
): Promise<ProductTourPrefs> {
  const api = bridge();
  if (api?.setProductTourPrefs) {
    try {
      return normalize(await api.setProductTourPrefs(patch));
    } catch {
      const merged = normalize({ ...readLocalFallback(), ...patch });
      return writeLocalFallback(merged);
    }
  }
  const merged = normalize({ ...readLocalFallback(), ...patch });
  return writeLocalFallback(merged);
}
