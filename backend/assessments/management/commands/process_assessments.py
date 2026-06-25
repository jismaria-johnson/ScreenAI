import logging
import time
from django.core.management.base import BaseCommand
from django.conf import settings
from django.db import connection
from django.utils import timezone
from assessments.services import (
    recover_stale_evaluating_assessments,
    claim_next_assessments_for_worker,
    evaluate_candidate_assessment
)

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Database-backed polling worker command to grade submitted assessments."

    def add_arguments(self, parser):
        parser.add_argument(
            "--batch-size",
            type=int,
            default=5,
            help="Number of assessments to process in a single batch."
        )
        parser.add_argument(
            "--once",
            action="store_true",
            help="Run once and exit instead of running in a loop."
        )
        parser.add_argument(
            "--poll-interval",
            type=int,
            default=None,
            help="Wait time in seconds between polls (defaults to EVALUATOR_POLL_INTERVAL_SECONDS setting)."
        )

    def handle(self, *args, **options):
        batch_size = options["batch_size"]
        once = options["once"]
        poll_interval = options["poll_interval"]
        
        if poll_interval is None:
            poll_interval = getattr(settings, "EVALUATOR_POLL_INTERVAL_SECONDS", 10)
            
        stale_timeout = getattr(settings, "EVALUATOR_STALE_TIMEOUT_SECONDS", 300)

        self.stdout.write(self.style.SUCCESS(f"Starting assessment evaluation worker. DB Vendor: {connection.vendor}"))
        
        if connection.vendor != "postgresql" and batch_size > 1:
            self.stdout.write(
                self.style.WARNING(
                    "Warning: Multiple concurrent evaluation tasks on SQLite are not parallelized and may serialize execution."
                )
            )

        try:
            while True:
                # 1. Recover stale tasks
                try:
                    recovered = recover_stale_evaluating_assessments(stale_timeout)
                    if recovered > 0:
                        self.stdout.write(
                            self.style.SUCCESS(f"Recovered {recovered} stale assessments.")
                        )
                except Exception as e:
                    self.stderr.write(
                        self.style.ERROR(f"Error during stale assessment recovery: {e}")
                    )

                # 2. Claim next batch
                try:
                    claimed = claim_next_assessments_for_worker(batch_size)
                except Exception as e:
                    self.stderr.write(
                        self.style.ERROR(f"Error during claiming assessments: {e}")
                    )
                    claimed = []

                # 3. Evaluate claimed
                if claimed:
                    self.stdout.write(
                        self.style.SUCCESS(f"Claimed {len(claimed)} assessments for evaluation.")
                    )
                    for assessment in claimed:
                        try:
                            self.stdout.write(
                                f"Starting evaluation for assessment {assessment.id} (Attempt {assessment.attempt_number})..."
                            )
                            evaluate_candidate_assessment(assessment)
                            # Fetch updated status
                            assessment.refresh_from_db()
                            self.stdout.write(
                                self.style.SUCCESS(
                                    f"Finished evaluation for assessment {assessment.id}. Status: {assessment.status}"
                                )
                            )
                        except Exception as e:
                            self.stderr.write(
                                self.style.ERROR(
                                    f"Critical error evaluating assessment {assessment.id}: {e}"
                                )
                            )
                
                if once:
                    self.stdout.write(self.style.SUCCESS("Run once complete. Exiting."))
                    break
                    
                time.sleep(poll_interval)
        except KeyboardInterrupt:
            self.stdout.write(self.style.WARNING("Worker stopped by user (KeyboardInterrupt)."))
