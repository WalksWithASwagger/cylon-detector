# Voice slop findings

## Mechanical pass

The first checker pass found eight mechanical hits in the product-facing corpus: seven em dashes in `bench.html` and one use of `unlock` in `src/bench/main.ts`. It did not flag the README, benchmark language, mock findings, or artifact code.

That is a useful lint pass, not a verdict on voice. A clean scan can still sound like machine-polished institutional paste.

## Human pass

The strongest existing lines were already doing the real work:

- “Interrogate the theory.”
- “Three ways to make a theory bleed.”
- “The model drafts the attack. A human decides what survives.”
- “The machine does not get the last word.”
- “Portable receipt.”

The weak spots hid responsibility behind vague language. “Provider disclosure applies,” “does not intentionally persist,” “human repair,” and “accepted by human action” all sounded like somebody trying not to be caught holding the wrench.

## Decision

Keep the Builder as the dominant voice: clear mechanism, receipts, and scientific limits. Use the Anti-Hero as voltage, not costume. The Cylon language earns its place when it makes a technical boundary memorable. It should never replace the boundary.
