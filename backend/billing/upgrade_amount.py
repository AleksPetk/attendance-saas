"""Derive immediate upgrade charges from Stripe invoice previews. No local proration math."""

from __future__ import annotations


def _obj_get(obj, key, default=None):
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _line_is_proration(line) -> bool:
    parent = _obj_get(line, "parent") or {}
    details = _obj_get(parent, "subscription_item_details") or {}
    return bool(_obj_get(details, "proration"))


def _line_is_future_renewal(line, current_period_end_ts: int | None) -> bool:
    if _line_is_proration(line):
        return False
    if current_period_end_ts is None:
        return False
    period = _obj_get(line, "period") or {}
    period_start = _obj_get(period, "start")
    if period_start is None:
        return False
    return int(period_start) >= int(current_period_end_ts)


def immediate_upgrade_amount_cents(invoice, *, current_period_end_ts: int | None = None) -> int:
    """Return the charge due now for an upgrade, excluding a future renewal line.

    Stripe's create_preview defaults to the *next* invoice, whose amount_due can
    include both proration lines and the next full subscription period. The
    immediate upgrade charge is the proration lines only (plus any tax Stripe
    adds to that immediate invoice when using always_invoice previews).
    """
    lines = _obj_get(_obj_get(invoice, "lines"), "data") or []
    proration_total = 0
    has_proration = False
    for line in lines:
        if _line_is_proration(line):
            has_proration = True
            proration_total += int(_obj_get(line, "amount") or 0)

    amount_due = int(_obj_get(invoice, "amount_due", 0) or 0)
    if not has_proration:
        return amount_due

    has_future_renewal_line = any(
        _line_is_future_renewal(line, current_period_end_ts) for line in lines
    )
    if has_future_renewal_line:
        return proration_total

    # always_invoice previews: amount_due matches proration (and immediate tax if any).
    return amount_due if amount_due >= proration_total else proration_total
