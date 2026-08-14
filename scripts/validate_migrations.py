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


def expect_integrity_error(sql: str, args: tuple[object, ...]) -> None:
    try:
        connection.execute(sql, args)
    except sqlite3.IntegrityError:
        return
    raise SystemExit(f"Expected integrity error was not raised: {sql}")


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

    # Exercise the commercial-integrity and offer-freshness constraints against real SQLite rather than only parsing DDL.
    connection.execute(
        "INSERT INTO merchant_offers (id, merchant, title, price_jpy, product_url, normalized_pc_json, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("offer-a", "Merchant A", "A", 10000, "https://example.com/a", "{}", "2026-08-13T00:00:00Z"),
    )
    connection.execute(
        "INSERT INTO merchant_offers (id, merchant, title, price_jpy, product_url, normalized_pc_json, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("offer-b", "Merchant B", "B", 12000, "https://example.com/b", "{}", "2026-08-13T00:00:00Z"),
    )
    capped = connection.execute(
        "SELECT datetime(expires_at), datetime(observed_at, '+30 days') FROM merchant_offers WHERE id = ?",
        ("offer-a",),
    ).fetchone()
    if not capped or capped[0] != capped[1]:
        raise SystemExit(f"Missing default 30-day offer expiry: {capped}")

    connection.execute(
        "INSERT INTO merchant_offers (id, merchant, title, price_jpy, product_url, normalized_pc_json, observed_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ("offer-long", "Merchant A", "Long", 10000, "https://example.com/long", "{}", "2026-08-13T00:00:00Z", "2026-11-13T00:00:00Z"),
    )
    long_expiry = connection.execute(
        "SELECT datetime(expires_at), datetime(observed_at, '+30 days') FROM merchant_offers WHERE id = ?",
        ("offer-long",),
    ).fetchone()
    if not long_expiry or long_expiry[0] != long_expiry[1]:
        raise SystemExit(f"Offer expiry cap failed: {long_expiry}")

    expect_integrity_error(
        "INSERT INTO merchant_offers (id, merchant, title, price_jpy, product_url, normalized_pc_json, observed_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ("offer-early", "Merchant A", "Early", 10000, "https://example.com/early", "{}", "2026-08-13T00:00:00Z", "2026-08-12T00:00:00Z"),
    )

    connection.execute(
        "INSERT INTO commercial_programs (id, merchant, program_type, status) VALUES (?, ?, ?, ?)",
        ("program-a", "Merchant A", "affiliate", "active"),
    )
    connection.execute(
        "INSERT INTO commercial_programs (id, merchant, program_type, status) VALUES (?, ?, ?, ?)",
        ("program-b", "Merchant B", "affiliate", "active"),
    )
    connection.execute(
        "INSERT INTO attribution_links (id, offer_id, program_id, destination_url) VALUES (?, ?, ?, ?)",
        ("attr-valid", "offer-a", "program-a", "https://example.com/out"),
    )
    expect_integrity_error(
        "INSERT INTO attribution_links (id, offer_id, program_id, destination_url) VALUES (?, ?, ?, ?)",
        ("attr-mismatch", "offer-a", "program-b", "https://example.com/bad"),
    )
    expect_integrity_error(
        "INSERT INTO attribution_links (id, offer_id, program_id, destination_url) VALUES (?, ?, ?, ?)",
        ("attr-duplicate-pair", "offer-a", "program-a", "https://example.com/duplicate"),
    )
    expect_integrity_error(
        "UPDATE attribution_links SET program_id = ? WHERE id = ?",
        ("program-b", "attr-valid"),
    )
    connection.execute("DELETE FROM merchant_offers WHERE id = ?", ("offer-a",))
    remaining = connection.execute("SELECT COUNT(*) FROM attribution_links WHERE offer_id = ?", ("offer-a",)).fetchone()[0]
    if remaining != 0:
        raise SystemExit("Attribution cleanup trigger failed")

    foreign_key_issues = connection.execute("PRAGMA foreign_key_check").fetchall()
    if foreign_key_issues:
        raise SystemExit(f"Foreign-key check failed after integrity tests: {foreign_key_issues}")

    print(
        f"Migration validation passed: {len(files)} migration(s), {len(tables)} table(s), "
        f"{len(indexes)} explicit index(es); commercial integrity and offer freshness triggers verified."
    )
finally:
    connection.close()
