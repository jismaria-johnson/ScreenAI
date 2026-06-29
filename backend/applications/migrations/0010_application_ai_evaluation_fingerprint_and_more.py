from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("applications", "0009_auto_20260621_2246"),
    ]

    operations = [
        migrations.AddField(
            model_name="application",
            name="ai_evaluation_fingerprint",
            field=models.CharField(blank=True, db_index=True, max_length=64),
        ),
        migrations.AddField(
            model_name="application",
            name="ai_evaluator_version",
            field=models.CharField(blank=True, max_length=50),
        ),
    ]
