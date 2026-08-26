"""Stable public component catalog for Status V1."""

LAYER_CORE = "core"
LAYER_SUPPORTING = "supporting"
LAYER_PERIPHERAL = "peripheral"

COMPONENTS = (
    {
        "id": "workspace_web_app",
        "name": "Workspace Web App",
        "layer": LAYER_CORE,
    },
    {
        "id": "api_backend",
        "name": "API / Backend",
        "layer": LAYER_CORE,
    },
    {
        "id": "kiosk_operations",
        "name": "Kiosk Operations",
        "layer": LAYER_CORE,
    },
    {
        "id": "authentication",
        "name": "Authentication",
        "layer": LAYER_CORE,
    },
    {
        "id": "email_delivery",
        "name": "Email Delivery",
        "layer": LAYER_SUPPORTING,
    },
    {
        "id": "billing_stripe",
        "name": "Billing / Stripe",
        "layer": LAYER_SUPPORTING,
    },
    {
        "id": "public_website",
        "name": "Public Website",
        "layer": LAYER_PERIPHERAL,
    },
    {
        "id": "documentation",
        "name": "Documentation",
        "layer": LAYER_PERIPHERAL,
    },
)

COMPONENT_BY_ID = {item["id"]: item for item in COMPONENTS}
COMPONENT_IDS = tuple(item["id"] for item in COMPONENTS)
CORE_IDS = tuple(item["id"] for item in COMPONENTS if item["layer"] == LAYER_CORE)
SUPPORTING_IDS = tuple(
    item["id"] for item in COMPONENTS if item["layer"] == LAYER_SUPPORTING
)
PERIPHERAL_IDS = tuple(
    item["id"] for item in COMPONENTS if item["layer"] == LAYER_PERIPHERAL
)
