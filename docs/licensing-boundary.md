# Cylon Detector licensing boundary

Status: local draft for review. This file does not grant a license and must not be represented as a public licensing decision.

## Current facts

- This repository is a fork of Consciousness Atlas by Danilo Znamerovszkij.
- The inherited README describes Consciousness Atlas as MIT-licensed.
- The inherited repository does not currently contain a tracked license file.
- Public source visibility is not itself an open-source license grant.
- A blanket repository license must not be applied until the inherited boundary is resolved.

## Wholly original Cylon Detector surfaces

The following paths were created for the Cylon Detector and MAC Consciousness Bench work in this fork and are candidates for Apache-2.0 licensing after explicit approval:

- `api/analyze.ts` and `api/http.ts`
- `bench.html`
- `benchmarks/`
- `.github/ISSUE_TEMPLATE/challenge-proposal.yml`
- `fixtures/demo/`
- `indicators/`
- `schemas/`
- `scripts/generate-demo-artifact.ts`, `scripts/generate-schemas.ts`, `scripts/validate-benchmark-registry.ts`, `scripts/validate-build.ts`, `scripts/validate-data.ts`, and `scripts/validate-schemas.ts`
- `src/bench/` and `src/server/`
- Cylon Detector tests, specs, research notes, roadmap, reports, and voice-audit material

Files modified from the inherited Atlas, including root configuration, dependency manifests, Atlas pages, Atlas data, shared styles, and the README, remain mixed or inherited surfaces and are not covered by this candidate list.

## Resolution sequence

1. Ask the upstream author to confirm or add the intended Atlas license.
2. If upstream confirms MIT, preserve its copyright and license notices for inherited material.
3. After Kris explicitly approves Apache-2.0 for wholly original work, add a path-level licensing map and the corresponding license text.
4. If the upstream boundary remains unresolved when an open-source release is required, extract the wholly original bench into a clean repository before applying Apache-2.0.

An unsent upstream confirmation request is preserved in `docs/operations/release-handoff.md`. Sending it remains a human approval gate.

## Approval wording

> I approve Apache-2.0 for the files wholly authored as Cylon Detector and MAC Bench work in this fork, and I authorize publication of the reviewed path-level licensing map. This approval does not relicense inherited Consciousness Atlas material.
