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
    required = {"evaluation_runs", "market_observations", "knowledge_evidence", "affiliate_networks"}
    if not required.issubset(set(tables)):
        raise SystemExit("Required core/A8 tables are missing after migrations")

    selected_network = connection.execute(
        "SELECT display_name, selection_status FROM affiliate_networks WHERE id = 'a8'"
    ).fetchone()
    if selected_network != ("A8.net", "selected"):
        raise SystemExit(f"A8 single-network selection missing: {selected_network}")

    # Exercise commercial integrity, A8 single-network constraints and offer freshness against real SQLite.
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
        "INSERT INTO commercial_programs (id, merchant, program_type, status, affiliate_network, click_ref_param) VALUES (?, ?, ?, ?, ?, ?)",
        ("program-a", "Merchant A", "affiliate", "active", "a8", "id1"),
    )
    connection.execute(
        "INSERT INTO commercial_programs (id, merchant, program_type, status, affiliate_network) VALUES (?, ?, ?, ?, ?)",
        ("program-b", "Merchant B", "affiliate", "active", "a8"),
    )
    expect_integrity_error(
        "INSERT INTO commercial_programs (id, merchant, program_type, status, affiliate_network) VALUES (?, ?, ?, ?, ?)",
        ("program-other-network", "Merchant A", "affiliate", "active", "other"),
    )
    expect_integrity_error(
        "INSERT INTO commercial_programs (id, merchant, program_type, status, affiliate_network, click_ref_param) VALUES (?, ?, ?, ?, ?, ?)",
        ("program-bad-param", "Merchant A", "affiliate", "active", "a8", "subid"),
    )
    expect_integrity_error(
        "INSERT INTO commercial_programs (id, merchant, program_type, status, affiliate_network) VALUES (?, ?, ?, ?, ?)",
        ("program-normal-a8", "Merchant A", "normal", "active", "a8"),
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
        f"{len(indexes)} explicit index(es); A8 single-network, commercial integrity and offer freshness guards verified."
    )
finally:
    connection.close()
