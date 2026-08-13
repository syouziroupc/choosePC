#!/usr/bin/env python3
import json
import sqlite3
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = sorted((ROOT / "migrations").glob("*.sql"))
CPU_DIR = ROOT / "knowledge" / "hardware" / "cpu"
GPU_DIR = ROOT / "knowledge" / "hardware" / "gpu"
SOURCE_DIR = ROOT / "knowledge" / "sources"
GENERATOR = ROOT / "scripts" / "build_knowledge_seed.mjs"
KNOWLEDGE_VERSION = json.loads((ROOT / "knowledge" / "version.json").read_text(encoding="utf-8"))["version"]

STABLE_CPU_IDS = {
    "Intel Core i5-8365U": "intel-i5-8365u",
    "Intel Core i5-1135G7": "intel-i5-1135g7",
    "Intel Core i5-1235U": "intel-i5-1235u",
    "AMD Ryzen 5 5600U": "amd-r5-5600u",
    "AMD Ryzen 5 5600H": "amd-r5-5600h",
    "Intel Core i5-12400F": "intel-i5-12400f",
    "AMD Ryzen 5 7600": "amd-r5-7600",
    "AMD Ryzen 7 7800X3D": "amd-r7-7800x3d",
}
STABLE_GPU_IDS = {
    "Intel UHD Graphics 620": "intel-uhd-620",
    "Intel Iris Xe Graphics": "intel-iris-xe",
    "GeForce GTX 1650 Laptop": "nvidia-gtx1650-laptop",
    "GeForce RTX 3050 Laptop": "nvidia-rtx3050-laptop",
    "GeForce RTX 3060 Laptop": "nvidia-rtx3060-laptop",
    "GeForce RTX 4060 Laptop": "nvidia-rtx4060-laptop",
    "GeForce RTX 5060 Laptop": "nvidia-rtx5060-laptop",
    "GeForce RTX 3060": "nvidia-rtx3060-desktop",
    "GeForce RTX 4060": "nvidia-rtx4060-desktop",
}


def load_catalog(directory: Path) -> list[dict]:
    entries: list[dict] = []
    for path in sorted(directory.glob("*.json")):
        if path.name == "catalog.json":
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, list):
            raise RuntimeError(f"hardware file must contain an array: {path}")
        entries.extend(payload)
    return entries


def count_sources() -> int:
    count = 0
    for path in sorted(SOURCE_DIR.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, list):
            raise RuntimeError(f"source file must contain an array: {path}")
        count += len(payload)
    return count


def assert_stable_ids(con: sqlite3.Connection) -> None:
    for name, expected_id in STABLE_CPU_IDS.items():
        row = con.execute("SELECT id FROM hardware_cpu WHERE canonical_name = ?", (name,)).fetchone()
        if row is None or row[0] != expected_id:
            raise RuntimeError(f"stable CPU id changed for {name}: {row} != {expected_id}")
    for name, expected_id in STABLE_GPU_IDS.items():
        row = con.execute("SELECT id FROM hardware_gpu WHERE canonical_name = ?", (name,)).fetchone()
        if row is None or row[0] != expected_id:
            raise RuntimeError(f"stable GPU id changed for {name}: {row} != {expected_id}")


def main() -> None:
    cpus = load_catalog(CPU_DIR)
    gpus = load_catalog(GPU_DIR)
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
            evidence_count = con.execute("SELECT COUNT(*) FROM knowledge_evidence WHERE knowledge_type IN ('cpu','gpu')").fetchone()[0]
            version_count = con.execute(
                "SELECT COUNT(*) FROM knowledge_versions WHERE version = ?",
                (KNOWLEDGE_VERSION,),
            ).fetchone()[0]

            assert cpu_count == len(cpus), (cpu_count, len(cpus))
            assert gpu_count == len(gpus), (gpu_count, len(gpus))
            assert source_count == expected_sources, (source_count, expected_sources)
            assert evidence_count >= len(cpus) + len(gpus), evidence_count
            assert version_count == 1, version_count
            assert_stable_ids(con)

            missing_versions = con.execute(
                """
                SELECT 'cpu', id FROM hardware_cpu WHERE knowledge_version <> ?
                UNION ALL
                SELECT 'gpu', id FROM hardware_gpu WHERE knowledge_version <> ?
                """,
                (KNOWLEDGE_VERSION, KNOWLEDGE_VERSION),
            ).fetchall()
            if missing_versions:
                raise RuntimeError(f"rows with unexpected knowledge version: {missing_versions}")

            missing_cpu_evidence = con.execute(
                """
                SELECT c.id FROM hardware_cpu c
                LEFT JOIN knowledge_evidence e ON e.knowledge_type = 'cpu' AND e.knowledge_id = c.id
                WHERE e.knowledge_id IS NULL
                """
            ).fetchall()
            missing_gpu_evidence = con.execute(
                """
                SELECT g.id FROM hardware_gpu g
                LEFT JOIN knowledge_evidence e ON e.knowledge_type = 'gpu' AND e.knowledge_id = g.id
                WHERE e.knowledge_id IS NULL
                """
            ).fetchall()
            if missing_cpu_evidence or missing_gpu_evidence:
                raise RuntimeError(f"hardware rows without source evidence: cpu={missing_cpu_evidence}, gpu={missing_gpu_evidence}")

            con.executescript(seed_path.read_text(encoding="utf-8"))
            assert con.execute("SELECT COUNT(*) FROM hardware_cpu").fetchone()[0] == len(cpus)
            assert con.execute("SELECT COUNT(*) FROM hardware_gpu").fetchone()[0] == len(gpus)
            assert_stable_ids(con)
            assert not con.execute("PRAGMA foreign_key_check").fetchall()
        finally:
            con.close()

    print(
        f"Knowledge seed valid: {len(cpus)} CPUs, {len(gpus)} GPUs, "
        f"{expected_sources} source documents; stable IDs/evidence/foreign keys clean and rerun-safe."
    )


if __name__ == "__main__":
    main()
