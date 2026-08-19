from django.urls import path

from accounts.views import (
    AccountView,
    ChangePasswordView,
    DeleteAccountView,
    ForgotPasswordView,
    ResendVerificationView,
    ResetPasswordView,
    VerifyEmailView,
)

urlpatterns = [
    path("auth/verify-email/", VerifyEmailView.as_view(), name="verify-email"),
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
]
