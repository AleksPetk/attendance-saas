from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from contact.catalog import public_categories_payload
from contact.models import ClientType
from contact.operations import (
    ContactSpamRejected,
    ContactValidationError,
    client_ip,
    submit_contact,
)
from contact.suggestions import suggest_faq_entries, suggestion_payload
from contact.turnstile import (
    TurnstileError,
    configured_site_key,
    turnstile_is_configured,
    verify_turnstile_token,
)
from content.locale import resolve_content_locale
from organizations.permissions import IsWorkspaceOwner

GENERIC_REJECT = {"detail": "Unable to send your message."}


def _public_result(row):
    return {
        "ok": True,
        "reference": row.public_ref,
        "stored": True,
        "delivered": row.delivery_status == "sent",
        "message": (
            "We've received your message."
            if row.delivery_status == "sent"
            else "We've saved your message. Delivery to our inbox may be delayed."
        ),
    }


@method_decorator(csrf_exempt, name="dispatch")
class ContactCategoriesView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        return Response(
            {
                "categories": public_categories_payload(),
                "turnstile_site_key": configured_site_key(),
                "turnstile_required": True,
            }
        )


@method_decorator(csrf_exempt, name="dispatch")
class ContactSuggestionsView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        category = str(request.query_params.get("category") or "").strip()
        subcategory = str(request.query_params.get("subcategory") or "").strip()
        locale = resolve_content_locale(request)
        entries = suggest_faq_entries(category, subcategory, locale=locale)
        return Response({"items": suggestion_payload(entries), "language": locale})


@method_decorator(csrf_exempt, name="dispatch")
class ContactSubmitView(APIView):
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        ip = client_ip(request)
        try:
            if not turnstile_is_configured():
                return Response(GENERIC_REJECT, status=503)
            verify_turnstile_token(payload.get("turnstile_token"), ip)
            row, duplicate = submit_contact(payload, ip=ip)
        except ContactSpamRejected:
            return Response(GENERIC_REJECT, status=400)
        except TurnstileError as exc:
            if exc.code == "turnstile_unavailable":
                return Response(GENERIC_REJECT, status=503)
            return Response(GENERIC_REJECT, status=400)
        except ContactValidationError as exc:
            return Response(exc.errors, status=exc.status)
        body = _public_result(row)
        if duplicate:
            body["duplicate"] = True
        return Response(body, status=200)


class WorkspaceContactSubmitView(APIView):
    """Authenticated Workspace Contact — same store/send path, no Turnstile."""

    permission_classes = [IsAuthenticated, IsWorkspaceOwner]

    def post(self, request):
        raw = request.data if isinstance(request.data, dict) else {}
        payload = {
            "category": raw.get("category"),
            "subcategory": raw.get("subcategory"),
            "email": getattr(request.user, "email", "") or "",
            "name": raw.get("name") or "",
            "subject": raw.get("subject"),
            "message": raw.get("message"),
            "client_type": ClientType.WORKSPACE_WEB,
            "page_path": raw.get("page_path") or "/account/contact",
            "locale": raw.get("locale") or "",
            "company_url": raw.get("company_url") or "",
        }
        ip = client_ip(request)
        try:
            row, duplicate = submit_contact(payload, ip=ip)
        except ContactSpamRejected:
            return Response(GENERIC_REJECT, status=400)
        except ContactValidationError as exc:
            return Response(exc.errors, status=exc.status)
        body = _public_result(row)
        if duplicate:
            body["duplicate"] = True
        return Response(body, status=200)
