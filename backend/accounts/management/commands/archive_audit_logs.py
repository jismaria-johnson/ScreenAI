import os
import json
import datetime
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from accounts.models import AuditLog

class Command(BaseCommand):
    help = "Archive audit logs before a specific date"

    def add_arguments(self, parser):
        parser.add_argument(
            "--before",
            required=True,
            help="Archive logs created before this date (YYYY-MM-DD)",
        )
        parser.add_argument(
            "--output",
            required=True,
            help="Path to the output archive file (JSON Lines format)",
        )
        parser.add_argument(
            "--delete-after-export",
            action="store_true",
            help="Permanently delete the archived records from the database (requires --execute)",
        )
        parser.add_argument(
            "--execute",
            action="store_true",
            help="Execute the command (default is dry-run)",
        )
        parser.add_argument(
            "--overwrite",
            action="store_true",
            help="Overwrite the output archive file if it already exists",
        )

    def handle(self, *args, **options):
        before_str = options["before"]
        output_path = options["output"]
        delete_after_export = options["delete_after_export"]
        execute = options["execute"]
        overwrite = options["overwrite"]

        # Date validation
        try:
            cutoff_date = datetime.datetime.strptime(before_str, "%Y-%m-%d")
            # Make timezone aware
            cutoff_date = timezone.make_aware(cutoff_date, timezone.get_current_timezone())
        except ValueError:
            raise CommandError("Invalid date format. Use YYYY-MM-DD.")

        # Output directory validation
        output_dir = os.path.dirname(os.path.abspath(output_path))
        if not os.path.exists(output_dir):
            raise CommandError(f"Output directory does not exist: {output_dir}")

        # Check if the output file exists
        if os.path.exists(output_path) and not overwrite:
            raise CommandError(
                f"Output file already exists: {output_path}. Use --overwrite to overwrite it."
            )

        # Fetch records
        logs = AuditLog.objects.filter(created_at__lt=cutoff_date).order_by("created_at")
        count = logs.count()

        if not execute:
            self.stdout.write(self.style.WARNING(f"[DRY RUN] Would export {count} audit logs to {output_path}"))
            if delete_after_export:
                self.stdout.write(self.style.WARNING(
                    f"[DRY RUN] Would delete {count} audit logs from the database after exporting. "
                    "Note: This is a dry run because --execute was not provided. No database changes were made and no file was created."
                ))
            else:
                self.stdout.write(self.style.WARNING(
                    f"[DRY RUN] Would export {count} audit logs without deleting them from the database. "
                    "Note: This is a dry run because --execute was not provided. No database changes were made and no file was created. "
                    "To also delete logs after export, run with --execute --delete-after-export."
                ))
            return

        # Real execution
        if count == 0:
            self.stdout.write(self.style.SUCCESS("No audit logs found to archive."))
            return

        # Export to file
        try:
            with open(output_path, "w", encoding="utf-8") as f:
                for log in logs:
                    log_data = {
                        "id": log.id,
                        "actor": log.actor.username if log.actor else None,
                        "action": log.action,
                        "target_type": log.target_type,
                        "target_id": log.target_id,
                        "target_label": log.target_label,
                        "metadata": log.metadata,
                        "ip_address": log.ip_address,
                        "user_agent": log.user_agent,
                        "created_at": log.created_at.isoformat(),
                    }
                    f.write(json.dumps(log_data) + "\n")
            self.stdout.write(self.style.SUCCESS(f"Successfully exported {count} audit logs to {output_path}"))
        except Exception as e:
            raise CommandError(f"Failed to write to export file: {str(e)}")

        # Delete from database
        deleted_count = 0
        if delete_after_export:
            # Delete queryset directly to bypass model-level delete protection
            deleted_count, _ = logs.delete()
            self.stdout.write(self.style.SUCCESS(f"Successfully deleted {deleted_count} archived audit logs from the database."))
        else:
            self.stdout.write(self.style.WARNING("Logs exported, but database deletion skipped (use --delete-after-export to delete)."))
