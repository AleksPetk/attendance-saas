"""
Application-defined preset registries for the Kiosk Builder.

Presets are curated visual treatments that customers select — they are not
customer-authored CSS.  Identifiers are stable strings.  Adding a new preset
requires no database migration; just add an entry here and a corresponding
CSS class in the frontend.

The preset list API endpoint returns this catalog so the frontend builder
can stay in sync without hardcoding a duplicate list.
"""

MAIN_LAYOUT_PRESETS = {
    "centered": {"label": "Centered", "description": "Content centered vertically and horizontally."},
    "compact": {"label": "Compact", "description": "Space-efficient layout for smaller screens."},
    "split": {"label": "Split", "description": "Two-column layout for wider displays."},
    "large_touch": {"label": "Large Touch", "description": "Oversized touch targets for kiosk tablets."},
    "photo_cards": {"label": "Photo Cards", "description": "Prominent participant photos in card grid."},
}

BUTTON_PRESETS = {
    "rounded": {"label": "Rounded", "description": "Soft rounded corners."},
    "flat": {"label": "Flat", "description": "Minimal flat appearance."},
    "pill": {"label": "Pill", "description": "Fully rounded pill shape."},
}

INPUT_PRESETS = {
    "outlined": {"label": "Outlined", "description": "Border-outlined input fields."},
    "filled": {"label": "Filled", "description": "Filled background input fields."},
    "minimal": {"label": "Minimal", "description": "Underline-only minimal style."},
}

CARD_PRESETS = {
    "elevated": {"label": "Elevated", "description": "Raised card with shadow."},
    "flat": {"label": "Flat", "description": "Flat card with subtle border."},
    "bordered": {"label": "Bordered", "description": "Prominent bordered card."},
}

# Canonical Card-mode presentation templates (complete looks).
# Legacy layout_preset + card_preset are derived from these for compatibility.
CARD_TEMPLATES = {
    "clean": {
        "label": "Clean",
        "layout": "centered",
        "card": "elevated",
    },
    "compact": {
        "label": "Compact",
        "layout": "compact",
        "card": "flat",
    },
    "business": {
        "label": "Business",
        "layout": "split",
        "card": "bordered",
    },
    "large_touch": {
        "label": "Large Touch",
        "layout": "large_touch",
        "card": "elevated",
    },
    "photo": {
        "label": "Photo",
        "layout": "photo_cards",
        "card": "elevated",
    },
    "minimal": {
        "label": "Minimal",
        "layout": "centered",
        "card": "flat",
    },
    "bold": {
        "label": "Bold",
        "layout": "centered",
        "card": "elevated",
    },
    "glass": {
        "label": "Glass",
        "layout": "centered",
        "card": "elevated",
    },
    "outline": {
        "label": "Outline",
        "layout": "centered",
        "card": "bordered",
    },
    "soft": {
        "label": "Soft",
        "layout": "centered",
        "card": "elevated",
    },
    "kids_bubble": {
        "label": "Kids Bubble",
        "layout": "centered",
        "card": "elevated",
    },
    "heart_pop": {
        "label": "Heart Pop",
        "layout": "centered",
        "card": "elevated",
    },
    "ticket": {
        "label": "Ticket",
        "layout": "centered",
        "card": "bordered",
    },
    "id_badge": {
        "label": "ID Badge",
        "layout": "centered",
        "card": "elevated",
    },
    "cyber_hex": {
        "label": "Cyber Hex",
        "layout": "centered",
        "card": "elevated",
    },
    "polaroid": {
        "label": "Polaroid",
        "layout": "centered",
        "card": "elevated",
    },
    "sticker_pack": {
        "label": "Sticker Pack",
        "layout": "centered",
        "card": "elevated",
    },
    "terminal": {
        "label": "Terminal",
        "layout": "centered",
        "card": "elevated",
    },
    "ribbon": {
        "label": "Ribbon",
        "layout": "centered",
        "card": "elevated",
    },
    "comic": {
        "label": "Comic",
        "layout": "centered",
        "card": "elevated",
    },
    "pure": {
        "label": "Pure",
        "layout": "centered",
        "card": "elevated",
    },
    "executive": {
        "label": "Executive",
        "layout": "centered",
        "card": "bordered",
    },
    "welcome": {
        "label": "Welcome",
        "layout": "centered",
        "card": "elevated",
    },
    "playground": {
        "label": "Playground",
        "layout": "centered",
        "card": "elevated",
    },
    "active": {
        "label": "Active",
        "layout": "centered",
        "card": "elevated",
    },
    "pass": {
        "label": "Pass",
        "layout": "centered",
        "card": "bordered",
    },
    "victory": {
        "label": "Victory",
        "layout": "centered",
        "card": "elevated",
    },
    "bare": {
        "label": "Bare",
        "layout": "centered",
        "card": "flat",
    },
}

_LEGACY_CARD_TEMPLATE_MAP = {
    ("centered", "elevated"): "clean",
    ("centered", "flat"): "minimal",
    ("centered", "bordered"): "outline",
    ("compact", "elevated"): "compact",
    ("compact", "flat"): "compact",
    ("compact", "bordered"): "compact",
    ("split", "elevated"): "business",
    ("split", "flat"): "business",
    ("split", "bordered"): "business",
    ("large_touch", "elevated"): "large_touch",
    ("large_touch", "flat"): "large_touch",
    ("large_touch", "bordered"): "large_touch",
    ("photo_cards", "elevated"): "photo",
    ("photo_cards", "flat"): "photo",
    ("photo_cards", "bordered"): "photo",
}


def derive_card_template(layout="centered", card="elevated"):
    exact = _LEGACY_CARD_TEMPLATE_MAP.get((layout, card))
    if exact:
        return exact
    if layout == "photo_cards":
        return "photo"
    if layout == "large_touch":
        return "large_touch"
    if layout == "compact":
        return "compact"
    if layout == "split":
        return "business"
    if card == "bordered":
        return "outline"
    if card == "flat":
        return "minimal"
    return "clean"


def apply_card_template_presets(template_id):
    """Return layout/card legacy fields for a card template id."""
    meta = CARD_TEMPLATES.get(template_id) or CARD_TEMPLATES["clean"]
    return {
        "card_template": template_id if template_id in CARD_TEMPLATES else "clean",
        "layout_preset": meta["layout"],
        "card_preset": meta["card"],
    }

# Canonical Input-mode Main templates (complete looks).
# Legacy layout/button/input presets are derived from these for compatibility.
INPUT_TEMPLATES = {
    "clean": {
        "label": "Clean",
        "layout": "centered",
        "button": "rounded",
        "input": "outlined",
    },
    "soft": {
        "label": "Soft",
        "layout": "centered",
        "button": "pill",
        "input": "filled",
    },
    "bold": {
        "label": "Bold",
        "layout": "centered",
        "button": "flat",
        "input": "outlined",
    },
    "minimal": {
        "label": "Minimal",
        "layout": "centered",
        "button": "flat",
        "input": "minimal",
    },
    "outline": {
        "label": "Outline",
        "layout": "centered",
        "button": "rounded",
        "input": "outlined",
    },
    "dark": {
        "label": "Dark",
        "layout": "centered",
        "button": "rounded",
        "input": "filled",
    },
    "glass": {
        "label": "Glass",
        "layout": "centered",
        "button": "pill",
        "input": "outlined",
    },
    "rounded": {
        "label": "Rounded",
        "layout": "centered",
        "button": "pill",
        "input": "filled",
    },
    "compact": {
        "label": "Compact",
        "layout": "compact",
        "button": "rounded",
        "input": "outlined",
    },
    "large_touch": {
        "label": "Large Touch",
        "layout": "large_touch",
        "button": "rounded",
        "input": "outlined",
    },
    "kids_bubble": {
        "label": "Kids Bubble",
        "layout": "centered",
        "button": "pill",
        "input": "filled",
    },
    "heart_pop": {
        "label": "Heart Pop",
        "layout": "centered",
        "button": "pill",
        "input": "outlined",
    },
    "ticket": {
        "label": "Ticket",
        "layout": "centered",
        "button": "flat",
        "input": "outlined",
    },
    "id_badge": {
        "label": "ID Badge",
        "layout": "centered",
        "button": "rounded",
        "input": "outlined",
    },
    "cyber_hex": {
        "label": "Cyber Hex",
        "layout": "centered",
        "button": "flat",
        "input": "filled",
    },
    "polaroid": {
        "label": "Polaroid",
        "layout": "centered",
        "button": "rounded",
        "input": "outlined",
    },
    "sticker_pack": {
        "label": "Sticker Pack",
        "layout": "centered",
        "button": "rounded",
        "input": "filled",
    },
    "terminal": {
        "label": "Terminal",
        "layout": "centered",
        "button": "flat",
        "input": "outlined",
    },
    "ribbon": {
        "label": "Ribbon",
        "layout": "centered",
        "button": "rounded",
        "input": "outlined",
    },
    "comic": {
        "label": "Comic",
        "layout": "centered",
        "button": "flat",
        "input": "outlined",
    },
    "pure": {
        "label": "Pure",
        "layout": "centered",
        "button": "rounded",
        "input": "outlined",
    },
    "executive": {
        "label": "Executive",
        "layout": "centered",
        "button": "rounded",
        "input": "outlined",
    },
    "welcome": {
        "label": "Welcome",
        "layout": "centered",
        "button": "pill",
        "input": "filled",
    },
    "playground": {
        "label": "Playground",
        "layout": "centered",
        "button": "pill",
        "input": "filled",
    },
    "active": {
        "label": "Active",
        "layout": "centered",
        "button": "flat",
        "input": "outlined",
    },
    "pass": {
        "label": "Pass",
        "layout": "centered",
        "button": "rounded",
        "input": "outlined",
    },
    "victory": {
        "label": "Victory",
        "layout": "centered",
        "button": "rounded",
        "input": "filled",
    },
    "bare": {
        "label": "Bare",
        "layout": "centered",
        "button": "flat",
        "input": "minimal",
    },
}

_LEGACY_INPUT_TEMPLATE_MAP = {
    ("centered", "rounded", "outlined"): "clean",
    ("centered", "pill", "filled"): "soft",
    ("centered", "flat", "outlined"): "bold",
    ("centered", "flat", "minimal"): "minimal",
    ("centered", "rounded", "filled"): "rounded",
    ("centered", "pill", "outlined"): "glass",
    ("compact", "rounded", "outlined"): "compact",
    ("compact", "rounded", "filled"): "compact",
    ("compact", "pill", "filled"): "compact",
    ("large_touch", "rounded", "outlined"): "large_touch",
    ("large_touch", "rounded", "filled"): "large_touch",
    ("large_touch", "pill", "outlined"): "large_touch",
}


def derive_input_template(layout="centered", button="rounded", input_style="outlined"):
    exact = _LEGACY_INPUT_TEMPLATE_MAP.get((layout, button, input_style))
    if exact:
        return exact
    if layout == "large_touch":
        return "large_touch"
    if layout == "compact":
        return "compact"
    if input_style == "minimal":
        return "minimal"
    if button == "flat" and input_style == "outlined":
        return "bold"
    if button == "pill" and input_style == "filled":
        return "soft"
    if input_style == "filled":
        return "rounded"
    return "clean"


def apply_input_template_presets(template_id):
    """Return layout/button/input legacy fields for a template id."""
    meta = INPUT_TEMPLATES.get(template_id) or INPUT_TEMPLATES["clean"]
    return {
        "input_template": template_id if template_id in INPUT_TEMPLATES else "clean",
        "layout_preset": meta["layout"],
        "button_preset": meta["button"],
        "input_preset": meta["input"],
    }

FONT_IDENTIFIERS = {
    "inter": {"label": "Inter", "family": "Inter, sans-serif"},
    "roboto": {"label": "Roboto", "family": "Roboto, sans-serif"},
    "open_sans": {"label": "Open Sans", "family": "'Open Sans', sans-serif"},
    "lato": {"label": "Lato", "family": "Lato, sans-serif"},
    "poppins": {"label": "Poppins", "family": "Poppins, sans-serif"},
    "nunito": {"label": "Nunito", "family": "Nunito, sans-serif"},
    "source_sans": {"label": "Source Sans 3", "family": "'Source Sans 3', sans-serif"},
    "merriweather": {"label": "Merriweather", "family": "Merriweather, serif"},
}

PRESET_CATALOG = {
    "main_layouts": MAIN_LAYOUT_PRESETS,
    "button_styles": BUTTON_PRESETS,
    "input_styles": INPUT_PRESETS,
    "card_styles": CARD_PRESETS,
    "card_templates": CARD_TEMPLATES,
    "input_templates": INPUT_TEMPLATES,
    "fonts": FONT_IDENTIFIERS,
}


def is_valid_preset(category, identifier):
    registry = PRESET_CATALOG.get(category)
    if registry is None:
        return False
    return identifier in registry
