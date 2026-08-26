"""Deterministic FAQ suggestions for a Contact category/subcategory."""

import re

from content.faq_search import filter_faq_entries
from content.public import faq_entry_payload, public_faq_queryset
from contact.catalog import SUGGESTION_LIMIT, get_pair

_MD_LINK = re.compile(r"\[([^\]]+)\]\([^)]+\)")
_MD_MARK = re.compile(r"[*_`#]+")


def answer_preview(markdown, limit=180):
    text = _MD_LINK.sub(r"\1", str(markdown or ""))
    text = _MD_MARK.sub("", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def suggest_faq_entries(category_id, subcategory_id, entries=None, *, limit=SUGGESTION_LIMIT):
    pair = get_pair(category_id, subcategory_id)
    if not pair:
        return []
    _category, sub = pair
    if entries is None:
        entries = [faq_entry_payload(item) for item in public_faq_queryset()]
    ranked = {}
    for query in sub.get("faq_queries") or ():
        for index, entry in enumerate(filter_faq_entries(entries, query)):
            slug = entry.get("slug")
            if not slug:
                continue
            ranked[slug] = ranked.get(slug, 0) + max(40, 400 - index * 12)
            ranked[slug] += 8 if entry.get("featured") else 0
    wanted_categories = set(sub.get("faq_categories") or ())
    for entry in entries:
        slug = entry.get("slug")
        if not slug:
            continue
        if entry.get("category") in wanted_categories:
            ranked[slug] = ranked.get(slug, 0) + 18
    fallback = filter_faq_entries(entries, sub.get("label") or "")
    for index, entry in enumerate(fallback):
        slug = entry.get("slug")
        if slug:
            ranked[slug] = ranked.get(slug, 0) + max(2, 12 - index)
    by_slug = {item.get("slug"): item for item in entries if item.get("slug")}
    ordered = sorted(ranked.items(), key=lambda row: (-row[1], row[0]))
    results = []
    for slug, _score in ordered:
        entry = by_slug.get(slug)
        if not entry:
            continue
        results.append(entry)
        if len(results) >= limit:
            break
    return results


def suggestion_payload(entries):
    items = []
    for entry in entries:
        items.append(
            {
                "slug": entry.get("slug"),
                "question": entry.get("question"),
                "answer_preview": answer_preview(entry.get("answer_markdown") or ""),
                "answer_markdown": entry.get("answer_markdown") or "",
                "category": entry.get("category"),
                "category_label": entry.get("category_label"),
                "related_document_slug": entry.get("related_document_slug"),
            }
        )
    return items
