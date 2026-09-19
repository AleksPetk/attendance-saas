"""Owner billing APIs and the Stripe webhook endpoint."""

from __future__ import annotations

import logging

from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from billing.catalog import catalog_public_payload
from billing.markets import resolve_billing_market
from billing.exceptions import (
    BillingStateError,
    StripeConfigurationError,
    StripeProviderError,
    StripeSignatureError,
)
from billing.apple_notifications import process_apple_notification_signed_payload
from billing.apple_verify import (
    AppleVerificationError,
    verify_and_activate_apple_subscription,
)
from billing.operations import (
    apply_upgrade_to_business,
    clear_future_paid_intent,
    list_customer_invoices,
    open_customer_portal,
    preview_upgrade_to_business,
    request_cancel_scheduled_downgrade,
    request_cancellation,
    request_downgrade_to_plus,
    request_resume_subscription,
    request_schedule_billing_change,
    set_future_paid_intent,
    start_paid_checkout,
)
from billing.prices import stripe_api_configured
from billing.provider import get_billing_provider
from billing.state import build_billing_state
from billing.webhooks import process_provider_event
from organizations.permissions import IsWorkspaceOwner, get_owned_organization

logger = logging.getLogger("billing")


def _error_response(exc, status=400):
    code = getattr(exc, "code", "billing_state_error")
    http_status = status
    if isinstance(exc, StripeConfigurationError):
        http_status = 503
    elif isinstance(exc, StripeProviderError):
        http_status = 502
    return Response({"code": code, "detail": str(exc)}, status=http_status)


class BillingCatalogView(APIView):
    """
    Public catalog from trusted request geo, or the owner's workspace market.

    Anonymous visitors cannot choose market via query, body, language, or cookies.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        organization = get_owned_organization(request.user)
        if organization is not None:
            market = resolve_billing_market(organization)
        else:
            from core.geo import resolve_request_geo

            market = resolve_request_geo(request).billing_market
        payload = catalog_public_payload(organization=organization, market=market)
        from billing.builtin_trial import BUILTIN_TRIAL_DAYS, BUILTIN_TRIAL_OFFERED
        from core.geo import public_geo_payload

        payload["builtin_trial_days"] = BUILTIN_TRIAL_DAYS
        payload["builtin_trial_offered"] = BUILTIN_TRIAL_OFFERED
        payload["stripe_configured"] = stripe_api_configured(market=market)
        # Always include request geo defaults (language bootstrap); market in
        # payload remains workspace-effective when authenticated.
        payload["geo"] = public_geo_payload(request)
        return Response(payload)


class OwnerBillingView(APIView):
    permission_classes = [IsAuthenticated, IsWorkspaceOwner]

    def get(self, request):
        organization = get_owned_organization(request.user)
        return Response(build_billing_state(organization))


class BillingCheckoutView(APIView):
    permission_classes = [IsAuthenticated, IsWorkspaceOwner]

    def post(self, request):
        organization = get_owned_organization(request.user)
        try:
            result = start_paid_checkout(
                organization,
                request.user,
                plan_key=request.data.get("plan"),
                interval=request.data.get("interval"),
            )
        except (BillingStateError, StripeConfigurationError, StripeProviderError) as exc:
            return _error_response(exc)
        mode = getattr(result, "mode", "checkout") or "checkout"
        payload = {
            "mode": mode,
            "checkout_url": result.checkout_url or None,
            "session_id": result.session_id or None,
        }
        if mode != "checkout":
            payload["billing"] = build_billing_state(organization)
        return Response(payload)


class BillingFuturePlanView(APIView):
    """Intent-only future paid plan (no Stripe Checkout, no StoreKit charge)."""

    permission_classes = [IsAuthenticated, IsWorkspaceOwner]

    def post(self, request):
        organization = get_owned_organization(request.user)
        try:
            set_future_paid_intent(
                organization,
                plan_key=request.data.get("plan"),
                interval=request.data.get("interval"),
            )
        except BillingStateError as exc:
            return _error_response(exc)
        organization.refresh_from_db()
        return Response(build_billing_state(organization))


class BillingFuturePlanClearView(APIView):
    permission_classes = [IsAuthenticated, IsWorkspaceOwner]

    def post(self, request):
        organization = get_owned_organization(request.user)
        try:
            clear_future_paid_intent(organization)
        except BillingStateError as exc:
            return _error_response(exc)
        organization.refresh_from_db()
        return Response(build_billing_state(organization))


class BillingUpgradePreviewView(APIView):
    permission_classes = [IsAuthenticated, IsWorkspaceOwner]

    def post(self, request):
        organization = get_owned_organization(request.user)
        try:
            preview = preview_upgrade_to_business(organization)
        except (BillingStateError, StripeConfigurationError, StripeProviderError) as exc:
            return _error_response(exc)
        from billing.catalog import format_currency_minor

        return Response(
            {
                "amount_due_cents": preview.amount_due_cents,
                "amount_due_minor": preview.amount_due_cents,
                "amount_due_formatted": format_currency_minor(preview.amount_due_cents, preview.currency),
                "currency": preview.currency,
                "recurring_cents": preview.recurring_cents,
                "recurring_amount_minor": preview.recurring_cents,
                "recurring_formatted": format_currency_minor(preview.recurring_cents, preview.currency),
                "recurring_interval": preview.recurring_interval,
                "target_plan": preview.target_plan,
                "next_renewal_at": (
                    preview.next_renewal_at.isoformat()
                    if preview.next_renewal_at
                    else None
                ),
            }
        )


class BillingUpgradeView(APIView):
    permission_classes = [IsAuthenticated, IsWorkspaceOwner]

    def post(self, request):
        organization = get_owned_organization(request.user)
        try:
            apply_upgrade_to_business(organization)
        except (BillingStateError, StripeConfigurationError, StripeProviderError) as exc:
            return _error_response(exc)
        organization.refresh_from_db()
        return Response(build_billing_state(organization))


class BillingDowngradeView(APIView):
    permission_classes = [IsAuthenticated, IsWorkspaceOwner]

    def post(self, request):
        organization = get_owned_organization(request.user)
        try:
            request_downgrade_to_plus(
                organization,
                interval=request.data.get("interval"),
            )
        except (BillingStateError, StripeConfigurationError, StripeProviderError) as exc:
            return _error_response(exc)
        organization.refresh_from_db()
        return Response(build_billing_state(organization))


class BillingCancelView(APIView):
    permission_classes = [IsAuthenticated, IsWorkspaceOwner]

    def post(self, request):
        organization = get_owned_organization(request.user)
        try:
            request_cancellation(organization)
        except (BillingStateError, StripeConfigurationError, StripeProviderError) as exc:
            return _error_response(exc)
        organization.refresh_from_db()
        return Response(build_billing_state(organization))


class BillingResumeView(APIView):
    permission_classes = [IsAuthenticated, IsWorkspaceOwner]

    def post(self, request):
        organization = get_owned_organization(request.user)
        try:
            request_resume_subscription(organization)
        except (BillingStateError, StripeConfigurationError, StripeProviderError) as exc:
            return _error_response(exc)
        organization.refresh_from_db()
        return Response(build_billing_state(organization))


class BillingCancelDowngradeView(APIView):
    permission_classes = [IsAuthenticated, IsWorkspaceOwner]

    def post(self, request):
        organization = get_owned_organization(request.user)
        try:
            request_cancel_scheduled_downgrade(organization)
        except (BillingStateError, StripeConfigurationError, StripeProviderError) as exc:
            return _error_response(exc)
        organization.refresh_from_db()
        return Response(build_billing_state(organization))


class BillingScheduleChangeView(APIView):
    permission_classes = [IsAuthenticated, IsWorkspaceOwner]

    def post(self, request):
        organization = get_owned_organization(request.user)
        try:
            request_schedule_billing_change(
                organization,
                plan=request.data.get("plan"),
                interval=request.data.get("interval"),
            )
        except (BillingStateError, StripeConfigurationError, StripeProviderError) as exc:
            return _error_response(exc)
        organization.refresh_from_db()
        return Response(build_billing_state(organization))


class BillingPortalView(APIView):
    permission_classes = [IsAuthenticated, IsWorkspaceOwner]

    def post(self, request):
        organization = get_owned_organization(request.user)
        try:
            result = open_customer_portal(organization)
        except (BillingStateError, StripeConfigurationError, StripeProviderError) as exc:
            return _error_response(exc)
        return Response({"portal_url": result.portal_url})


class BillingInvoicesView(APIView):
    permission_classes = [IsAuthenticated, IsWorkspaceOwner]

    def get(self, request):
        organization = get_owned_organization(request.user)
        try:
            invoices = list_customer_invoices(organization)
        except (BillingStateError, StripeConfigurationError, StripeProviderError) as exc:
            return _error_response(exc)
        from billing.catalog import format_money_cents, invoice_status_label

        payload = []
        for invoice in invoices:
            created_at = invoice.created_at
            payload.append(
                {
                    "id": invoice.invoice_id,
                    "created_at": created_at.isoformat() if created_at else None,
                    "created_at_formatted": (
                        created_at.strftime("%b %d, %Y")
                        if created_at
                        else None
                    ),
                    "amount_cents": invoice.amount_cents,
                    "amount_formatted": format_money_cents(
                        invoice.amount_cents,
                        invoice.currency,
                    ),
                    "currency": invoice.currency,
                    "status": invoice.status,
                    "status_label": invoice_status_label(invoice.status),
                    "description": invoice.description,
                    "hosted_url": invoice.hosted_url,
                }
            )
        return Response({"invoices": payload})


@method_decorator(csrf_exempt, name="dispatch")
class StripeWebhookView(View):
    """Public Stripe webhook. Signature-verified. No session auth."""

    http_method_names = ["post"]

    def post(self, request):
        payload = request.body
        signature = request.META.get("HTTP_STRIPE_SIGNATURE", "")
        provider = get_billing_provider()
        try:
            event = provider.construct_webhook_event(payload, signature)
        except StripeSignatureError:
            logger.warning("Rejected Stripe webhook with invalid signature.")
            return JsonResponse({"detail": "Invalid signature."}, status=400)
        except StripeConfigurationError as exc:
            logger.error("Stripe webhook secret is not configured.")
            return JsonResponse({"detail": str(exc), "code": exc.code}, status=503)
        try:
            result = process_provider_event(event)
        except Exception:
            return JsonResponse({"detail": "Webhook processing failed."}, status=500)
        return JsonResponse({"status": result})


class AppleBillingVerifyView(APIView):
    """Verify a StoreKit 2 signed transaction and bind it to the owner workspace."""

    permission_classes = [IsAuthenticated, IsWorkspaceOwner]

    def post(self, request):
        organization = get_owned_organization(request.user)
        signed_transaction = (
            request.data.get("signed_transaction")
            or request.data.get("signedTransaction")
            or ""
        )
        signed_renewal = (
            request.data.get("signed_renewal_info")
            or request.data.get("signedRenewalInfo")
            or ""
        )
        if not str(signed_transaction).strip():
            return Response(
                {
                    "code": "apple_transaction_missing",
                    "detail": "signed_transaction is required.",
                },
                status=400,
            )
        try:
            verify_and_activate_apple_subscription(
                organization,
                signed_transaction=str(signed_transaction).strip(),
                signed_renewal_info=str(signed_renewal or "").strip(),
            )
        except AppleVerificationError as exc:
            return _error_response(exc)
        except BillingStateError as exc:
            return _error_response(exc)
        return Response(build_billing_state(organization))


@method_decorator(csrf_exempt, name="dispatch")
class AppleServerNotificationView(View):
    """App Store Server Notifications V2. JWS-verified. No session auth."""

    http_method_names = ["post"]

    def post(self, request):
        try:
            body = request.body.decode("utf-8") if request.body else ""
            import json

            data = json.loads(body) if body else {}
        except (UnicodeDecodeError, ValueError):
            return JsonResponse({"detail": "Invalid JSON body."}, status=400)
        signed_payload = ""
        if isinstance(data, dict):
            signed_payload = data.get("signedPayload") or data.get("signed_payload") or ""
        if not str(signed_payload).strip():
            return JsonResponse(
                {"detail": "signedPayload is required.", "code": "apple_notification_invalid"},
                status=400,
            )
        try:
            result = process_apple_notification_signed_payload(str(signed_payload).strip())
        except BillingStateError as exc:
            code = getattr(exc, "code", "billing_state_error")
            status = 400
            if code in {"apple_jws_invalid", "apple_root_ca_missing"}:
                status = 400
            return JsonResponse({"detail": str(exc), "code": code}, status=status)
        except Exception:
            logger.exception("Apple ASN V2 processing failed.")
            return JsonResponse({"detail": "Notification processing failed."}, status=500)
        return JsonResponse(result)