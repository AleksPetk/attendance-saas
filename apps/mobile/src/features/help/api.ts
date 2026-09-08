import type { ApiClient } from "@checkstation/api";

export type ContentDocumentSummary = {
  id: string;
  slug: string;
  language: string;
  title: string;
  document_type: "documentation" | "legal" | "help" | string;
  nav_group: string;
  nav_group_label: string;
  description: string;
  version: string;
  updated_at: string | null;
  effective_on: string | null;
  sort_order: number;
  fallback: boolean;
};

export type ContentDocument = ContentDocumentSummary & {
  body_markdown: string;
  canonical_url: string | null;
  alternate_urls: Array<{ language: string; href: string }>;
};

export type DocumentListResponse = {
  generated_at: string;
  language: string;
  documents: ContentDocumentSummary[];
};

export type FaqEntry = {
  id: string;
  slug: string;
  language: string;
  question: string;
  answer_markdown: string;
  category: string;
  category_label: string;
  keywords: string[];
  related_document_slug: string | null;
  featured: boolean;
  sort_order: number;
  updated_at: string | null;
};

export type FaqResponse = {
  generated_at: string;
  language: string;
  categories: Array<{ id: string; label: string }>;
  entries: FaqEntry[];
};

const localeQuery = (locale: string) => `lang=${encodeURIComponent(locale)}`;

export function fetchContentDocuments(api: ApiClient, locale: string, signal?: AbortSignal) {
  return api.request<DocumentListResponse>(`/content/documents/?${localeQuery(locale)}`, {
    credentials: false,
    signal,
  });
}

export function fetchContentDocument(api: ApiClient, slug: string, locale: string, signal?: AbortSignal) {
  return api.request<ContentDocument>(
    `/content/documents/${encodeURIComponent(slug)}/?${localeQuery(locale)}`,
    { credentials: false, signal },
  );
}

export function fetchFaq(
  api: ApiClient,
  locale: string,
  options: { category?: string; query?: string; signal?: AbortSignal } = {},
) {
  const params = new URLSearchParams({ lang: locale });
  if (options.category) params.set("category", options.category);
  if (options.query?.trim()) params.set("q", options.query.trim());
  return api.request<FaqResponse>(`/content/faq/?${params.toString()}`, {
    credentials: false,
    signal: options.signal,
  });
}

export type StatusComponent = {
  id: string;
  name: string;
  state: string;
  label: string;
  layer: "core" | "supporting" | "peripheral" | string;
  last_checked_at: string | null;
  description: string;
};

export type StatusIncident = {
  id: string;
  title: string;
  summary: string;
  status: string;
  status_label: string;
  severity: string;
  severity_label: string;
  started_at: string;
  resolved_at: string | null;
  components: string[];
  updates: Array<{ at: string; message: string }>;
};

export type MaintenanceWindow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  note: string;
  components: string[];
  active: boolean;
  upcoming: boolean;
};

export type StatusSnapshot = {
  current: {
    language: string;
    overall: { state: string; label: string };
    generated_at: string;
    last_checked_at: string | null;
    poll_interval_seconds: number;
    components: StatusComponent[];
  };
  incidents: { active: StatusIncident[]; recent: StatusIncident[] };
  maintenance: { windows: MaintenanceWindow[] };
};

async function statusJson<T>(baseUrl: string, path: string, locale: string, signal?: AbortSignal) {
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/api/status/${path}/?lang=${encodeURIComponent(locale)}`,
    { cache: "no-store", signal },
  );
  if (!response.ok) throw new Error(`Status request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export async function fetchStatusSnapshot(baseUrl: string, locale: string, signal?: AbortSignal): Promise<StatusSnapshot> {
  const [current, incidents, maintenance] = await Promise.all([
    statusJson<StatusSnapshot["current"]>(baseUrl, "current", locale, signal),
    statusJson<StatusSnapshot["incidents"]>(baseUrl, "incidents", locale, signal).catch(() => ({ active: [], recent: [] })),
    statusJson<StatusSnapshot["maintenance"]>(baseUrl, "maintenance", locale, signal).catch(() => ({ windows: [] })),
  ]);
  return { current, incidents, maintenance };
}

export function statusPollDelay(snapshot: StatusSnapshot | null) {
  const seconds = Number(snapshot?.current.poll_interval_seconds);
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : 30) * 1000;
}
