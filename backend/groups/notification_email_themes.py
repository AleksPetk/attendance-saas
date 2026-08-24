"""
Email-safe visual themes keyed by kiosk Card/Input template families.

Presentation only — provider transport and attendance semantics are unchanged.
Email clients have limited CSS; themes use conservative colors and table layout.
"""

from kiosk_builder.presets import CARD_TEMPLATES, INPUT_TEMPLATES

# Shared web-safe stacks (no remote fonts).
FONT_SANS = (
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, "
    "sans-serif"
)
FONT_MONO = (
    "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', "
    "'Courier New', monospace"
)
FONT_SERIF = "Georgia, 'Times New Roman', Times, serif"

DEFAULT_THEME_KEY = "clean"

# Layout silhouette used by the HTML renderer (email-safe variants).
# Colors still differ per family even within the same silhouette.
EMAIL_THEME_STYLES = {
    # Neutral / professional defaults
    "clean": {
        "style": "default",
        "page_bg": "#F1F5F9",
        "panel_bg": "#FFFFFF",
        "text": "#0F172A",
        "muted": "#64748B",
        "accent": "#2563EB",
        "border": "#CBD5E1",
        "radius": "12px",
        "font": FONT_SANS,
        "mark": "✓",
        "header_prefix": "",
    },
    "compact": {
        "style": "default",
        "page_bg": "#F8FAFC",
        "panel_bg": "#FFFFFF",
        "text": "#0F172A",
        "muted": "#64748B",
        "accent": "#2563EB",
        "border": "#E2E8F0",
        "radius": "8px",
        "font": FONT_SANS,
        "mark": "✓",
        "header_prefix": "",
    },
    "business": {
        "style": "executive",
        "page_bg": "#F8FAFC",
        "panel_bg": "#FFFFFF",
        "text": "#0F172A",
        "muted": "#64748B",
        "accent": "#1E40AF",
        "border": "#CBD5E1",
        "radius": "6px",
        "font": FONT_SANS,
        "mark": "■",
        "header_prefix": "",
    },
    "executive": {
        "style": "executive",
        "page_bg": "#F8FAFC",
        "panel_bg": "#FFFFFF",
        "text": "#0F172A",
        "muted": "#64748B",
        "accent": "#1E40AF",
        "border": "#CBD5E1",
        "radius": "6px",
        "font": FONT_SANS,
        "mark": "■",
        "header_prefix": "",
    },
    "large_touch": {
        "style": "default",
        "page_bg": "#EFF6FF",
        "panel_bg": "#FFFFFF",
        "text": "#0F172A",
        "muted": "#64748B",
        "accent": "#2563EB",
        "border": "#BFDBFE",
        "radius": "16px",
        "font": FONT_SANS,
        "mark": "✓",
        "header_prefix": "",
    },
    "photo": {
        "style": "default",
        "page_bg": "#F8FAFC",
        "panel_bg": "#FFFFFF",
        "text": "#0F172A",
        "muted": "#64748B",
        "accent": "#2563EB",
        "border": "#E2E8F0",
        "radius": "14px",
        "font": FONT_SANS,
        "mark": "●",
        "header_prefix": "",
    },
    "minimal": {
        "style": "minimal",
        "page_bg": "#FFFFFF",
        "panel_bg": "#FFFFFF",
        "text": "#0F172A",
        "muted": "#64748B",
        "accent": "#334155",
        "border": "#E2E8F0",
        "radius": "4px",
        "font": FONT_SANS,
        "mark": "–",
        "header_prefix": "",
    },
    "bare": {
        "style": "minimal",
        "page_bg": "#FFFFFF",
        "panel_bg": "#FFFFFF",
        "text": "#0F172A",
        "muted": "#64748B",
        "accent": "#475569",
        "border": "#E2E8F0",
        "radius": "4px",
        "font": FONT_SANS,
        "mark": "–",
        "header_prefix": "",
    },
    "pure": {
        "style": "minimal",
        "page_bg": "#F8FAFC",
        "panel_bg": "#FFFFFF",
        "text": "#0F172A",
        "muted": "#64748B",
        "accent": "#64748B",
        "border": "#E2E8F0",
        "radius": "8px",
        "font": FONT_SANS,
        "mark": "✓",
        "header_prefix": "",
    },
    "bold": {
        "style": "dark",
        "page_bg": "#0F172A",
        "panel_bg": "#1E293B",
        "text": "#F8FAFC",
        "muted": "#CBD5E1",
        "accent": "#38BDF8",
        "border": "#334155",
        "radius": "10px",
        "font": FONT_SANS,
        "mark": "✓",
        "header_prefix": "",
    },
    "dark": {
        "style": "dark",
        "page_bg": "#020617",
        "panel_bg": "#0F172A",
        "text": "#F8FAFC",
        "muted": "#94A3B8",
        "accent": "#38BDF8",
        "border": "#334155",
        "radius": "10px",
        "font": FONT_SANS,
        "mark": "✓",
        "header_prefix": "",
    },
    "glass": {
        "style": "default",
        "page_bg": "#E0F2FE",
        "panel_bg": "#F8FAFC",
        "text": "#0F172A",
        "muted": "#64748B",
        "accent": "#2563EB",
        "border": "#BAE6FD",
        "radius": "14px",
        "font": FONT_SANS,
        "mark": "◇",
        "header_prefix": "",
    },
    "outline": {
        "style": "default",
        "page_bg": "#F8FAFC",
        "panel_bg": "#FFFFFF",
        "text": "#0F172A",
        "muted": "#64748B",
        "accent": "#2563EB",
        "border": "#2563EB",
        "radius": "10px",
        "font": FONT_SANS,
        "mark": "○",
        "header_prefix": "",
    },
    "soft": {
        "style": "default",
        "page_bg": "#EFF6FF",
        "panel_bg": "#FFFFFF",
        "text": "#0F172A",
        "muted": "#64748B",
        "accent": "#3B82F6",
        "border": "#BFDBFE",
        "radius": "16px",
        "font": FONT_SANS,
        "mark": "✓",
        "header_prefix": "",
    },
    "rounded": {
        "style": "default",
        "page_bg": "#EEF2FF",
        "panel_bg": "#FFFFFF",
        "text": "#0F172A",
        "muted": "#64748B",
        "accent": "#4F46E5",
        "border": "#C7D2FE",
        "radius": "20px",
        "font": FONT_SANS,
        "mark": "✓",
        "header_prefix": "",
    },
    "kids_bubble": {
        "style": "playful",
        "page_bg": "#FEF9C3",
        "panel_bg": "#FFFEF5",
        "text": "#312E81",
        "muted": "#6366F1",
        "accent": "#A855F7",
        "border": "#FBBF24",
        "radius": "24px",
        "font": FONT_SANS,
        "mark": "★",
        "header_prefix": "",
    },
    "playground": {
        "style": "playful",
        "page_bg": "#FDF4FF",
        "panel_bg": "#FFFFFF",
        "text": "#312E81",
        "muted": "#7C3AED",
        "accent": "#7C3AED",
        "border": "#E9D5FF",
        "radius": "14px",
        "font": FONT_SANS,
        "mark": "★",
        "header_prefix": "",
    },
    "heart_pop": {
        "style": "heart",
        "page_bg": "#FFF7ED",
        "panel_bg": "#FFFDF8",
        "text": "#431407",
        "muted": "#9A3412",
        "accent": "#FB7185",
        "border": "#FDE68A",
        "radius": "18px",
        "font": FONT_SANS,
        "mark": "♥",
        "header_prefix": "",
    },
    "welcome": {
        "style": "heart",
        "page_bg": "#FFF7ED",
        "panel_bg": "#FFFDF8",
        "text": "#431407",
        "muted": "#9A3412",
        "accent": "#EA580C",
        "border": "#FDE68A",
        "radius": "18px",
        "font": FONT_SANS,
        "mark": "♥",
        "header_prefix": "",
    },
    "ticket": {
        "style": "ticket",
        "page_bg": "#F8FAFC",
        "panel_bg": "#FFFEF5",
        "text": "#0F172A",
        "muted": "#64748B",
        "accent": "#2563EB",
        "border": "#94A3B8",
        "radius": "4px",
        "font": FONT_SANS,
        "mark": "◆",
        "header_prefix": "",
    },
    "pass": {
        "style": "ticket",
        "page_bg": "#F0F9FF",
        "panel_bg": "#FFFEF5",
        "text": "#0F172A",
        "muted": "#64748B",
        "accent": "#0284C7",
        "border": "#7DD3FC",
        "radius": "4px",
        "font": FONT_SANS,
        "mark": "◆",
        "header_prefix": "",
    },
    "id_badge": {
        "style": "ticket",
        "page_bg": "#F8FAFC",
        "panel_bg": "#FFFFFF",
        "text": "#0F172A",
        "muted": "#64748B",
        "accent": "#2563EB",
        "border": "#CBD5E1",
        "radius": "8px",
        "font": FONT_SANS,
        "mark": "▣",
        "header_prefix": "",
    },
    "cyber_hex": {
        "style": "cyber",
        "page_bg": "#020617",
        "panel_bg": "#0F172A",
        "text": "#F8FAFC",
        "muted": "#94A3B8",
        "accent": "#22D3EE",
        "border": "#164E63",
        "radius": "4px",
        "font": FONT_SANS,
        "mark": "◈",
        "header_prefix": "",
    },
    "terminal": {
        "style": "terminal",
        "page_bg": "#020617",
        "panel_bg": "#0A0F0D",
        "text": "#E2E8F0",
        "muted": "#86EFAC",
        "accent": "#4ADE80",
        "border": "#14532D",
        "radius": "4px",
        "font": FONT_MONO,
        "mark": ">",
        "header_prefix": "> ",
    },
    "polaroid": {
        "style": "default",
        "page_bg": "#F1F5F9",
        "panel_bg": "#FFFFFF",
        "text": "#0F172A",
        "muted": "#64748B",
        "accent": "#2563EB",
        "border": "#E2E8F0",
        "radius": "6px",
        "font": FONT_SANS,
        "mark": "□",
        "header_prefix": "",
    },
    "sticker_pack": {
        "style": "playful",
        "page_bg": "#FEF3C7",
        "panel_bg": "#FFFFFF",
        "text": "#0F172A",
        "muted": "#92400E",
        "accent": "#F59E0B",
        "border": "#FCD34D",
        "radius": "16px",
        "font": FONT_SANS,
        "mark": "✦",
        "header_prefix": "",
    },
    "ribbon": {
        "style": "default",
        "page_bg": "#F5F3FF",
        "panel_bg": "#FFFFFF",
        "text": "#0F172A",
        "muted": "#6D28D9",
        "accent": "#7C3AED",
        "border": "#DDD6FE",
        "radius": "10px",
        "font": FONT_SANS,
        "mark": "◆",
        "header_prefix": "",
    },
    "comic": {
        "style": "comic",
        "page_bg": "#FEF3C7",
        "panel_bg": "#FFFBEB",
        "text": "#0F172A",
        "muted": "#78350F",
        "accent": "#F97316",
        "border": "#0F172A",
        "radius": "4px",
        "font": FONT_SANS,
        "mark": "!",
        "header_prefix": "",
    },
    "active": {
        "style": "default",
        "page_bg": "#FEF2F2",
        "panel_bg": "#FFFFFF",
        "text": "#0F172A",
        "muted": "#64748B",
        "accent": "#DC2626",
        "border": "#FECACA",
        "radius": "12px",
        "font": FONT_SANS,
        "mark": "●",
        "header_prefix": "",
    },
    "victory": {
        "style": "victory",
        "page_bg": "#FEF9C3",
        "panel_bg": "#FFFBEB",
        "text": "#422006",
        "muted": "#A16207",
        "accent": "#CA8A04",
        "border": "#FDE047",
        "radius": "14px",
        "font": FONT_SANS,
        "mark": "★",
        "header_prefix": "",
    },
}


def all_kiosk_template_keys():
    """Union of Card + Input template keys that must resolve an email theme."""
    return frozenset(CARD_TEMPLATES) | frozenset(INPUT_TEMPLATES)


def normalize_email_theme_key(template_key):
    """
    Map a kiosk template key onto a known email theme.
    Unknown / legacy keys fall back to the neutral default.
    """
    key = (template_key or "").strip()
    if key in EMAIL_THEME_STYLES:
        return key
    return DEFAULT_THEME_KEY


def get_email_theme(template_key):
    """Return a copy of theme tokens for the given kiosk template key."""
    key = normalize_email_theme_key(template_key)
    theme = dict(EMAIL_THEME_STYLES[key])
    theme["key"] = key
    return theme


def email_theme_coverage():
    """
    Report which kiosk template keys have an explicit email theme.
    Keys without an explicit entry still resolve via DEFAULT_THEME_KEY.
    """
    keys = sorted(all_kiosk_template_keys())
    explicit = [k for k in keys if k in EMAIL_THEME_STYLES]
    fallback = [k for k in keys if k not in EMAIL_THEME_STYLES]
    return {
        "total": len(keys),
        "explicit": explicit,
        "fallback_to_default": fallback,
    }
