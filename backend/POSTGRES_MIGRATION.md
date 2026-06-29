# SQLite to PostgreSQL Migration

The application continues to use `db.sqlite3` when `DATABASE_URL` is empty. Do not
delete or rename that file during migration.

## 1. Freeze writes and back up

Stop the Django web server and assessment worker before creating the final export.
Back up all three data sources:

- `db.sqlite3`
- the portable JSON fixture
- `media/` and `private_assessments/`

Generate the portable fixture while SQLite is still active:

```powershell
python manage.py dumpdata --natural-foreign --natural-primary `
  --exclude contenttypes --exclude auth.permission --indent 2 `
  --output screenai-data.json
```

## 2. Create an empty PostgreSQL database

Create a PostgreSQL database and user, then install the production dependencies:

```powershell
pip install -r requirements.txt
```

Set the connection URL in `.env`:

```text
DATABASE_URL=postgresql://screenai:strong-password@database-host:5432/screenai
DATABASE_CONN_MAX_AGE=60
```

For hosted PostgreSQL, add provider-required options such as `?sslmode=require`.

## 3. Create the schema and import

```powershell
python manage.py migrate
python manage.py import_database_snapshot screenai-data.json
```

The import command aborts when fixture-backed tables are not empty. After loading,
it resets PostgreSQL sequences and verifies the record count for every exported
model inside one transaction.

Restore `media/` and `private_assessments/` to the paths configured for production.

## 4. Verify before cutover

Run the application against PostgreSQL and check:

- HR and admin login
- jobs and candidate counts
- resumes and private assessment files
- assessment templates, assignments, answers, and results
- audit history
- creation of a new job and application
- code evaluation worker claiming a queued assessment

Keep the SQLite and file backups until PostgreSQL has been verified and backed up.

## Rollback

Stop the application, remove `DATABASE_URL` from `.env`, restore the backed-up
`db.sqlite3` and file directories, and restart the application. Because the
SQLite source is never modified by the PostgreSQL import, rollback does not require
a reverse conversion.
