import json
from collections import Counter
from pathlib import Path

from django.apps import apps
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.core.management.color import no_style
from django.db import connection, transaction


class Command(BaseCommand):
    help = "Import a portable SQLite snapshot into an empty PostgreSQL database."

    def add_arguments(self, parser):
        parser.add_argument("fixture", help="Path to the JSON fixture produced from SQLite.")

    def handle(self, *args, **options):
        if connection.vendor != "postgresql":
            raise CommandError("This command only imports into PostgreSQL.")

        fixture_path = Path(options["fixture"]).expanduser().resolve()
        if not fixture_path.is_file():
            raise CommandError(f"Fixture not found: {fixture_path}")

        try:
            fixture_objects = json.loads(fixture_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise CommandError(f"Could not read fixture: {error}") from error

        expected_counts = Counter(item["model"] for item in fixture_objects)
        model_map = {}
        nonempty_models = []

        for model_label, expected_count in expected_counts.items():
            try:
                model = apps.get_model(model_label)
            except LookupError as error:
                raise CommandError(f"Unknown fixture model: {model_label}") from error

            model_map[model_label] = model
            current_count = model._default_manager.count()
            if current_count:
                nonempty_models.append(f"{model_label} ({current_count})")

            if expected_count < 1:
                raise CommandError(f"Invalid expected count for {model_label}.")

        if nonempty_models:
            raise CommandError(
                "Target PostgreSQL database is not empty: " + ", ".join(nonempty_models)
            )

        with transaction.atomic():
            call_command("loaddata", str(fixture_path), verbosity=options["verbosity"])

            sequence_sql = connection.ops.sequence_reset_sql(
                no_style(),
                apps.get_models(include_auto_created=False),
            )
            with connection.cursor() as cursor:
                for statement in sequence_sql:
                    cursor.execute(statement)

            mismatches = []
            for model_label, expected_count in expected_counts.items():
                actual_count = model_map[model_label]._default_manager.count()
                if actual_count != expected_count:
                    mismatches.append(
                        f"{model_label}: expected {expected_count}, found {actual_count}"
                    )

            if mismatches:
                raise CommandError("Record verification failed: " + "; ".join(mismatches))

        self.stdout.write(
            self.style.SUCCESS(
                f"Imported and verified {len(fixture_objects)} records across "
                f"{len(expected_counts)} models."
            )
        )
