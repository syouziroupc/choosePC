#!/usr/bin/env python3
import json
import sqlite3
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = sorted((ROOT / "migrations").glob("*.sql"))
CPU_CATALOG = ROOT / "knowledge" / "hardware" / "cpu" / "catalog.json"
GPU_CATALOG = ROOT / "knowledge" / "hardware" / "gpu" / "catalog.json"
SOURCE_DIR = ROOT / "knowledge" / "sources"
GENERATOR = ROOT / "scripts" / "build_knowledge_seed.mjs"


def count_sources() -> int:
    count = 0
    for path in sorted(SOURCE_DIR.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, list):
            raise RuntimeError(f"source file must contain an array: {path}")
        count += len(payload)
    return count


def main() -> None:
    cpus = json.loads(CPU_CATALOG.read_text(encoding="utf-8"))
    gpus = json.loads(GPU_CATALOG.read_text(encoding="utf-8"))
    expected_sources = count_sources()

    with tempfile.TemporaryDirectory() as tmp:
        seed_path = Path(tmp) / "knowledge-seed.sql"
        subprocess.run(
            ["node", str(GENERATOR), "--git-sha", "ci-validation", "--output", str(seed_path)],
            cwd=ROOT,
            check=True,
        )

        con = sqlite3.connect(":memory:")
        try:
            con.execute("PRAGMA foreign_keys = ON")
            for migration in MIGRATIONS:
                con.executescript(migration.read_text(encoding="utf-8"))
            con.executescript(seed_path.read_text(encoding="utf-8"))

            foreign_key_errors = con.execute("PRAGMA foreign_key_check").fetchall()
            if foreign_key_errors:
                raise RuntimeError(f"foreign key errors after seed: {foreign_key_errors}")

            cpu_count = con.execute("SELECT COUNT(*) FROM hardware_cpu").fetchone()[0]
            gpu_count = con.execute("SELECT COUNT(*) FROM hardware_gpu").fetchone()[0]
            source_count = con.execute("SELECT COUNT(*) FROM source_documents").fetchone()[0]
            version_count = con.execute(
                "SELECT COUNT(*) FROM knowledge_versions WHERE version = ?",
                ("knowledge-2026-08-13.1",),
            ).fetchone()[0]

            assert cpu_count == len(cpus), (cpu_count, len(cpus))
            assert gpu_count == len(gpus), (gpu_count, len(gpus))
            assert source_count == expected_sources, (source_count, expected_sources)
            assert version_count == 1, version_count

            missing_versions = con.execute(
                """
                SELECT 'cpu', id FROM hardware_cpu WHERE knowledge_version <> ?
                UNION ALL
                SELECT 'gpu', id FROM hardware_gpu WHERE knowledge_version <> ?
                """,
                ("knowledge-2026-08-13.1", "knowledge-2026-08-13.1"),
            ).fetchall()
            if missing_versions:
                raise RuntimeError(f"rows with unexpected knowledge version: {missing_versions}")

            # The seed must be idempotent because deploy/refresh jobs may safely rerun it.
            con.executescript(seed_path.read_text(encoding="utf-8"))
            assert con.execute("SELECT COUNT(*) FROM hardware_cpu").fetchone()[0] == len(cpus)
            assert con.execute("SELECT COUNT(*) FROM hardware_gpu").fetchone()[0] == len(gpus)
            assert not con.execute("PRAGMA foreign_key_check").fetchall()
        finally:
            con.close()

    print(
        f"Knowledge seed valid: {len(cpus)} CPUs, {len(gpus)} GPUs, "
        f"{expected_sources} source documents; foreign keys clean and rerun-safe."
    )


if __name__ == "__main__":
    main()
