"""Check Station branding, navigation, dashboard, and category landings."""

from django.contrib import admin
from django.http import Http404
from django.template.response import TemplateResponse

from core.admin_categories import (
    build_category_page_for_app,
    install_category_verbose_names,
)
from core.admin_dashboard import build_dashboard_context, build_nav_groups

_INSTALLED = False

SITE_HEADER = "Check Station"
SITE_TITLE = "Check Station"
INDEX_TITLE = "Platform dashboard"

# Business-facing apps first; Django auth utilities last.
ADMIN_APP_ORDER = (
    "organizations",
    "accounts",
    "members",
    "groups",
    "kiosk_builder",
    "billing",
    "content",
    "contact",
    "core",
    "auth",
)

ADMIN_MODEL_ORDER = {
    "organizations": (
        "organization",
        "workspacestaffaccount",
    ),
    "accounts": ("user",),
    "members": ("member",),
    "groups": (
        "group",
        "groupsection",
        "groupmembership",
        "grouponlyparticipant",
    ),
    "kiosk_builder": (
        "kiosksettings",
        "kioskdesign",
    ),
    "billing": ("workspacesubscription", "providerevent"),
    "content": ("document", "faqentry"),
    "core": (
        "platformpromotionsettings",
        "platformpromotionmodechange",
        "platformadvertisingsettings",
    ),
    "auth": (
        "group",
        "permission",
    ),
}


def _sort_key(value, order):
    try:
        return order.index(value)
    except ValueError:
        return len(order)


def _ordered_app_list(app_list):
    app_rank = {label: index for index, label in enumerate(ADMIN_APP_ORDER)}
    app_list = sorted(
        app_list,
        key=lambda app: (
            app_rank.get(app["app_label"], len(ADMIN_APP_ORDER)),
            app["name"].lower(),
        ),
    )
    for app in app_list:
        model_order = ADMIN_MODEL_ORDER.get(app["app_label"], ())
        app["models"].sort(
            key=lambda model: (
                _sort_key(model["object_name"].lower(), model_order),
                model["name"].lower(),
            )
        )
    return app_list


def install_admin_branding():
    global _INSTALLED
    if _INSTALLED:
        return

    install_category_verbose_names()

    admin.site.site_header = SITE_HEADER
    admin.site.site_title = SITE_TITLE
    admin.site.index_title = INDEX_TITLE
    admin.site.index_template = "admin/platform_dashboard.html"
    admin.site.app_index_template = "admin/platform_category.html"

    original_get_app_list = admin.site.get_app_list

    def get_app_list(request, app_label=None):
        return _ordered_app_list(original_get_app_list(request, app_label=app_label))

    admin.site.get_app_list = get_app_list

    previous_each_context = admin.site.each_context

    def each_context(request):
        context = previous_each_context(request)
        context["platform_nav_groups"] = build_nav_groups(
            context.get("available_apps"),
            request_path=getattr(request, "path", ""),
        )
        return context

    admin.site.each_context = each_context

    original_index = admin.site.index

    def index(request, extra_context=None):
        context = build_dashboard_context(request)
        if extra_context:
            context.update(extra_context)
        return original_index(request, extra_context=context)

    admin.site.index = index

    def app_index(request, app_label, extra_context=None):
        # Permission gate: user must be able to see this Django app.
        app_list = admin.site.get_app_list(request, app_label)
        if not app_list:
            raise Http404("The requested admin page does not exist.")

        available_apps = admin.site.get_app_list(request)
        category = build_category_page_for_app(app_label, available_apps)
        if category is None:
            raise Http404("The requested admin page does not exist.")

        context = {
            **admin.site.each_context(request),
            "app_list": app_list,
            "app_label": app_label,
            "subtitle": None,
            **category,
            **(extra_context or {}),
        }
        request.current_app = admin.site.name
        return TemplateResponse(
            request,
            admin.site.app_index_template or "admin/platform_category.html",
            context,
        )

    admin.site.app_index = app_index
    _INSTALLED = True
