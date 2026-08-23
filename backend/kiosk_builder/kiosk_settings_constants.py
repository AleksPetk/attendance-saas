"""Canonical kiosk behavioral setting identifiers."""

from django.db import models


class KioskType(models.TextChoices):
    CARD = "card", "Card"
    INPUT = "input", "Input"


class KioskInputSecondField(models.TextChoices):
    NAME = "name", "Name"
    EMAIL = "email", "Email"
    PIN = "pin", "PIN"


class KioskConfirmationTemplate(models.TextChoices):
    CLEAN = "clean", "Clean"
    BUSINESS = "business", "Business"
    FRIENDLY = "friendly", "Friendly"
    KIDS = "kids", "Kids"
    FITNESS = "fitness", "Fitness"
    EVENT = "event", "Event"
    CELEBRATION = "celebration", "Celebration"
    MINIMAL = "minimal", "Minimal"


CONFIRMATION_RETURN_SECONDS_CHOICES = (1, 3, 5)
CONFIRMATION_RETURN_SECONDS_DEFAULT = 3
CONFIRMATION_MESSAGE_MAX_LENGTH = 500

DEFAULT_CONFIRMATION_MESSAGES = {
    "check_in": "Thank you, {name}. You checked in at {time}.",
    "check_out": "Goodbye, {name}. You checked out at {time}.",
    "break_start": "Break started at {time}.",
    "break_end": "Welcome back, {name}. Your break ended at {time}.",
}

ACTION_TYPE_TO_CONFIRMATION_FIELD = {
    "check_in": "confirmation_check_in_message",
    "check_out": "confirmation_check_out_message",
    "break_start": "confirmation_break_start_message",
    "break_end": "confirmation_break_end_message",
}


class AttendanceResetMode(models.TextChoices):
    DAILY = "daily", "Daily"
    ROLLING = "rolling", "Rolling"


ATTENDANCE_RESET_MODE_DEFAULT = AttendanceResetMode.DAILY
ATTENDANCE_RESET_DAILY_TIME_DEFAULT = "00:00:00"
ATTENDANCE_RESET_ROLLING_HOURS_DEFAULT = 8
ATTENDANCE_RESET_ROLLING_MINUTES_DEFAULT = 0

# Rolling custom duration bounds (minimum 1 minute, maximum 7 days).
ATTENDANCE_RESET_ROLLING_MIN_MINUTES = 1
ATTENDANCE_RESET_ROLLING_MAX_MINUTES = 7 * 24 * 60
