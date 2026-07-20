export const meta = {
  name: 'translate-he-theories',
  description: 'Translate 210 theory JSON files into Hebrew (he) via 12 parallel agents',
  phases: [{ title: 'Translate', detail: '12 agents, ~18 files each, each self-validates' }],
}

const ALL = "A-Clark.json,A-Harris.json,Adaptive-Systems.json,Albahari.json,Ambron.json,Andrews.json,Atmanspacher.json,Baars-Dehaene.json,Bach.json,Beck-Eccles.json,Bentley-Hart.json,Bergson.json,Bitbol-Phenomenological.json,Bitbol.json,Block.json,Bohm.json,Brain-Circuits.json,Buddhism.json,Bunge.json,Buzsaki.json,Campbell.json,Carhart-Harris.json,Carr.json,Chalmers.json,Chomsky.json,Chopra.json,Christian-Soul.json,Cleeremans.json,Combs.json,Composite.json,Computational.json,Cosmopsychism.json,Crick-Koch.json,Critical-Brain.json,Critiques.json,Damasio.json,Dao.json,Davidson.json,Davies.json,Deacon-Symbolic.json,Deacon.json,Dennett-Evolution.json,Dennett.json,Direct-Perception.json,Dops.json,Doyle.json,Eagleman.json,Edelman.json,Eliminative.json,Ellis.json,Embodied.json,Emergence.json,Emergent.json,Enactivism.json,Ephaptic.json,Epiphenomenalism.json,Faggin.json,Feinberg-Mallatt.json,Feser.json,First-Order.json,Fisher.json,Flanagan.json,Frank-Gleiser.json,Friston.json,Functionalism.json,Gibson.json,Ginsburg-Jablonka.json,Globus.json,God-Supplied.json,Goff.json,Goldstein.json,Goswami.json,Graboi.json,Graziano.json,Grinberg.json,Grossberg.json,Hardcastle.json,Harp.json,Hebrew-Soul.json,Higher-Order.json,Hiller.json,Hirstein.json,Hoffman.json,Humphrey.json,Iit.json,Imaginative.json,Indian-Cosmic.json,Indian.json,Indigenous.json,Informational.json,Interactive.json,Islamic-Soul.json,Jackson.json,James.json,Jaworski.json,Jaynes.json,Jones.json,Josephson.json,Jung.json,Kastrup.json,Kauffman.json,Kind.json,Koch-Iit.json,Koch-Language.json,Lahav.json,Lamme.json,Langan.json,Lau.json,Ledoux-Deep-Roots.json,Ledoux-Higher-Order.json,Leslie.json,Levin.json,Llinas.json,Loorits.json,Lycan.json,Mansell.json,Mathematical.json,Mcfadden.json,Mcgilchrist.json,Mcginn.json,Meditation.json,Meijer.json,Metzinger.json,Micropsychism.json,Mind-Brain.json,Minsky.json,Mitchell.json,Moreland.json,Murphy.json,Musser.json,Nader.json,Nagasawa-Mind-Body.json,Nagasawa-Nontheoretical.json,Nagel.json,Nde.json,Noe.json,Nonphysical.json,Northoff-Non-Reductive.json,Northoff.json,Panprotopsychism.json,Papineau.json,Parrington.json,Penrose-Hameroff.json,Pepperell.json,Pereira.json,Physical.json,Pockett.json,Polkinghorne.json,Poznanski.json,Predictive.json,Pribram.json,Prinz.json,Process.json,Projective.json,Property.json,Psychedelic.json,Pylkkanen.json,Qri.json,Qualia-Force.json,Qualia-Space.json,Quantum-Extensions.json,Radin.json,Ramachandran.json,Reber.json,Rovelli.json,Russellian.json,S-Harris.json,Sanfey.json,Sapolsky.json,Schooler.json,Searle-Language.json,Searle.json,Seth.json,Sheldrake-Morphic.json,Sheldrake.json,Smith.json,Smolin.json,Solms.json,Soul-Realms.json,Spira.json,Stapp.json,Steiner.json,Stoljar.json,Strawson-Realistic.json,Strawson.json,Stump.json,Swimme.json,Swinburne.json,T-Clark.json,Tallis.json,Tart.json,Tegmark.json,Teilhard.json,Thagard.json,Theosophy.json,Thompson.json,Torday.json,Traditional.json,Transparency.json,Tsuchiya.json,Tye.json,Van-Inwagen.json,Varela.json,Velmans.json,Wallace.json,Ward.json,Whitehead.json,Wilber.json,Wolfram.json,Zhang.json".split(',')

// 12 near-equal groups
const N = 12
const groups = []
const per = Math.ceil(ALL.length / N)
for (let i = 0; i < ALL.length; i += per) groups.push(ALL.slice(i, i + per))

function buildPrompt(files) {
  const list = files.join(', ')
  return `Translate theory-content JSON files for "Consciousness Atlas" from English into Hebrew (\`he\`), formal academic Hebrew (MSA-equivalent register). This is an RTL, Hebrew-script locale: write in Hebrew script; proper nouns (philosopher surnames, book/paper titles) stay in Latin, but there must be NO stray Latin outside genuine proper nouns. Only touch YOUR files. Do NOT sub-delegate — do the work yourself.

First read fully and follow:
- /Users/dan/Repositories/c-atlas/docs/i18n/TRANSLATION_GUIDE.md
- /Users/dan/Repositories/c-atlas/docs/i18n/glossary.json (has \`he\` renderings for the core terms + MTTS field labels — use them for consistency; do NOT edit. If a recurring domain term isn't in glossary, pick one consistent Hebrew rendering.)
- You MAY consult public/data/fr/{filename} for structure. Translate from the English source at public/data/{filename}.

Convention (all prior locales): translate \`category\`/\`subcategory\`; leave \`related_theories[].name\` verbatim English (cross-references); translate \`related_theories[].relationship\`. Philosopher surnames: keep verbatim in Latin script (do NOT transliterate to Hebrew). Do not add RTL control characters or BOMs to the JSON.

YOUR FILES (all in /Users/dan/Repositories/c-atlas/public/data/): ${list}

For EACH file (read → translate → write, one at a time):
- Preserve the EXACT JSON keys, nesting, value types (string vs array) as source, even where it deviates from the documented schema (missing/renamed/misplaced fields, string-vs-array, duplicate keys, empty ""/[], null). Do NOT "fix" — translate values, keep shape.
- Do NOT translate: \`id_and_class.associated_thinkers\` (verbatim even if a descriptive sentence), \`id_and_class.classification_tags\`, \`sources_and_references[].title_with_names\`, \`.year\` (and any extra \`names\` arrays in sources). Preserve markup tokens ($Phi$, &Phi;, LaTeX), literal \\n, and citation artifacts verbatim.
- \`implications.*.stance\`, \`ontological_status\`, \`primitive_or_emergent_status\`, \`emergence_type\`, \`related_theories[].relationship\` are freeform short prose — translate as short Hebrew prose.
- Empty (""/[]) stays empty. Soul/religious files: neutral register, soul → נשמה/נפש consistently; keep transliterated Sanskrit/Hebrew/Arabic terms as source has them.
- Write to /Users/dan/Repositories/c-atlas/public/data/he/{filename} (create the dir if needed).

After all your files, run this and fix any hard failures, re-running until 0:
\`cd /Users/dan/Repositories/c-atlas && node scripts/i18n-check.js he --files ${list.replace(/, /g, ',')}\`
("identical to English source" warnings are fine for proper nouns / cross-references.)

Do NOT modify docs/i18n/progress/STATUS.json or docs/i18n/glossary.json.
Report back: count translated and final validation line (hard failures / warnings).`
}

phase('Translate')
const results = await parallel(
  groups.map((files, i) => () =>
    agent(buildPrompt(files), { label: `he-group-${i + 1} (${files.length}f)`, phase: 'Translate' })
  )
)

return { groups: groups.length, done: results.filter(Boolean).length }
