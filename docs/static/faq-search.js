export function tokenizeQuery(query) {
  return String(query || "")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function haystack(entry) {
  const keywords = Array.isArray(entry?.keywords) ? entry.keywords : [];
  return {
    question: String(entry?.question || "").toLowerCase(),
    keywords: keywords.join(" ").toLowerCase(),
    answer: String(entry?.answer_markdown || "").toLowerCase(),
    category: String(entry?.category_label || entry?.category || "").toLowerCase(),
  };
}

export function scoreEntry(entry, tokens) {
  if (!tokens.length) return 0;
  const fields = haystack(entry);
  const blob = [fields.question, fields.keywords, fields.answer, fields.category];
  for (const token of tokens) {
    if (!blob.some((field) => field.includes(token))) return 0;
  }
  let score = 0;
  const phrase = tokens.join(" ");
  if (tokens.length > 1 && fields.question.includes(phrase)) score += 8;
  for (const token of tokens) {
    if (fields.question.includes(token)) score += 4;
    if (fields.keywords.includes(token)) score += 3;
    if (fields.category.includes(token)) score += 2;
    if (fields.answer.includes(token)) score += 1;
  }
  return score;
}

export function filterFaqEntries(entries, query) {
  const tokens = tokenizeQuery(query);
  const items = Array.isArray(entries) ? entries : [];
  if (!tokens.length) {
    return { mode: "grouped", items: [...items], query: "" };
  }
  const scored = items
    .map((entry) => ({
      entry,
      score: scoreEntry(entry, tokens),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.entry.sort_order || 0) - (b.entry.sort_order || 0);
    });
  return {
    mode: "search",
    items: scored.map((row) => row.entry),
    query: tokens.join(" "),
  };
}

export function searchQueryFromSearch(search) {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  return String(params.get("q") || "");
}

export function faqPathForQuery(query) {
  const trimmed = String(query || "").trim();
  if (!trimmed) return "/faq";
  return `/faq?q=${encodeURIComponent(trimmed)}`;
}

export function groupFaqByCategory(entries, categories) {
  const order = Array.isArray(categories) ? categories : [];
  const groups = new Map();
  for (const category of order) {
    groups.set(category.id, { ...category, items: [] });
  }
  for (const entry of entries || []) {
    const key = entry.category;
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        label: entry.category_label || key,
        items: [],
      });
    }
    groups.get(key).items.push(entry);
  }
  for (const group of groups.values()) {
    group.items.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }
  return [...groups.values()].filter((group) => group.items.length);
}
