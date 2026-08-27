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
from billing.exceptions import (
    BillingStateError,
    StripeConfigurationError,
    StripeProviderError,
    StripeSignatureError,
)
from billing.operations import (
    apply_upgrade_to_business,
    list_customer_invoices,
    open_customer_portal,
    preview_upgrade_to_business,
    request_cancel_scheduled_downgrade,
    request_cancellation,
    request_downgrade_to_plus,
    request_resume_subscription,
    request_schedule_billing_change,
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
    """Public V1 prices. No Stripe secrets or Price IDs."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        payload = catalog_public_payload()
        from billing.builtin_trial import BUILTIN_TRIAL_DAYS

        payload["builtin_trial_days"] = BUILTIN_TRIAL_DAYS
        payload["builtin_trial_offered"] = True
        payload["stripe_configured"] = stripe_api_configured()
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
        return Response(
            {"checkout_url": result.checkout_url, "session_id": result.session_id}
        )


class BillingUpgradePreviewView(APIView):
    permission_classes = [IsAuthenticated, IsWorkspaceOwner]

    def post(self, request):
        organization = get_owned_organization(request.user)
        try:
            preview = preview_upgrade_to_business(organization)
        except (BillingStateError, StripeConfigurationError, StripeProviderError) as exc:
            return _error_response(exc)
        from billing.catalog import format_usd_cents

        return Response(
            {
                "amount_due_cents": preview.amount_due_cents,
                "amount_due_formatted": format_usd_cents(preview.amount_due_cents),
                "currency": preview.currency,
                "recurring_cents": preview.recurring_cents,
                "recurring_formatted": format_usd_cents(preview.recurring_cents),
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
