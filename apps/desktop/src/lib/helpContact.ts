import type { ApiClient, TransportApiClient } from "@checkstation/api";
import { endpoints } from "@checkstation/api";

export type HelpApi = ApiClient | TransportApiClient;

export type ContactSubcategory = {
  id: string;
  label: string;
  faq_queries?: string[];
  faq_categories?: string[];
};

export type ContactCategory = {
  id: string;
  label: string;
  subcategories: ContactSubcategory[];
};

export type ContactSuggestion = {
  id?: string;
  slug: string;
  question: string;
  answer_markdown?: string;
};

export type WorkspaceContactResult = {
  reference: string;
  message: string;
  delivered?: boolean;
  duplicate?: boolean;
};

export type WorkspaceContactPayload = {
  category: string;
  subcategory: string;
  name?: string;
  subject: string;
  message: string;
  page_path?: string;
  locale?: string;
  company_url?: string;
};

export function getContactCategories(api: HelpApi) {
  return api.get<{ categories: ContactCategory[] }>(endpoints.contactCategories(), {
    credentials: false,
  });
}

export function getContactSuggestions(
  api: HelpApi,
  category: string,
  subcategory: string,
  lang: string,
) {
  return api.get<{ items: ContactSuggestion[]; language?: string }>(
    endpoints.contactSuggestions(category, subcategory, lang),
    { credentials: false },
  );
}

export function submitWorkspaceContact(api: HelpApi, payload: WorkspaceContactPayload) {
  return api.post<WorkspaceContactResult>(endpoints.contactWorkspace(), payload);
}
