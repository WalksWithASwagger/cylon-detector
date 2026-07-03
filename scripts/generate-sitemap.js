import { writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Keep in sync with SUPPORTED_LOCALES / DEFAULT_LOCALE in src/shared/site.ts
const DEFAULT_LOCALE = "en";
const SUPPORTED_LOCALES = [
  "en", "es", "fr", "de", "it", "nl", "pl", "pt-BR", "pt-PT", "ru", "uk", "tr",
  "ar", "he", "hi", "bn", "zh-CN", "zh-TW", "ja", "ko", "id", "ms", "vi", "th",
];

function generateSlug(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const baseData = [
  {
    name: "Materialism",
    children: [
      {
        name: "Philosophical",
        children: [
          { name: "Eliminative", value: 1 },
          { name: "Epiphenomenalism", value: 1 },
          { name: "Functionalism", value: 1 },
          { name: "Emergence", value: 1 },
          { name: "Mind-Brain", value: 1 },
          { name: "Searle", value: 1 },
          { name: "Block", value: 1 },
          { name: "Flanagan", value: 1 },
          { name: "Papineau", value: 1 },
          { name: "Goldstein", value: 1 },
          { name: "Hardcastle", value: 1 },
          { name: "Stoljar", value: 1 },
        ],
      },
      {
        name: "Neurobiological",
        children: [
          { name: "Edelman", value: 1 },
          { name: "Crick-Koch", value: 1 },
          { name: "Baars-Dehaene", value: 1 },
          { name: "Dennett", value: 1 },
          { name: "Minsky", value: 1 },
          { name: "Graziano", value: 1 },
          { name: "Prinz", value: 1 },
          { name: "Sapolsky", value: 1 },
          { name: "Mitchell", value: 1 },
          { name: "Bach", value: 1 },
          { name: "Brain Circuits", value: 1 },
          { name: "Northoff", value: 1 },
          { name: "Bunge", value: 1 },
          { name: "Hirstein", value: 1 },
        ],
      },
      {
        name: "Electromagnetic",
        children: [
          { name: "Jones", value: 1 },
          { name: "Pockett", value: 1 },
          { name: "McFadden", value: 1 },
          { name: "Ephaptic", value: 1 },
          { name: "Ambron", value: 1 },
          { name: "Llinas", value: 1 },
          { name: "Zhang", value: 1 },
        ],
      },
      {
        name: "Computational",
        children: [
          { name: "Computational", value: 1 },
          { name: "Grossberg", value: 1 },
          { name: "Adaptive Systems", value: 1 },
          { name: "Critical Brain", value: 1 },
          { name: "Pribram", value: 1 },
          { name: "Doyle", value: 1 },
          { name: "Informational", value: 1 },
          { name: "Mathematical", value: 1 },
        ],
      },
      {
        name: "Homeostatic",
        children: [
          { name: "Predictive", value: 1 },
          { name: "Seth", value: 1 },
          { name: "Damasio", value: 1 },
          { name: "Friston", value: 1 },
          { name: "Solms", value: 1 },
          { name: "Carhart-Harris", value: 1 },
          { name: "Buzsáki", value: 1 },
          { name: "Deacon", value: 1 },
          { name: "Pereira", value: 1 },
          { name: "Mansell", value: 1 },
          { name: "Projective", value: 1 },
          { name: "Pepperell", value: 1 },
        ],
      },
      {
        name: "Embodied",
        children: [
          { name: "Embodied", value: 1 },
          { name: "Enactivism", value: 1 },
          { name: "Varela", value: 1 },
          { name: "Thompson", value: 1 },
          { name: "Frank-Gleiser", value: 1 },
          { name: "Bitbol", value: 1 },
          { name: "Direct Perception", value: 1 },
          { name: "Gibson", value: 1 },
        ],
      },
      {
        name: "Relational",
        children: [
          { name: "A. Clark", value: 1 },
          { name: "Noë", value: 1 },
          { name: "Loorits", value: 1 },
          { name: "Lahav", value: 1 },
          { name: "Tsuchiya", value: 1 },
          { name: "Jaworski", value: 1 },
          { name: "Process", value: 1 },
        ],
      },
      {
        name: "Representational",
        children: [
          { name: "First-Order", value: 1 },
          { name: "Lamme", value: 1 },
          { name: "Higher-Order", value: 1 },
          { name: "Lau", value: 1 },
          { name: "LeDoux Higher-Order", value: 1 },
          { name: "Humphrey", value: 1 },
          { name: "Metzinger", value: 1 },
          { name: "Jackson", value: 1 },
          { name: "Lycan", value: 1 },
          { name: "Transparency", value: 1 },
          { name: "Tye", value: 1 },
          { name: "Thagard", value: 1 },
          { name: "T. Clark", value: 1 },
          { name: "Deacon Symbolic", value: 1 },
        ],
      },
      {
        name: "Language",
        children: [
          { name: "Chomsky", value: 1 },
          { name: "Searle Language", value: 1 },
          { name: "Koch Language", value: 1 },
          { name: "Smith", value: 1 },
          { name: "Jaynes", value: 1 },
          { name: "Parrington", value: 1 },
        ],
      },
      {
        name: "Phylogenetic",
        children: [
          { name: "Dennett Evolution", value: 1 },
          { name: "LeDoux Deep Roots", value: 1 },
          { name: "Ginsburg-Jablonka", value: 1 },
          { name: "Cleeremans", value: 1 },
          { name: "Andrews", value: 1 },
          { name: "Reber", value: 1 },
          { name: "Feinberg-Mallatt", value: 1 },
          { name: "Levin", value: 1 },
          { name: "James", value: 1 },
        ],
      },
    ],
  },
  {
    name: "Non-Reductive",
    children: [
      { name: "Ellis", value: 1 },
      { name: "Murphy", value: 1 },
      { name: "van Inwagen", value: 1 },
      { name: "Nagasawa Nontheoretical", value: 1 },
      { name: "Sanfey", value: 1 },
      { name: "Northoff Non-Reductive", value: 1 },
    ],
  },
  {
    name: "Quantum",
    children: [
      { name: "Penrose-Hameroff", value: 1 },
      { name: "Stapp", value: 1 },
      { name: "Bohm", value: 1 },
      { name: "Pylkkänen", value: 1 },
      { name: "Wolfram", value: 1 },
      { name: "Beck-Eccles", value: 1 },
      { name: "Kauffman", value: 1 },
      { name: "Torday", value: 1 },
      { name: "Smolin", value: 1 },
      { name: "Carr", value: 1 },
      { name: "Faggin", value: 1 },
      { name: "Fisher", value: 1 },
      { name: "Globus", value: 1 },
      { name: "Poznanski", value: 1 },
      { name: "Quantum Extensions", value: 1 },
      { name: "Rovelli", value: 1 },
    ],
  },
  {
    name: "Integrated Info",
    children: [
      { name: "Critiques", value: 1 },
      { name: "Koch IIT", value: 1 },
      { name: "IIT", value: 1 },
    ],
  },
  {
    name: "Panpsychism",
    children: [
      { name: "Micropsychism", value: 1 },
      { name: "Panprotopsychism", value: 1 },
      { name: "Cosmopsychism", value: 1 },
      { name: "Qualia Force", value: 1 },
      { name: "Qualia Space", value: 1 },
      { name: "Chalmers", value: 1 },
      { name: "Strawson", value: 1 },
      { name: "Goff", value: 1 },
      { name: "A. Harris", value: 1 },
      { name: "Sheldrake", value: 1 },
      { name: "Wallace", value: 1 },
      { name: "Whitehead", value: 1 },
    ],
  },
  {
    name: "Monism",
    children: [
      { name: "Russellian", value: 1 },
      { name: "Davidson", value: 1 },
      { name: "Velmans", value: 1 },
      { name: "Strawson Realistic", value: 1 },
      { name: "Polkinghorne", value: 1 },
      { name: "Teilhard", value: 1 },
      { name: "Atmanspacher", value: 1 },
      { name: "Ramachandran", value: 1 },
      { name: "Tegmark", value: 1 },
      { name: "QRI", value: 1 },
      { name: "Bentley Hart", value: 1 },
      { name: "Leslie", value: 1 },
    ],
  },
  {
    name: "Dualism",
    children: [
      { name: "Property", value: 1 },
      { name: "Traditional", value: 1 },
      { name: "Swinburne", value: 1 },
      { name: "Composite", value: 1 },
      { name: "Stump", value: 1 },
      { name: "Feser", value: 1 },
      { name: "Moreland", value: 1 },
      { name: "Interactive", value: 1 },
      { name: "Emergent", value: 1 },
      { name: "Kind", value: 1 },
      { name: "Hebrew Soul", value: 1 },
      { name: "Christian Soul", value: 1 },
      { name: "Islamic Soul", value: 1 },
      { name: "God-Supplied", value: 1 },
      { name: "Indian", value: 1 },
      { name: "Indigenous", value: 1 },
      { name: "Soul Realms", value: 1 },
      { name: "Theosophy", value: 1 },
      { name: "Steiner", value: 1 },
      { name: "Nonphysical", value: 1 },
    ],
  },
  {
    name: "Idealism",
    children: [
      { name: "Indian Cosmic", value: 1 },
      { name: "Buddhism", value: 1 },
      { name: "Dao", value: 1 },
      { name: "Kastrup", value: 1 },
      { name: "Hoffman", value: 1 },
      { name: "McGilchrist", value: 1 },
      { name: "Chopra", value: 1 },
      { name: "Physical", value: 1 },
      { name: "Goswami", value: 1 },
      { name: "Spira", value: 1 },
      { name: "Nader", value: 1 },
      { name: "Ward", value: 1 },
      { name: "Albahari", value: 1 },
      { name: "Meijer", value: 1 },
      { name: "Imaginative", value: 1 },
    ],
  },
  {
    name: "Anomalous",
    children: [
      { name: "Bergson", value: 1 },
      { name: "Jung", value: 1 },
      { name: "Radin", value: 1 },
      { name: "Tart", value: 1 },
      { name: "Josephson", value: 1 },
      { name: "Wilber", value: 1 },
      { name: "Combs", value: 1 },
      { name: "Schooler", value: 1 },
      { name: "Sheldrake Morphic", value: 1 },
      { name: "Grinberg", value: 1 },
      { name: "Graboi", value: 1 },
      { name: "NDE", value: 1 },
      { name: "DOPS", value: 1 },
      { name: "Bitbol Phenomenological", value: 1 },
      { name: "Campbell", value: 1 },
      { name: "Hiller", value: 1 },
      { name: "Harp", value: 1 },
      { name: "Swimme", value: 1 },
      { name: "Langan", value: 1 },
      { name: "Meditation", value: 1 },
      { name: "Psychedelic", value: 1 },
    ],
  },
  {
    name: "Challenge",
    children: [
      { name: "Nagel", value: 1 },
      { name: "McGinn", value: 1 },
      { name: "S. Harris", value: 1 },
      { name: "Eagleman", value: 1 },
      { name: "Tallis", value: 1 },
      { name: "Nagasawa Mind-Body", value: 1 },
      { name: "Musser", value: 1 },
      { name: "Davies", value: 1 },
    ],
  },
];

function extractTheories() {
  const theories = [];

  for (const mainCategory of baseData) {
    const categorySlug = generateSlug(mainCategory.name);

    if (mainCategory.children) {
      for (const subcategory of mainCategory.children) {
        if (subcategory.children) {
          for (const theory of subcategory.children) {
            theories.push({
              category: categorySlug,
              theory: generateSlug(theory.name),
            });
          }
        } else {
          theories.push({
            category: categorySlug,
            theory: generateSlug(subcategory.name),
          });
        }
      }
    }
  }

  return theories;
}

function getShippedLocales(publicDir) {
  // A locale counts as "shipped" once its UI dictionary exists - that's the
  // cheapest reliable signal that the site actually has something to show
  // for it, without requiring full per-theory content parity.
  return SUPPORTED_LOCALES.filter(
    (locale) =>
      locale === DEFAULT_LOCALE ||
      existsSync(join(publicDir, "i18n", "ui", `${locale}.json`))
  );
}

function localizedPath(pathWithoutLocale, locale) {
  if (locale === DEFAULT_LOCALE) return pathWithoutLocale;
  return pathWithoutLocale === "/" ? `/${locale}` : `/${locale}${pathWithoutLocale}`;
}

function hreflangBlock(baseUrl, pathWithoutLocale, locales) {
  const links = locales.map(
    (code) =>
      `      <xhtml:link rel="alternate" hreflang="${code}" href="${baseUrl}${localizedPath(pathWithoutLocale, code)}" />`
  );
  links.push(
    `      <xhtml:link rel="alternate" hreflang="x-default" href="${baseUrl}${pathWithoutLocale}" />`
  );
  return links.join("\n");
}

function generateSitemap(baseUrl, locales) {
  const theories = extractTheories();

  const urlEntries = [];

  // Home page - localized, one <url> per shipped locale plus hreflang siblings.
  for (const locale of locales) {
    urlEntries.push(`  <url>
    <loc>${baseUrl}${localizedPath("/", locale)}</loc>
${hreflangBlock(baseUrl, "/", locales)}
  </url>`);
  }

  // /paper is explicitly out of i18n scope: single URL, no locale variants, no hreflang.
  urlEntries.push(`  <url>
    <loc>${baseUrl}/paper</loc>
  </url>`);

  // Theory pages - localized, one <url> per shipped locale plus hreflang siblings.
  for (const { category, theory } of theories) {
    const pathWithoutLocale = `/${category}/${theory}`;
    for (const locale of locales) {
      urlEntries.push(`  <url>
    <loc>${baseUrl}${localizedPath(pathWithoutLocale, locale)}</loc>
${hreflangBlock(baseUrl, pathWithoutLocale, locales)}
  </url>`);
    }
  }

  return `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urlEntries.join("\n")}
</urlset>`;
}

const baseUrl = process.env.SITE_URL || "https://consciousnessatlas.com";
const publicDir = join(__dirname, "..", "public");
const shippedLocales = getShippedLocales(publicDir);
const sitemap = generateSitemap(baseUrl, shippedLocales);

const sitemapPath = join(publicDir, "sitemap.xml");

writeFileSync(sitemapPath, sitemap, "utf-8");
console.log(`Sitemap generated at ${sitemapPath}`);
console.log(`Shipped locales: ${shippedLocales.join(", ")}`);
console.log(`Total URLs: ${(extractTheories().length + 1) * shippedLocales.length + 1}`);
