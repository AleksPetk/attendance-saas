"""Tests for Stripe upgrade preview amount derivation (mocked invoice lines only)."""

from django.test import SimpleTestCase

from billing.upgrade_amount import immediate_upgrade_amount_cents


def _proration_line(amount, description="proration"):
    return {
        "description": description,
        "amount": amount,
        "parent": {"subscription_item_details": {"proration": True}},
    }


def _renewal_line(amount, description="renewal"):
    return {
        "description": description,
        "amount": amount,
        "parent": {"subscription_item_details": {"proration": False}},
    }


class UpgradePreviewAmountTests(SimpleTestCase):
    def test_almost_full_period_remaining_uses_proration_not_next_renewal(self):
        """Plus $9.99 -> Business $14.99 with ~full month left."""
        period_end = 1790337589
        invoice = {
            "amount_due": 1991,
            "lines": {
                "data": [
                    _proration_line(-984, "Unused time on Plus"),
                    _proration_line(1476, "Remaining time on Business"),
                    {
                        **_renewal_line(1499, "1 × Business (at $14.99 / month)"),
                        "period": {"start": period_end, "end": period_end + 2592000},
                    },
                ]
            },
        }
        self.assertEqual(
            immediate_upgrade_amount_cents(invoice, current_period_end_ts=period_end),
            492,
        )

    def test_half_period_remaining(self):
        period_end = 1790337589
        invoice = {
            "amount_due": 1499,
            "lines": {
                "data": [
                    _proration_line(-500, "Unused time on Plus"),
                    _proration_line(750, "Remaining time on Business"),
                    {
                        **_renewal_line(1499, "1 × Business"),
                        "period": {"start": period_end, "end": period_end + 2592000},
                    },
                ]
            },
        }
        self.assertEqual(
            immediate_upgrade_amount_cents(invoice, current_period_end_ts=period_end),
            250,
        )

    def test_near_period_end_small_immediate_charge(self):
        period_end = 1790337589
        invoice = {
            "amount_due": 1500,
            "lines": {
                "data": [
                    _proration_line(-995, "Unused time on Plus"),
                    _proration_line(100, "Remaining time on Business"),
                    {
                        **_renewal_line(1499, "1 × Business"),
                        "period": {"start": period_end, "end": period_end + 2592000},
                    },
                ]
            },
        }
        self.assertEqual(
            immediate_upgrade_amount_cents(invoice, current_period_end_ts=period_end),
            -895,
        )

    def test_always_invoice_preview_uses_amount_due_including_tax(self):
        invoice = {
            "amount_due": 532,
            "lines": {
                "data": [
                    _proration_line(-984, "Unused time on Plus"),
                    _proration_line(1476, "Remaining time on Business"),
                    {
                        "description": "Tax",
                        "amount": 40,
                        "parent": {"subscription_item_details": {"proration": False}},
                    },
                ]
            },
        }
        self.assertEqual(immediate_upgrade_amount_cents(invoice), 532)

    def test_no_proration_lines_falls_back_to_amount_due(self):
        invoice = {"amount_due": 237, "lines": {"data": []}}
        self.assertEqual(immediate_upgrade_amount_cents(invoice), 237)
