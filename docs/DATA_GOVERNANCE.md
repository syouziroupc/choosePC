# Data Governance

PC ASSIST distinguishes factual source data from internal judgement indices.

## Evidence classes

1. Manufacturer specifications: identity, release information, VRAM, supported power ranges, memory limits and interfaces.
2. Official software/game requirements.
3. Licensed benchmark datasets when commercial storage/reuse rights permit it.
4. Reproducible in-house measurements.
5. Curated internal relative indices, clearly marked `provisional`.

## Rules

- Do not bulk-copy proprietary benchmark databases without an appropriate license.
- Internal capability indices are not presented as external benchmark scores.
- Verified knowledge must carry source evidence.
- Unknown CPU/GPU identity is not guessed.
- Provisional entries carry lower confidence and cannot create an unconditional strong recommendation.
- Laptop GPU power range is part of gaming-laptop evidence. Missing TGP is disclosed.
- Market prices are timestamped observations, not timeless facts.
- Commercial commission fields never enter evaluation or ranking.

## Repository ownership

Human/admin-agent editable knowledge lives under `knowledge/`. Runtime database copies are derived deployment/search material, not an excuse to bypass Git history and review.

## Change workflow

Knowledge change -> source/evidence update -> validation -> regression tests -> PR -> merge -> runtime synchronization.
