from __future__ import annotations

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "migrations"

files = sorted(MIGRATIONS.glob("*.sql"))
if not files:
    raise SystemExit("No migration files found")

connection = sqlite3.connect(":memory:")
connection.execute("PRAGMA foreign_keys = ON")

try:
    for path in files:
        sql = path.read_text(encoding="utf-8")
        try:
            connection.executescript(sql)
        except sqlite3.DatabaseError as exc:
            raise SystemExit(f"Migration failed: {path.name}: {exc}") from exc

    foreign_key_issues = connection.execute("PRAGMA foreign_key_check").fetchall()
    if foreign_key_issues:
        raise SystemExit(f"Foreign-key check failed: {foreign_key_issues}")

    tables = [
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
    ]
    indexes = [
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
    ]
    if "evaluation_runs" not in tables or "market_observations" not in tables or "knowledge_evidence" not in tables:
        raise SystemExit("Required core tables are missing after migrations")

    print(f"Migration validation passed: {len(files)} migration(s), {len(tables)} table(s), {len(indexes)} explicit index(es).")
finally:
    connection.close()
