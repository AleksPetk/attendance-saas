from rest_framework.exceptions import APIException


class EmailNotVerified(APIException):
    status_code = 403

    def __init__(self):
        super().__init__(
            detail={
                "detail": "Please verify your email before continuing.",
                "code": "email_not_verified",
            }
        )


class EmailCooldown(APIException):
    status_code = 429

    def __init__(self, retry_after):
        super().__init__(
            detail={
                "detail": "Please wait before requesting another email.",
                "code": "email_cooldown",
                "retry_after": retry_after,
            }
        )
