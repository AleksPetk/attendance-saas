"""Plan entitlement denials."""

from __future__ import annotations


class PlanEntitlementDenied(Exception):
    """Raised when a plan feature or limit blocks an operation."""

    def __init__(
        self,
        *,
        code: str,
        message: str,
        feature: str | None = None,
        limit_key: str | None = None,
        usage: int | None = None,
        limit: int | None = None,
        plan_key: str | None = None,
    ):
        self.code = code
        self.message = message
        self.feature = feature
        self.limit_key = limit_key
        self.usage = usage
        self.limit = limit
        self.plan_key = plan_key
        super().__init__(message)

    def as_api_detail(self) -> dict:
        payload = {
            "code": self.code,
            "detail": self.message,
            "plan_key": self.plan_key,
        }
        if self.feature:
            payload["feature"] = self.feature
        if self.limit_key:
            payload["limit_key"] = self.limit_key
            payload["usage"] = self.usage
            payload["limit"] = self.limit
            if self.usage is not None and self.limit is not None:
                payload["over_by"] = max(0, int(self.usage) - int(self.limit))
        return payload
