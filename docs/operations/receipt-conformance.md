# Canonical receipt conformance

The receipt conformance kit checks that one canonical receipt reproduces the same static evidence outputs byte for byte. It verifies the receipt before generating reports, resolves its benchmark snapshot against the repository's canonical benchmark registry, checks every referenced citation, Claim Ledger coordinate, and categorical verdict event, and then publishes one normalized v2 receipt plus seven report and manifest files.

The integrity digest detects changed receipt bytes. It does **not** authenticate a reviewer, establish who controlled an alias, or prove that a review event happened at the stated time. Identity signatures and key custody remain out of scope.

## Run the kit

Use Node 22 and choose a new output path. The destination must not already exist:

```sh
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run verify:receipt -- \
  --receipt fixtures/conformance/synthetic-receipt.v2.json \
  --output /tmp/cylon-receipt-conformance
```

The CLI reads at most 2,097,152 bytes. It checks the open file before parsing and stops if the file grows past that limit while being read. Malformed JSON receives a generic error that does not echo parser-controlled bytes. Receipt-controlled identifiers in terminal errors are length-limited and escape C0, DEL, C1, Unicode line separators, bidi controls, and ANSI escape bytes. The library function accepts an already-parsed object, so an embedding application must apply its own finite serialized-input limit before parsing.

The verifier holds every output in memory until these checks pass:

1. the v1 or v2 receipt validates and its integrity digest matches;
2. a v1 receipt normalizes to v2, preserves its digest-bound summary verbatim, and the normalized receipt revalidates;
3. the benchmark definition and challenge snapshots exactly match `defaultBenchmarkRegistry`;
4. every Claim Ledger row matches the benchmark challenge/version, fixed demand, stable claim ID, canonical AI draft, complete ordered review history, and exact latest human call;
5. every Stress Fracture model verdict matches the sealed AI draft and every human call matches the latest event in the complete ordered verdict stream;
6. every citation ID referenced by the AI draft or Claim Ledger exists in `verifiedCitations`, has `exact` or `normalized` status, retains quote/page/printed-label metadata, and belongs to the exact challenge field it claims to support;
7. generated CSV, JSON, and receipt ledger IDs have one-to-one parity;
8. the reports contain the sealed receipt summary, claim prose, human values and reasons, stress rationales, and witness predictions.

The citation and ledger rules are intentionally conformance-only. They do not require a citation for a claim that references none, and they do not change the canonical artifact schemas. Moving these semantic cross-checks into shared production validation requires separate ownership of `src/bench/v2/artifact.ts`.

Only after every semantic check passes does publication begin. The verifier:

1. refuses an existing destination, including a file, directory, or symbolic link;
2. resolves the destination parent to one stable real path;
3. atomically claims the absent destination with `mkdir`, records that directory's device and inode, and refuses a concurrent claimant;
4. creates every content file directly with exclusive `wx` semantics, checks the claimed identity throughout, and verifies each digest from bytes read back from disk;
5. creates the manifest exclusively as the final write and package commit marker;
6. never rolls back or recursively deletes the claimed directory.

The verifier never overwrites or deletes a pre-existing destination or file. During publication the claimed directory is visible with content files but without a manifest; consumers must treat a package as complete only when `conformance-manifest.json` exists, parses, and every listed digest verifies. A handled publication failure can leave an incomplete claimed directory without a valid manifest. This is deliberate: retaining uncommitted output is safer than using pathname rollback or recursive deletion after a concurrent path swap. A malicious same-user process that swaps the claimed path in the narrow gap between an identity check and an exclusive write may receive a newly created file, but existing files are still protected by `wx`; same-user hostile mutation is outside this portable Node threat model.

## Outputs

- `canonical-receipt.v2.json` — the validated v2 receipt, including normalized v1 input
- `lab-note.html` — standalone two-minute Lab Note with no JavaScript
- `methods-and-evidence.html` — full Methods and Evidence report with no JavaScript
- `claim-ledger.csv` and `claim-ledger.json` — the same stable Claim Ledger row IDs
- `stress-fracture-map.json` — categorical outcomes, never a score
- `witness-protocols.json` — witness protocol cards as structured JSON
- `conformance-manifest.json` — SHA-256 digests for every output above

Stress Fracture Map and Witness Protocol standalone outputs are JSON because that is the canonical report bundle contract. The Lab Note and Methods report render them as readable cards.

## Failure classes

Semantic failures exit non-zero before the destination is claimed or any output is written. Publication failures also exit non-zero, but can leave an incomplete claimed directory without a valid manifest. In either case the command prints one actionable class:

| Class | Meaning |
| --- | --- |
| `INPUT_INVALID` | Unsupported receipt version or canonical schema failure |
| `INPUT_TOO_LARGE` | CLI receipt exceeds the finite 2 MiB byte limit |
| `RECEIPT_INTEGRITY` | v1 artifact or v2 integrity digest mismatch |
| `REVIEW_HISTORY` | Non-contiguous order, duplicate IDs, or broken Claim Ledger event binding |
| `BENCHMARK_MISMATCH` | Snapshot, version, or digest differs from the canonical registry |
| `CITATION_EVIDENCE` | A referenced citation is missing, failed, mismatched, or assigned to the wrong field |
| `LEDGER_BINDING` | A claim coordinate, draft, complete event sequence, or final call contradicts the receipt |
| `VERDICT_BINDING` | A model verdict or latest human verdict call contradicts its complete ordered event stream |
| `LEDGER_PARITY` | CSV, JSON, and receipt Claim Ledger IDs diverge |
| `SEALED_PROSE` | A report omits prose already sealed in the canonical receipt |
| `OUTPUT_CONFLICT` | The requested destination already exists and was left untouched |
| `OUTPUT_PUBLICATION` | Stable-parent resolution, atomic claim, exclusive creation, read-back verification, identity binding, or manifest-last publication failed |

A reordered event array with unchanged sequence numbers is schema-invalid and is caught. A malicious actor who reorders **and renumbers** events and then creates a new valid digest cannot be identified from one receipt alone. Proving historical authenticity needs a prior digest chain or deliberate signature and key-custody model.

## Golden fixtures

`synthetic-receipt.v1.json` and `synthetic-receipt.v2.json` use fixed IDs, timestamps, paper metadata, paper fragments, and reviewer aliases. They contain no full paper text and no personal reviewer identity. The native v2 fixture embeds the public canonical registry. The v1 input contains a synthetic legacy benchmark whose exact digest is an explicit fixture mapping; its normalized v2 output binds the public canonical registry and retains the original v1 summary exactly. `legacyImport.originalIntegrityDigest` records which validated v1 receipt supplied that prose. Arbitrary resealed v1 benchmark versions, titles, or bytes are rejected even though the historical normalizer can technically replace them.

`expected-output-digests.json` pins every expected byte digest for both the native v2 run and deterministic v1-to-v2 normalization. The tests also regenerate both input receipts from `synthetic-receipts.ts` and compare them with the committed JSON.

Run the focused proof:

```sh
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm test -- --run test/conformance
```

Any intentional fixture or expected-digest change requires maintainer review. A digest update is evidence of changed bytes, not evidence that the new scientific content is correct.
