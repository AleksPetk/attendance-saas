from django.urls import path

from accounts.apple_oauth_views import AppleOAuthCallbackView, AppleOAuthStartView
from accounts.google_oauth_views import GoogleOAuthCallbackView, GoogleOAuthStartView
from accounts.owner_sign_in_method_views import (
    AppleUnlinkView,
    GoogleUnlinkView,
    SetPasswordView,
)
from accounts.views import (
    AccountView,
    BackupEmailCancelView,
    BackupEmailRemoveView,
    BackupEmailResendView,
    BackupEmailView,
    ChangePasswordView,
    DeleteAccountView,
    ForgotPasswordView,
    PrimaryEmailCancelView,
    PrimaryEmailChangeView,
    PrimaryEmailResendView,
    ResendVerificationView,
    ResetPasswordView,
    VerifyBackupEmailView,
    VerifyEmailView,
    VerifyPrimaryEmailView,
)
from accounts.owner_two_factor_views import (
    OwnerTOTPDisableView,
    OwnerTOTPLoginChallengeView,
    OwnerTOTPRecoveryCodesRegenerateView,
    OwnerTOTPSetupStartView,
    OwnerTOTPSetupVerifyView,
)

urlpatterns = [
    path("auth/verify-email/", VerifyEmailView.as_view(), name="verify-email"),
    path(
        "auth/verify-backup-email/",
        VerifyBackupEmailView.as_view(),
        name="verify-backup-email",
    ),
    path(
        "auth/verify-primary-email/",
        VerifyPrimaryEmailView.as_view(),
        name="verify-primary-email",
    ),
    path(
        "auth/resend-verification/",
        ResendVerificationView.as_view(),
        name="resend-verification",
    ),
    path("auth/forgot-password/", ForgotPasswordView.as_view(), name="forgot-password"),
    path("auth/reset-password/", ResetPasswordView.as_view(), name="reset-password"),
    path("auth/change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("auth/set-password/", SetPasswordView.as_view(), name="set-password"),
    path("auth/google/unlink/", GoogleUnlinkView.as_view(), name="google-unlink"),
    path("auth/apple/unlink/", AppleUnlinkView.as_view(), name="apple-unlink"),
    path("auth/account/", AccountView.as_view(), name="account"),
    path("auth/account/delete/", DeleteAccountView.as_view(), name="delete-account"),
    path(
        "auth/account/backup-email/",
        BackupEmailView.as_view(),
        name="account-backup-email",
    ),
    path(
        "auth/account/backup-email/remove/",
        BackupEmailRemoveView.as_view(),
        name="account-backup-email-remove",
    ),
    path(
        "auth/account/backup-email/resend/",
        BackupEmailResendView.as_view(),
        name="account-backup-email-resend",
    ),
    path(
        "auth/account/backup-email/cancel/",
        BackupEmailCancelView.as_view(),
        name="account-backup-email-cancel",
    ),
    path(
        "auth/account/primary-email/",
        PrimaryEmailChangeView.as_view(),
        name="account-primary-email",
    ),
    path(
        "auth/account/primary-email/resend/",
        PrimaryEmailResendView.as_view(),
        name="account-primary-email-resend",
    ),
    path(
        "auth/account/primary-email/cancel/",
        PrimaryEmailCancelView.as_view(),
        name="account-primary-email-cancel",
    ),
    path(
        "auth/owner-2fa/setup/",
        OwnerTOTPSetupStartView.as_view(),
        name="owner-2fa-setup",
    ),
    path(
        "auth/owner-2fa/setup/verify/",
        OwnerTOTPSetupVerifyView.as_view(),
        name="owner-2fa-setup-verify",
    ),
    path(
        "auth/owner-2fa/challenge/",
        OwnerTOTPLoginChallengeView.as_view(),
        name="owner-2fa-challenge",
    ),
    path(
        "auth/owner-2fa/recovery-codes/regenerate/",
        OwnerTOTPRecoveryCodesRegenerateView.as_view(),
        name="owner-2fa-regen-recovery-codes",
    ),
    path(
        "auth/owner-2fa/disable/",
        OwnerTOTPDisableView.as_view(),
        name="owner-2fa-disable",
    ),
    path("auth/google/start/", GoogleOAuthStartView.as_view(), name="google-oauth-start"),
    path(
        "auth/google/callback/",
        GoogleOAuthCallbackView.as_view(),
        name="google-oauth-callback",
    ),
    path("auth/apple/start/", AppleOAuthStartView.as_view(), name="apple-oauth-start"),
    path(
        "auth/apple/callback/",
        AppleOAuthCallbackView.as_view(),
        name="apple-oauth-callback",
    ),
]
