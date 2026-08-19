from rest_framework.exceptions import APIException


class AttendanceValidationError(APIException):
    """
    Domain-level validation for kiosk attendance sequencing/state.

    This is intentionally not a generic workflow engine: only the explicit
    rules implemented by this MVP slice are allowed.
    """

    status_code = 400
    default_code = "attendance_validation_error"

    def __init__(self, code, detail, *, status_code=None):
        if status_code is not None:
            self.status_code = status_code
        super().__init__({"code": code, "detail": detail})
        self.default_code = code

