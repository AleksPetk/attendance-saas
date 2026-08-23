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
    "input_templates": INPUT_TEMPLATES,
    "fonts": FONT_IDENTIFIERS,
}


def is_valid_preset(category, identifier):
    registry = PRESET_CATALOG.get(category)
    if registry is None:
        return False
    return identifier in registry
