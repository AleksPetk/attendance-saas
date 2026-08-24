from django.urls import path

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
]
