# Cylon Detector release handoff

Status: Git delivery authorized through the `ship-it` closeout. The pull request is the live receipt for commit, push, review, checks, and merge state. Deployment, licensing, vendor provisioning, public release, and research activation remain withheld.

## Preserved alpha

- Working branch: `codex/thursday-killer-alpha`
- Preserved baseline commit: `5c2b541a7199dcb6521af6a4abb220c3bc86b2cf`
- Preserved staged-diff SHA-256: `55b7bd64953c10e2f3e6e38c9cd86303c2881c361167a5c0b617e46d9cc782cb`
- The pre-existing alpha index remained byte-for-byte intact while the skunkworks beta was implemented and verified around it.

Before delivery, the branch, baseline, staged digest, full diff, and untracked files must be re-checked. The intended delivery is one reviewed pull request into `master`; do not reconstruct, reset, clean, or split the preserved alpha without a fresh decision.

## Local verification packet

Run with Node 22:

```bash
export CYLON_NODE22_PATH="/opt/homebrew/opt/node@22/bin:$PATH"
PATH="$CYLON_NODE22_PATH" node --version
PATH="$CYLON_NODE22_PATH" npm run verify
PATH="$CYLON_NODE22_PATH" npm run test:e2e
PATH="$CYLON_NODE22_PATH" npm audit --audit-level=moderate
PATH="$CYLON_NODE22_PATH" npm exec -- varlock load --agent --show-all
PATH="$CYLON_NODE22_PATH" npm exec -- varlock scan --staged
git diff --check
```

Manual inspection covers desktop, mobile, 200 percent zoom, reduced motion, keyboard-only completion, screen-reader status semantics, imported receipts, collaboration, research packaging, and the disabled experimental console.

## Approval gates

### Git and preview

The `ship-it` instruction authorizes committing, pushing, and opening the single pull request. It does not authorize a Vercel preview or production deployment. The first approved preview must remain mock-only:

```text
MAC_ANALYSIS_MODE=mock
MAC_LIVE_ANALYSIS_ENABLED=false
MAC_INVITE_POLICY=disabled
VITE_USE_ANALYSIS_API=false
```

Review the preview on the generated Vercel domain before considering production. A custom domain and production deployment remain separate decisions.

### Licensing

No blanket license has been added. No open-source claim is authorized. The path candidates and inherited boundary are in `docs/licensing-boundary.md`.

Unsent upstream request draft:

> Hi Danilo — I'm building an original consciousness-benchmark surface on top of my Consciousness Atlas fork. The inherited README says MIT, but I couldn't find a tracked license file. Can you confirm the intended Atlas license and, ideally, add or point me to the canonical license and copyright notice? I won't apply a blanket license to your inherited files while that boundary is unresolved. Thanks.

Sending this note and later applying the reviewed Apache-2.0 map each require explicit approval. If upstream remains unresolved when a true open-source release matters, extract the original bench into a clean Apache-2.0 repository.

### Live analysis and vendors

Provisioning Upstash, changing OpenAI or Vercel spending limits, injecting production secrets, creating real invite records, and setting `MAC_LIVE_ANALYSIS_ENABLED=true` are separate approvals. Follow `docs/operations/invite-operations.md` only after those approvals. The application fails closed while any live dependency is absent; anonymous local rehearsal remains available.

### Publication and research

- MAC review is required before publishing a benchmark version under MAC's name.
- OSF output is a local package only. Direct writes require a later OAuth design and explicit approval.
- AI indicator profiles remain theory-dependent evidence profiles, not scientific detection verdicts.
- The Provenance Flip study remains disabled. No human responses, deception, or deliberate provenance mislabelling may occur until consent, debriefing, retention, ethics, and named-ownership approvals are real.

## Release decision sequence

1. Deliver the reviewed local diff through one pull request into `master`.
2. Prove required checks against the exact head commit and record the merge state in GitHub.
3. Separately authorize a mock-only preview.
4. Complete visual and privacy review on that preview.
5. Resolve the inherited license boundary before any open-source claim.
6. Make vendor, spending, secret, and live-analysis decisions independently of production deployment.
7. Keep OSF writes, indicator experiments, and human-subject studies behind their own later gates.
