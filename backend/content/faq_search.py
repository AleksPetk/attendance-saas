"""FAQ relevance scoring for the public API (and tests).

Clients may also filter locally using the same rules: lowercase, trim,
AND across tokens, rank question > keywords > category > answer.
"""

import re

TOKEN_RE = re.compile(r"\s+")


def tokenize_query(query):
    return [part for part in TOKEN_RE.split(str(query or "").lower().strip()) if part]


def _haystack(entry):
    keywords = entry.get("keywords") or []
    if isinstance(keywords, str):
        keywords = [part.strip() for part in keywords.split(",") if part.strip()]
    return {
        "question": str(entry.get("question") or "").lower(),
        "keywords": " ".join(str(item).lower() for item in keywords),
        "answer": str(entry.get("answer_markdown") or entry.get("answer") or "").lower(),
        "category": str(
            entry.get("category_label") or entry.get("category") or ""
        ).lower(),
    }


def score_entry(entry, tokens):
    if not tokens:
        return 0
    fields = _haystack(entry)
    blob = (
        fields["question"],
        fields["keywords"],
        fields["answer"],
        fields["category"],
    )
    for token in tokens:
        if not any(token in field for field in blob):
            return 0
    score = 0
    phrase = " ".join(tokens)
    if len(tokens) > 1 and phrase in fields["question"]:
        score += 8
    for token in tokens:
        if token in fields["question"]:
            score += 4
        if token in fields["keywords"]:
            score += 3
        if token in fields["category"]:
            score += 2
        if token in fields["answer"]:
            score += 1
    return score


def filter_faq_entries(entries, query):
    tokens = tokenize_query(query)
    items = list(entries or [])
    if not tokens:
        return items
    scored = []
    for entry in items:
        value = score_entry(entry, tokens)
        if value > 0:
            scored.append((value, entry.get("sort_order") or 0, entry))
    scored.sort(key=lambda row: (-row[0], row[1], str(row[2].get("question") or "")))
    return [row[2] for row in scored]
