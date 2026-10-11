/**
 * The searchable icon index behind the note icon picker.
 *
 * Three react-icons sets are in play — roughly 7,000 icons — so nothing here
 * imports them at module scope. `loadIconIndex()` and `resolveIcon()` reach for
 * the sets through dynamic `import()`, which keeps ~9MB of icon paths out of
 * every route that merely mentions a note.
 */

import type { IconType } from "react-icons";

export type IconLibrary = "si" | "lu" | "fa6";

/** What we persist for a note: just enough to look the component back up. */
export type NoteIconRef = { library: string; name: string };

export type IconEntry = {
  /** `${library}:${name}` — stable key for React and for dedupe. */
  id: string;
  library: IconLibrary;
  /** react-icons export name, e.g. `SiOpenjdk`. */
  name: string;
  /** Human label, e.g. "OpenJDK". */
  label: string;
  /** Export name minus the library prefix, lowercased: `openjdk`. */
  slug: string;
  labelLower: string;
};

export type IconIndex = {
  entries: IconEntry[];
  byId: Map<string, IconEntry>;
};

/**
 * Filter tabs. Font Awesome 6 ships brand marks and general-purpose glyphs in
 * one module with nothing in the export name to tell them apart, so it sits in
 * both buckets rather than being wrongly assigned to one.
 */
export type IconScope = "all" | "tech" | "general";

export const ICON_SCOPES: { id: IconScope; label: string }[] = [
  { id: "all", label: "All" },
  { id: "tech", label: "Tech" },
  { id: "general", label: "General" },
];

const SCOPE_LIBRARIES: Record<IconScope, IconLibrary[]> = {
  all: ["si", "lu", "fa6"],
  tech: ["si", "fa6"],
  general: ["lu", "fa6"],
};

export function librariesForScope(scope: IconScope): IconLibrary[] {
  return SCOPE_LIBRARIES[scope];
}

/* -------------------------------------------------------------------------
   Aliases
   ------------------------------------------------------------------------- */

/**
 * Why this table exists.
 *
 * Icon sets are named after brands, not after the words people type, and the
 * gap between the two is wide enough to make a plain substring search look
 * broken. The canonical case: **there is no `SiJava`** — Simple Icons dropped
 * the Java icon over Oracle's trademark — so searching "java" would otherwise
 * surface `SiJavascript` and nothing else, which is not just thin but wrong.
 * The Java *ecosystem* is well covered (OpenJDK, Spring, Maven, Gradle,
 * IntelliJ, Tomcat, Hibernate…) and Font Awesome still ships `FaJava`; the
 * table is what connects the word to them.
 *
 * The same problem repeats for abbreviations ("k8s", "ts", "db"), for
 * categories with no single icon ("ci", "cloud", "ide"), and for products
 * filed under a parent brand ("actions" → GitHub Actions).
 *
 * Rules for extending it:
 *  - keys are lowercase, matched exactly and by prefix, so typing "jav"
 *    already pulls in the "java" row;
 *  - values are ordered — the first id is the best answer for that word;
 *  - every id must actually exist in its set. Check before adding:
 *      node -e "console.log('SiOpenjdk' in require('react-icons/si'))"
 */
export const ICON_ALIASES: Record<string, string[]> = {
  // --- the headline case -------------------------------------------------
  java: [
    "fa6:FaJava",
    "si:SiOpenjdk",
    "si:SiSpring",
    "si:SiSpringboot",
    "si:SiApachemaven",
    "si:SiGradle",
    "si:SiIntellijidea",
    "si:SiApachetomcat",
    "si:SiHibernate",
    "si:SiSpringsecurity",
    "si:SiEclipseide",
    "si:SiEclipseadoptium",
    "si:SiQuarkus",
    "si:SiApacheant",
    "si:SiJunit5",
  ],
  jdk: ["si:SiOpenjdk", "si:SiEclipseadoptium", "fa6:FaJava"],
  jvm: [
    "si:SiOpenjdk",
    "si:SiKotlin",
    "si:SiScala",
    "si:SiClojure",
    "fa6:FaJava",
  ],
  spring: ["si:SiSpring", "si:SiSpringboot", "si:SiSpringsecurity"],
  maven: ["si:SiApachemaven", "si:SiGradle"],
  tomcat: ["si:SiApachetomcat"],
  jpa: ["si:SiHibernate", "si:SiOpenjdk"],
  orm: ["si:SiHibernate", "si:SiPrisma", "si:SiSequelize", "si:SiTypeorm"],
  junit: ["si:SiJunit5"],

  // --- language / runtime shorthand --------------------------------------
  js: ["si:SiJavascript", "si:SiNodedotjs", "fa6:FaJs", "si:SiBun", "si:SiDeno"],
  ts: ["si:SiTypescript", "si:SiNodedotjs", "si:SiDeno"],
  node: ["si:SiNodedotjs", "si:SiNpm", "si:SiBun", "si:SiDeno"],
  py: ["si:SiPython", "si:SiDjango", "si:SiFlask", "si:SiFastapi"],
  golang: ["si:SiGo", "fa6:FaGolang"],
  cpp: ["si:SiCplusplus"],
  "c++": ["si:SiCplusplus"],
  dotnet: ["si:SiDotnet"],
  ".net": ["si:SiDotnet"],
  rails: ["si:SiRubyonrails", "si:SiRuby"],
  wasm: ["si:SiWebassembly", "si:SiRust"],

  // --- data ---------------------------------------------------------------
  db: [
    "si:SiPostgresql",
    "si:SiMysql",
    "si:SiMongodb",
    "si:SiRedis",
    "si:SiSqlite",
    "lu:LuDatabase",
  ],
  database: [
    "si:SiPostgresql",
    "si:SiMysql",
    "si:SiMongodb",
    "si:SiRedis",
    "si:SiSqlite",
    "si:SiMariadb",
    "lu:LuDatabase",
    "fa6:FaDatabase",
  ],
  sql: [
    "si:SiPostgresql",
    "si:SiMysql",
    "si:SiSqlite",
    "si:SiMariadb",
    "si:SiClickhouse",
  ],
  postgres: ["si:SiPostgresql", "si:SiSupabase"],
  nosql: ["si:SiMongodb", "si:SiRedis", "si:SiApachecassandra"],
  cache: ["si:SiRedis", "si:SiCloudflare"],
  queue: [
    "si:SiApachekafka",
    "si:SiRabbitmq",
    "si:SiApachepulsar",
    "si:SiRedis",
  ],
  etl: ["si:SiApacheairflow", "si:SiApachespark", "si:SiSnowflake"],
  bigdata: ["si:SiApachespark", "si:SiApachehadoop", "si:SiSnowflake"],

  // --- infra / ops --------------------------------------------------------
  k8s: ["si:SiKubernetes", "si:SiHelm", "si:SiArgo", "si:SiIstio"],
  kube: ["si:SiKubernetes", "si:SiHelm"],
  container: ["si:SiDocker", "si:SiKubernetes", "si:SiPodman", "lu:LuContainer"],
  iac: ["si:SiTerraform", "si:SiPulumi", "si:SiAnsible", "si:SiVagrant"],
  devops: [
    "si:SiDocker",
    "si:SiKubernetes",
    "si:SiTerraform",
    "si:SiJenkins",
    "si:SiAnsible",
  ],
  ci: [
    "si:SiGithubactions",
    "si:SiJenkins",
    "si:SiCircleci",
    "si:SiTravisci",
    "si:SiArgo",
  ],
  cd: ["si:SiArgo", "si:SiGithubactions", "si:SiJenkins"],
  cicd: ["si:SiGithubactions", "si:SiJenkins", "si:SiCircleci", "si:SiArgo"],
  pipeline: ["si:SiGithubactions", "si:SiJenkins", "lu:LuWorkflow"],
  actions: ["si:SiGithubactions"],
  cloud: [
    "fa6:FaAws",
    "si:SiGooglecloud",
    "si:SiVercel",
    "si:SiCloudflare",
    "si:SiDigitalocean",
    "lu:LuCloud",
  ],
  aws: ["fa6:FaAws", "fa6:FaAmazon"],
  gcp: ["si:SiGooglecloud", "fa6:FaGoogle"],
  azure: ["fa6:FaMicrosoft", "lu:LuCloud"],
  hosting: ["si:SiVercel", "si:SiNetlify", "si:SiRailway", "si:SiRender"],
  monitoring: [
    "si:SiGrafana",
    "si:SiPrometheus",
    "si:SiDatadog",
    "si:SiSentry",
    "si:SiOpentelemetry",
  ],
  observability: [
    "si:SiOpentelemetry",
    "si:SiGrafana",
    "si:SiJaeger",
    "si:SiSplunk",
    "si:SiNewrelic",
  ],
  logs: ["si:SiElastic", "si:SiKibana", "si:SiSplunk", "lu:LuFileText"],
  oncall: ["si:SiPagerduty", "si:SiOpsgenie", "lu:LuBell"],

  // --- frontend -----------------------------------------------------------
  css: [
    "si:SiCss",
    "si:SiTailwindcss",
    "si:SiSass",
    "fa6:FaCss3Alt",
    "si:SiPostcss",
  ],
  html: ["si:SiHtml5", "fa6:FaHtml5"],
  tailwind: ["si:SiTailwindcss", "si:SiUnocss"],
  ui: ["si:SiFigma", "si:SiStorybook", "lu:LuLayoutGrid", "lu:LuComponent"],
  design: ["si:SiFigma", "lu:LuPalette", "lu:LuPaintbrush", "lu:LuFrame"],
  bundler: [
    "si:SiVite",
    "si:SiWebpack",
    "si:SiEsbuild",
    "si:SiRollupdotjs",
    "si:SiTurborepo",
  ],
  monorepo: ["si:SiTurborepo", "si:SiNx", "si:SiLerna", "si:SiPnpm"],

  // --- tooling ------------------------------------------------------------
  ide: [
    "si:SiIntellijidea",
    "si:SiVscodium",
    "si:SiEclipseide",
    "si:SiNeovim",
    "si:SiVim",
    "si:SiCursor",
    "si:SiJetbrains",
  ],
  editor: ["si:SiVscodium", "si:SiNeovim", "si:SiVim", "si:SiCursor"],
  vscode: ["si:SiVscodium", "si:SiCursor"],
  intellij: ["si:SiIntellijidea", "si:SiJetbrains"],
  vcs: ["si:SiGit", "si:SiGithub", "si:SiGitlab", "si:SiBitbucket"],
  git: ["si:SiGit", "si:SiGithub", "si:SiGitlab", "fa6:FaGitAlt"],
  pr: ["lu:LuGitPullRequest", "si:SiGithub", "lu:LuGitMerge"],
  lint: ["si:SiEslint", "si:SiPrettier", "si:SiBiome", "si:SiSonarqubeserver"],
  test: [
    "si:SiJest",
    "si:SiVitest",
    "si:SiCypress",
    "si:SiSelenium",
    "si:SiTestinglibrary",
    "si:SiJunit5",
  ],
  e2e: ["si:SiCypress", "si:SiSelenium", "si:SiPuppeteer", "si:SiWebdriverio"],
  api: [
    "si:SiSwagger",
    "si:SiPostman",
    "si:SiGraphql",
    "si:SiOpenapiinitiative",
    "si:SiInsomnia",
  ],
  rest: ["si:SiSwagger", "si:SiOpenapiinitiative", "si:SiPostman"],
  package: ["si:SiNpm", "si:SiPnpm", "si:SiYarn", "si:SiHomebrew", "lu:LuBox"],
  shell: ["si:SiGnubash", "si:SiZsh", "lu:LuTerminal", "si:SiTmux"],
  terminal: ["lu:LuTerminal", "si:SiGnubash", "si:SiIterm2", "si:SiWarp"],

  // --- security / auth ----------------------------------------------------
  auth: [
    "si:SiAuth0",
    "si:SiKeycloak",
    "si:SiOkta",
    "si:SiJsonwebtokens",
    "lu:LuKeyRound",
  ],
  jwt: ["si:SiJsonwebtokens", "si:SiAuth0"],
  sso: ["si:SiOkta", "si:SiAuth0", "si:SiKeycloak"],
  security: [
    "lu:LuShieldCheck",
    "si:SiSpringsecurity",
    "si:SiVault",
    "lu:LuLockKeyhole",
  ],
  secrets: ["si:SiVault", "lu:LuKey", "lu:LuLockKeyhole"],

  // --- ai / data science --------------------------------------------------
  ai: [
    "si:SiAnthropic",
    "si:SiClaude",
    "si:SiGooglegemini",
    "si:SiPytorch",
    "si:SiTensorflow",
    "fa6:FaRobot",
  ],
  ml: ["si:SiPytorch", "si:SiTensorflow", "si:SiNumpy", "lu:LuBrain"],
  llm: ["si:SiAnthropic", "si:SiClaude", "si:SiGooglegemini", "fa6:FaRobot"],
  notebook: ["si:SiJupyter", "lu:LuNotebook", "lu:LuNotebookPen"],

  // --- product / work -----------------------------------------------------
  ticket: ["si:SiJira", "si:SiLinear", "si:SiTrello", "lu:LuListTodo"],
  docs: ["si:SiConfluence", "si:SiNotion", "si:SiMarkdown", "lu:LuFileText"],
  wiki: ["si:SiConfluence", "si:SiNotion", "si:SiObsidian"],
  md: ["si:SiMarkdown", "si:SiObsidian"],
  chat: ["fa6:FaSlack", "lu:LuMessageSquare", "lu:LuMessageCircle"],
  meeting: ["lu:LuUsers", "lu:LuCalendarDays", "lu:LuHandshake"],
  todo: ["lu:LuListTodo", "lu:LuSquareCheck", "fa6:FaListCheck"],
  bug: ["lu:LuBug", "fa6:FaBug", "si:SiSentry"],
  idea: [
    "lu:LuLightbulb",
    "fa6:FaLightbulb",
    "lu:LuSparkles",
    "si:SiIntellijidea",
  ],
  launch: ["lu:LuRocket", "fa6:FaRocket", "si:SiVercel"],
  metrics: [
    "lu:LuChartLine",
    "lu:LuChartBar",
    "si:SiGrafana",
    "lu:LuTrendingUp",
  ],
  money: [
    "lu:LuDollarSign",
    "si:SiStripe",
    "lu:LuWallet",
    "lu:LuBanknote",
    "lu:LuReceipt",
  ],
  os: ["si:SiLinux", "fa6:FaApple", "fa6:FaWindows", "si:SiUbuntu"],
  mobile: [
    "fa6:FaAndroid",
    "fa6:FaApple",
    "si:SiFlutter",
    "si:SiSwift",
    "lu:LuSmartphone",
  ],
};

/* -------------------------------------------------------------------------
   Labels
   ------------------------------------------------------------------------- */

/**
 * Simple Icons export names are lowercase mush (`SiApachemaven`), so the
 * generic splitter below handles the regular ones and this table handles the
 * names whose casing nobody would guess.
 */
const LABEL_OVERRIDES: Record<string, string> = {
  SiOpenjdk: "OpenJDK",
  SiIntellijidea: "IntelliJ IDEA",
  SiJavascript: "JavaScript",
  SiTypescript: "TypeScript",
  SiNodedotjs: "Node.js",
  SiNextdotjs: "Next.js",
  SiVuedotjs: "Vue.js",
  SiNestjs: "NestJS",
  SiSocketdotio: "Socket.IO",
  SiFlydotio: "Fly.io",
  SiRollupdotjs: "Rollup.js",
  SiTrpc: "tRPC",
  SiPostgresql: "PostgreSQL",
  SiMysql: "MySQL",
  SiMongodb: "MongoDB",
  SiMariadb: "MariaDB",
  SiSqlite: "SQLite",
  SiInfluxdb: "InfluxDB",
  SiClickhouse: "ClickHouse",
  SiCockroachlabs: "Cockroach Labs",
  SiPlanetscale: "PlanetScale",
  SiGraphql: "GraphQL",
  SiHtml5: "HTML5",
  SiCss: "CSS",
  SiTailwindcss: "Tailwind CSS",
  SiPostcss: "PostCSS",
  SiUnocss: "UnoCSS",
  SiRubyonrails: "Ruby on Rails",
  SiDotnet: ".NET",
  SiPhp: "PHP",
  SiCplusplus: "C++",
  SiFastapi: "FastAPI",
  SiJunit5: "JUnit 5",
  SiNpm: "npm",
  SiPnpm: "pnpm",
  SiEslint: "ESLint",
  SiJsonwebtokens: "JSON Web Tokens",
  SiOpenapiinitiative: "OpenAPI Initiative",
  SiOpentelemetry: "OpenTelemetry",
  SiCircleci: "CircleCI",
  SiTravisci: "Travis CI",
  SiGnubash: "GNU Bash",
  SiIterm2: "iTerm2",
  SiNewrelic: "New Relic",
  SiPagerduty: "PagerDuty",
  SiWebdriverio: "WebdriverIO",
  SiEditorconfig: "EditorConfig",
  SiVscodium: "VSCodium",
  SiDbeaver: "DBeaver",
  SiNx: "Nx",
  SiZsh: "Zsh",
  SiR: "R",
  SiC: "C",
  SiGo: "Go",
  SiSaltproject: "Salt Project",
  SiTestinglibrary: "Testing Library",
  SiSonarqubeserver: "SonarQube Server",
  SiSonarqubecloud: "SonarQube Cloud",
  SiSonarqubeforide: "SonarQube for IDE",
  SiApachekafka: "Apache Kafka",
  SiRabbitmq: "RabbitMQ",
  SiJetbrains: "JetBrains",
  SiPytorch: "PyTorch",
  SiTensorflow: "TensorFlow",
  SiNumpy: "NumPy",
  SiGooglegemini: "Google Gemini",
  SiClaudecode: "Claude Code",
  FaJava: "Java",
  FaAws: "AWS",
  FaJs: "JavaScript",
  FaNodeJs: "Node.js",
  FaCss3Alt: "CSS3",
  FaHtml5: "HTML5",
  FaGitAlt: "Git",
  FaVuejs: "Vue.js",
  FaPhp: "PHP",
  FaGolang: "Go",
  FaDigitalOcean: "DigitalOcean",
  FaCss: "CSS",
  FaCss3: "CSS3",
  SiOpensearch: "OpenSearch",
  SiOpenssl: "OpenSSL",
  SiOpenstreetmap: "OpenStreetMap",
  SiMicrosoftteams: "Microsoft Teams",
};

/**
 * Compound Simple-Icons names split on these leading words. Sorted longest
 * first at the bottom of this block so "microsoft" wins over "micro".
 */
const COMPOUND_PREFIXES = [
  "apache",
  "amazon",
  "adobe",
  "alibaba",
  "cloudflare",
  "digital",
  "eclipse",
  "elastic",
  "github",
  "gitlab",
  "google",
  "jetbrains",
  "micro",
  "microsoft",
  "open",
  "spring",
  "visual",
].sort((a, b) => b.length - a.length);

/** Words whose casing is not "just capitalise the first letter". */
const WORD_CASING: Record<string, string> = {
  ai: "AI",
  api: "API",
  aws: "AWS",
  cd: "CD",
  ci: "CI",
  cli: "CLI",
  css: "CSS",
  db: "DB",
  gcp: "GCP",
  github: "GitHub",
  gitlab: "GitLab",
  gnu: "GNU",
  html: "HTML",
  id: "ID",
  ide: "IDE",
  io: "IO",
  jdk: "JDK",
  js: "JS",
  json: "JSON",
  jwt: "JWT",
  ml: "ML",
  os: "OS",
  php: "PHP",
  sdk: "SDK",
  sql: "SQL",
  ssh: "SSH",
  ui: "UI",
  ux: "UX",
  vm: "VM",
  xml: "XML",
  yaml: "YAML",
};

const DOMAIN_SUFFIXES = ["js", "io", "net", "com", "org", "dev", "sh", "ai"];

function capitalize(word: string): string {
  return WORD_CASING[word] ?? word.charAt(0).toUpperCase() + word.slice(1);
}

/** `LuGitPullRequest` -> "Git Pull Request"; `FaCcAmazonPay` -> "Cc Amazon Pay". */
function splitCamel(body: string): string {
  return body
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-zA-Z])([0-9])/g, "$1 $2")
    .trim();
}

/** `apachemaven` -> "Apache Maven", `nodedotjs` -> "Node.js". */
function splitLowercaseCompound(body: string): string {
  for (const suffix of DOMAIN_SUFFIXES) {
    const marker = `dot${suffix}`;
    if (body.endsWith(marker) && body.length > marker.length) {
      return `${splitLowercaseCompound(body.slice(0, -marker.length))}.${suffix}`;
    }
  }
  for (const prefix of COMPOUND_PREFIXES) {
    if (body.startsWith(prefix) && body.length > prefix.length + 1) {
      return `${capitalize(prefix)} ${splitLowercaseCompound(body.slice(prefix.length))}`;
    }
  }
  return capitalize(body);
}

/** Turns a react-icons export name into something a human would read. */
export function toIconLabel(library: IconLibrary, name: string): string {
  const override = LABEL_OVERRIDES[name];
  if (override) return override;

  const body = name.replace(/^(Si|Lu|Fa)/, "");
  if (!body) return name;

  // Simple Icons are lowercase after the first letter; Lucide and FA are camel.
  const isCompound = library === "si" && !/[A-Z]/.test(body.slice(1));
  return isCompound
    ? splitLowercaseCompound(body.toLowerCase())
    : splitCamel(body);
}

/* -------------------------------------------------------------------------
   Lazy loading
   ------------------------------------------------------------------------- */

type IconModule = Record<string, IconType>;

const moduleCache = new Map<IconLibrary, IconModule>();
const modulePromises = new Map<IconLibrary, Promise<IconModule>>();

function importLibrary(library: IconLibrary): Promise<IconModule> {
  switch (library) {
    case "si":
      return import("react-icons/si") as Promise<unknown> as Promise<IconModule>;
    case "lu":
      return import("react-icons/lu") as Promise<unknown> as Promise<IconModule>;
    case "fa6":
      return import(
        "react-icons/fa6"
      ) as Promise<unknown> as Promise<IconModule>;
  }
}

export function loadIconLibrary(library: IconLibrary): Promise<IconModule> {
  const cached = moduleCache.get(library);
  if (cached) return Promise.resolve(cached);

  let pending = modulePromises.get(library);
  if (!pending) {
    pending = importLibrary(library).then((mod) => {
      moduleCache.set(library, mod);
      return mod;
    });
    modulePromises.set(library, pending);
  }
  return pending;
}

function isIconLibrary(value: string): value is IconLibrary {
  return value === "si" || value === "lu" || value === "fa6";
}

/**
 * Component for a stored icon reference, or `null` if the pairing no longer
 * exists (a library rename, a hand-edited record). Callers render a fallback.
 */
export async function resolveIcon(
  library: string,
  name: string,
): Promise<IconType | null> {
  if (!isIconLibrary(library)) return null;
  const mod = await loadIconLibrary(library);
  return mod[name] ?? null;
}

/** Synchronous peek, so an already-loaded icon renders without a flash. */
export function resolveIconSync(
  library: string,
  name: string,
): IconType | null {
  if (!isIconLibrary(library)) return null;
  return moduleCache.get(library)?.[name] ?? null;
}

let indexPromise: Promise<IconIndex> | null = null;

/** Builds the searchable index once per session. Client-side only. */
export function loadIconIndex(): Promise<IconIndex> {
  if (indexPromise) return indexPromise;

  indexPromise = Promise.all(
    (["si", "lu", "fa6"] as const).map(async (library) => {
      const mod = await loadIconLibrary(library);
      const entries: IconEntry[] = [];
      for (const name of Object.keys(mod)) {
        // The modules also export a few non-component helpers.
        if (!/^(Si|Lu|Fa)[A-Z0-9]/.test(name)) continue;
        const label = toIconLabel(library, name);
        entries.push({
          id: `${library}:${name}`,
          library,
          name,
          label,
          labelLower: label.toLowerCase(),
          slug: name.replace(/^(Si|Lu|Fa)/, "").toLowerCase(),
        });
      }
      return entries;
    }),
  ).then((groups) => {
    const entries = groups.flat();
    return { entries, byId: new Map(entries.map((e) => [e.id, e])) };
  });

  return indexPromise;
}

/* -------------------------------------------------------------------------
   Search
   ------------------------------------------------------------------------- */

export const ICON_RESULT_LIMIT = 60;

/** Shown before anyone types — a spread that suggests what the picker holds. */
export const DEFAULT_ICON_IDS: string[] = [
  "lu:LuStickyNote",
  "lu:LuNotebookPen",
  "lu:LuFileText",
  "lu:LuLightbulb",
  "lu:LuStar",
  "lu:LuFlag",
  "lu:LuBookmark",
  "lu:LuTarget",
  "lu:LuRocket",
  "lu:LuBug",
  "lu:LuListTodo",
  "lu:LuCalendarDays",
  "lu:LuClock",
  "lu:LuUsers",
  "lu:LuMessageSquare",
  "lu:LuBrain",
  "lu:LuSparkles",
  "lu:LuFlame",
  "lu:LuHeart",
  "lu:LuCoffee",
  "lu:LuBookOpen",
  "lu:LuGraduationCap",
  "lu:LuChartLine",
  "lu:LuDollarSign",
  "lu:LuShieldCheck",
  "lu:LuKeyRound",
  "lu:LuTerminal",
  "lu:LuCode",
  "lu:LuDatabase",
  "lu:LuServer",
  "lu:LuCloud",
  "lu:LuGitBranch",
  "lu:LuPackage",
  "lu:LuLayers",
  "lu:LuWorkflow",
  "lu:LuPalette",
  "si:SiTypescript",
  "si:SiJavascript",
  "si:SiReact",
  "si:SiNextdotjs",
  "si:SiNodedotjs",
  "si:SiPython",
  "fa6:FaJava",
  "si:SiOpenjdk",
  "si:SiSpring",
  "si:SiGo",
  "si:SiRust",
  "si:SiPostgresql",
  "si:SiRedis",
  "si:SiDocker",
  "si:SiKubernetes",
  "si:SiGit",
  "si:SiGithub",
  "si:SiTailwindcss",
  "si:SiFigma",
  "si:SiPrisma",
];

/**
 * Alias ids for a query, best first. Exact key wins; otherwise every key the
 * query is a prefix of contributes, shortest key first, so "jav" behaves like
 * "java" without waiting for the last letter.
 */
function aliasIdsFor(query: string): string[] {
  const exact = ICON_ALIASES[query];
  if (exact) return exact;

  const keys = Object.keys(ICON_ALIASES)
    .filter((key) => key.startsWith(query))
    .sort((a, b) => a.length - b.length);

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const key of keys) {
    for (const id of ICON_ALIASES[key]) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Rank tiers, lowest first:
 *   0 exact label or slug match
 *   1 alias hit (ordered by the alias table)
 *   2 label / slug starts with the query
 *   3 a later word of the label starts with the query
 *   4 substring anywhere
 */
function textRank(entry: IconEntry, q: string): number | null {
  if (entry.labelLower === q || entry.slug === q) return 0;
  if (entry.labelLower.startsWith(q) || entry.slug.startsWith(q)) return 2;
  if (entry.labelLower.includes(` ${q}`)) return 3;
  if (entry.labelLower.includes(q) || entry.slug.includes(q)) return 4;
  return null;
}

export function searchIcons(
  index: IconIndex,
  rawQuery: string,
  libraries: IconLibrary[],
  limit: number = ICON_RESULT_LIMIT,
): IconEntry[] {
  const allowed = new Set(libraries);
  const q = rawQuery.trim().toLowerCase();

  if (!q) {
    const defaults: IconEntry[] = [];
    for (const id of DEFAULT_ICON_IDS) {
      const entry = index.byId.get(id);
      if (entry && allowed.has(entry.library)) defaults.push(entry);
      if (defaults.length >= limit) break;
    }
    return defaults;
  }

  type Scored = { entry: IconEntry; rank: number; order: number };
  const scored = new Map<string, Scored>();

  const consider = (entry: IconEntry, rank: number, order: number) => {
    if (!allowed.has(entry.library)) return;
    const existing = scored.get(entry.id);
    if (existing && existing.rank <= rank) return;
    scored.set(entry.id, { entry, rank, order });
  };

  aliasIdsFor(q).forEach((id, i) => {
    const entry = index.byId.get(id);
    // An alias pointing at a renamed icon should not break the search.
    if (entry) consider(entry, 1, i);
  });

  for (const entry of index.entries) {
    const rank = textRank(entry, q);
    if (rank !== null) consider(entry, rank, entry.label.length);
  }

  return [...scored.values()]
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.order - b.order ||
        a.entry.label.localeCompare(b.entry.label),
    )
    .slice(0, limit)
    .map((s) => s.entry);
}
