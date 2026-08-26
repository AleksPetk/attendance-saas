from django.urls import path

from billing.views import (
    BillingCancelDowngradeView,
    BillingCancelView,
    BillingCatalogView,
    BillingCheckoutView,
    BillingDowngradeView,
    BillingInvoicesView,
    BillingPortalView,
    BillingResumeView,
    BillingScheduleChangeView,
    BillingTrialCheckoutView,
    BillingUpgradePreviewView,
    BillingUpgradeView,
    OwnerBillingView,
    StripeWebhookView,
)

urlpatterns = [
    path("billing/catalog/", BillingCatalogView.as_view(), name="billing-catalog"),
    path("billing/", OwnerBillingView.as_view(), name="billing-current"),
    path("billing/checkout/", BillingCheckoutView.as_view(), name="billing-checkout"),
    path(
        "billing/trial-checkout/",
        BillingTrialCheckoutView.as_view(),
        name="billing-trial-checkout",
    ),
    path(
        "billing/upgrade/preview/",
        BillingUpgradePreviewView.as_view(),
        name="billing-upgrade-preview",
    ),
    path("billing/upgrade/", BillingUpgradeView.as_view(), name="billing-upgrade"),
    path("billing/downgrade/", BillingDowngradeView.as_view(), name="billing-downgrade"),
    path(
        "billing/downgrade/cancel/",
        BillingCancelDowngradeView.as_view(),
        name="billing-downgrade-cancel",
    ),
    path(
        "billing/change/schedule/",
        BillingScheduleChangeView.as_view(),
        name="billing-change-schedule",
    ),
    path("billing/cancel/", BillingCancelView.as_view(), name="billing-cancel"),
    path("billing/resume/", BillingResumeView.as_view(), name="billing-resume"),
    path("billing/invoices/", BillingInvoicesView.as_view(), name="billing-invoices"),
    path("billing/portal/", BillingPortalView.as_view(), name="billing-portal"),
    path(
        "billing/webhooks/stripe",
        StripeWebhookView.as_view(),
        name="billing-stripe-webhook",
    ),
    path(
        "billing/webhooks/stripe/",
        StripeWebhookView.as_view(),
        name="billing-stripe-webhook-slash",
    ),
]
