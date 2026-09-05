"""Process durable Group after-action email outbox jobs.

Production: run as a dedicated container with --loop.
Tests / ops: --once processes currently due jobs and exits.
"""

from __future__ import annotations

import logging
import signal
import time

from django.core.management.base import BaseCommand
from django.utils import timezone

from groups.email_outbox import (
    DEFAULT_POLL_SECONDS,
    process_due_email_outbox,
    reclaim_stale_processing,
)
from groups.email_sender_models import GroupEmailOutboxJob, GroupEmailOutboxStatus

logger = logging.getLogger("groups.email_outbox.worker")


class Command(BaseCommand):
    help = (
        "Process Group after-action email outbox jobs. "
        "Use --loop for the production email-worker service."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--loop",
            action="store_true",
            help="Run continuously until SIGTERM/SIGINT.",
        )
        parser.add_argument(
            "--once",
            action="store_true",
            help="Process currently due jobs once and exit (default if not --loop).",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=10,
            help="Max jobs to claim per pass (default 10).",
        )
        parser.add_argument(
            "--poll-seconds",
            type=float,
            default=DEFAULT_POLL_SECONDS,
            help="Idle poll interval in loop mode (default 0.5s).",
        )

    def handle(self, *args, **options):
        loop = bool(options.get("loop"))
        limit = max(1, int(options.get("limit") or 10))
        poll_seconds = max(0.1, float(options.get("poll_seconds") or DEFAULT_POLL_SECONDS))
        stop = {"flag": False}

        def _stop(signum, _frame):
            logger.info("Email outbox worker received signal=%s; shutting down", signum)
            stop["flag"] = True

        if loop:
            signal.signal(signal.SIGTERM, _stop)
            signal.signal(signal.SIGINT, _stop)
            logger.info(
                "Email outbox worker starting loop poll_seconds=%s limit=%s",
                poll_seconds,
                limit,
            )
            while not stop["flag"]:
                reclaim_stale_processing()
                result = process_due_email_outbox(limit=limit)
                if result["claimed"]:
                    logger.info(
                        "Email outbox pass claimed=%s succeeded=%s failed=%s "
                        "retry_scheduled=%s pending=%s",
                        result["claimed"],
                        result["succeeded"],
                        result["failed"],
                        result["retry_scheduled"],
                        GroupEmailOutboxJob.objects.filter(
                            status=GroupEmailOutboxStatus.PENDING
                        ).count(),
                    )
                    # Tight loop while work exists.
                    continue
                time.sleep(poll_seconds)
            self.stdout.write(self.style.SUCCESS("Email outbox worker stopped."))
            return

        result = process_due_email_outbox(limit=limit, now=timezone.now())
        self.stdout.write(
            f"outbox claimed={result['claimed']} succeeded={result['succeeded']} "
            f"failed={result['failed']} retry_scheduled={result['retry_scheduled']}"
        )
