#!/usr/bin/env node

/**
 * 🐧 SKForge — AI-Native Software Blueprints
 * Don't use software. Forge your own.
 *
 * smilinTux — Helping architect our quantum future, one smile at a time.
 * Making Self-Hosting & Decentralized Systems Cool Again
 *
 * Apache 2.0 | https://skforge.io
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VERSION = '0.2.0';
const FORGE_HOME = process.env.FORGE_HOME || join(homedir(), '.skforge');
const BLUEPRINTS_DIR = join(__dirname, 'blueprints');

const GITHUB_OWNER = 'smilinTux';
const GITHUB_REPO = 'skforge';
const GITHUB_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/blueprints`;
const GITHUB_RAW = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/blueprints`;

// ─── Colors ──────────────────────────────────────────────────────────
const c = {
  red: s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  cyan: s => `\x1b[36m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
  dim: s => `\x1b[2m${s}\x1b[0m`,
};

// ─── Helpers ─────────────────────────────────────────────────────────
function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer.trim()); }));
}

function penguin() {
  console.log(`
    🐧 ${c.bold('SKForge')} v${VERSION}
    ${c.dim("Don't use software. Forge your own.")}
  `);
}

function getCategories() {
  if (!existsSync(BLUEPRINTS_DIR)) return [];
  return readdirSync(BLUEPRINTS_DIR)
    .filter(d => d !== 'TEMPLATE' && statSync(join(BLUEPRINTS_DIR, d)).isDirectory());
}

function countFeatures(category) {
  const featuresFile = join(BLUEPRINTS_DIR, category, 'features.yml');
  if (!existsSync(featuresFile)) return '?';
  const content = readFileSync(featuresFile, 'utf8');
  return (content.match(/^\s+- name:/gm) || []).length;
}

// ─── GitHub helpers ──────────────────────────────────────────────────

async function httpGet(url) {
  const { get } = await import('node:https');
  return new Promise((resolve, reject) => {
    get(url, { headers: { 'User-Agent': 'skforge-cli', Accept: 'application/json' }, timeout: 10_000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location).then(resolve, reject);
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
      });
    }).on('error', reject);
  });
}

async function fetchRemoteCategories() {
  try {
    const raw = await httpGet(GITHUB_API);
    const entries = JSON.parse(raw);
    return entries
      .filter(e => e.type === 'dir' && e.name !== 'TEMPLATE')
      .map(e => e.name);
  } catch (err) {
    return null; // offline — caller falls back to local
  }
}

async function fetchRemoteFile(category, filename) {
  try {
    return await httpGet(`${GITHUB_RAW}/${category}/${filename}`);
  } catch {
    return null;
  }
}

async function fetchRemoteFeatures(category) {
  const yml = await fetchRemoteFile(category, 'features.yml');
  if (!yml) return '?';
  return (yml.match(/^\s+- name:/gm) || []).length;
}

async function fetchRemoteBlueprint(category) {
  return fetchRemoteFile(category, 'BLUEPRINT.md');
}

// Merge local + remote categories (remote wins for freshness)
async function getAllCategories() {
  const local = getCategories();
  const remote = await fetchRemoteCategories();
  if (!remote) return { categories: local, source: 'local' };

  const merged = [...new Set([...remote, ...local])].sort();
  return { categories: merged, source: 'github', remoteOnly: remote.filter(r => !local.includes(r)) };
}

// ─── Commands ────────────────────────────────────────────────────────

async function cmdHelp() {
  penguin();
  console.log(`${c.bold('USAGE')}
  forge <command> [options]

${c.bold('COMMANDS')}
  ${c.green('onboard')}       Interactive setup wizard (like openclaw onboard)
  ${c.green('init')}          Create a driver.md for a blueprint category
  ${c.green('build')}         Generate code from driver.md + blueprint (requires AI)
  ${c.green('list')}          Browse available blueprint categories
  ${c.green('info')}    ${c.dim('<cat>')}  Show details for a specific blueprint
  ${c.green('search')} ${c.dim('<q>')}    Search blueprints and features
  ${c.green('doctor')}        Check your setup (AI providers, tools)
  ${c.green('update')}  ${c.dim('[cat]')}  Pull latest blueprints from GitHub
  ${c.green('serve')}         Launch web UI + blueprint marketplace
  ${c.green('new')}     ${c.dim('<name>')} Create a new blueprint scaffold
  ${c.green('contribute')} ${c.dim('<cat>')} Submit a blueprint to the community
  ${c.green('version')}       Show version

${c.bold('INSTALL')}
  npm install -g skforge        ${c.dim('# npm')}
  pnpm add -g skforge           ${c.dim('# pnpm')}
  curl -fsSL skforge.io/install.sh | sh  ${c.dim('# shell')}

${c.bold('QUICK START')}
  forge onboard                    ${c.dim('# guided wizard')}
  forge init load-balancers        ${c.dim('# create driver.md')}
  forge build                      ${c.dim('# AI generates code')}

${c.bold('ENVIRONMENT')}
  FORGE_AI          ${c.dim('AI provider: openai|anthropic|ollama|moonshot (auto-detect)')}
  FORGE_MODEL       ${c.dim('Model override')}
  FORGE_API_KEY     ${c.dim('API key for cloud providers')}
  ANTHROPIC_API_KEY ${c.dim('Anthropic Claude key')}
  OPENAI_API_KEY    ${c.dim('OpenAI key')}
  MOONSHOT_API_KEY  ${c.dim('Moonshot/Kimi key')}

${c.dim('Making Self-Hosting & Decentralized Systems Cool Again 🐧')}
${c.dim('smilinTux — Helping architect our quantum future, one smile at a time.')}
`);
}

async function cmdVersion() {
  console.log(`forge v${VERSION}`);
}

async function cmdList() {
  penguin();
  console.log(c.bold('Available Blueprints\n'));

  const { categories, source, remoteOnly } = await getAllCategories();
  if (categories.length === 0) {
    console.log(c.yellow('  No blueprints found. Run: forge update'));
    return;
  }

  for (const cat of categories) {
    const isLocal = existsSync(join(BLUEPRINTS_DIR, cat));
    const features = isLocal ? countFeatures(cat) : '?';
    let desc = '';
    if (isLocal) {
      const bpFile = join(BLUEPRINTS_DIR, cat, 'BLUEPRINT.md');
      if (existsSync(bpFile)) {
        const lines = readFileSync(bpFile, 'utf8').split('\n');
        desc = lines.find(l => l.trim() && !l.startsWith('#')) || '';
        desc = desc.trim().slice(0, 60);
      }
    }
    const badge = !isLocal ? c.dim(' [remote]') : '';
    console.log(`  ${c.green(cat.padEnd(25))} ${c.dim(`${features} features`)}  ${desc}${badge}`);
  }

  if (source === 'github') {
    console.log(`\n  ${c.dim(`${categories.length} categories from GitHub`)}`);
    if (remoteOnly && remoteOnly.length > 0) {
      console.log(`  ${c.dim(`${remoteOnly.length} remote-only — run 'forge update' to download`)}`);
    }
  } else {
    console.log(`\n  ${c.dim('(offline — showing local blueprints only)')}`);
  }

  console.log(`\n${c.dim("Run 'forge info <category>' for details")}`);
  console.log(c.dim("Run 'forge search <query>' to find specific features"));
  console.log(c.dim("Don't see what you need? Run 'forge search <idea>' to generate one"));
}

async function cmdInfo(category) {
  if (!category) {
    console.log(c.red("Usage: forge info <category>"));
    return;
  }

  const bpDir = join(BLUEPRINTS_DIR, category);
  const isLocal = existsSync(bpDir);

  if (!isLocal) {
    // Try fetching from GitHub
    console.log(c.dim(`  Not installed locally — checking GitHub...`));
    const remoteBp = await fetchRemoteBlueprint(category);
    if (!remoteBp) {
      console.log(c.red(`Blueprint '${category}' not found locally or on GitHub.`));
      console.log(c.dim("Run 'forge list' to see available categories"));
      console.log(c.dim(`Run 'forge search ${category}' to create a new one`));
      return;
    }
    penguin();
    console.log(c.bold(`Blueprint: ${category} ${c.dim('[remote]')}\n`));
    console.log(remoteBp.split('\n').slice(0, 40).join('\n'));
    const remoteFeatures = await fetchRemoteFeatures(category);
    console.log(`\n${c.cyan(`Features: ${remoteFeatures} available`)}`);
    console.log(`\n${c.dim(`Run 'forge update ${category}' to install locally`)}`);
    return;
  }

  penguin();
  console.log(c.bold(`Blueprint: ${category}\n`));

  const bpFile = join(bpDir, 'BLUEPRINT.md');
  if (existsSync(bpFile)) {
    const content = readFileSync(bpFile, 'utf8');
    console.log(content.split('\n').slice(0, 40).join('\n'));
    console.log(c.dim('\n... (full spec in BLUEPRINT.md)'));
  }

  console.log(`\n${c.cyan(`Features: ${countFeatures(category)} available`)}`);

  console.log(`\n${c.bold('Files:')}`);
  function listFiles(dir, prefix = '') {
    for (const f of readdirSync(dir)) {
      const full = join(dir, f);
      if (statSync(full).isDirectory()) {
        listFiles(full, `${prefix}${f}/`);
      } else {
        console.log(`  ${prefix}${f}`);
      }
    }
  }
  listFiles(bpDir);
}

async function cmdOnboard() {
  penguin();
  console.log(c.bold('🔨 Welcome to SKForge!\n'));
  console.log("Let's get you set up to forge custom software.\n");

  // Step 1: Check AI provider
  console.log(c.bold('Step 1: AI Provider\n'));

  const providers = [];
  try { execSync('ollama --version', { stdio: 'pipe' }); providers.push('ollama'); } catch {}
  if (process.env.ANTHROPIC_API_KEY) providers.push('anthropic');
  if (process.env.OPENAI_API_KEY) providers.push('openai');
  if (process.env.MOONSHOT_API_KEY) providers.push('moonshot');

  if (providers.length > 0) {
    console.log(`  ${c.green('✓')} Found: ${providers.join(', ')}`);
  } else {
    console.log(`  ${c.yellow('!')} No AI provider detected.\n`);
    console.log('  Options:');
    console.log(`    ${c.cyan('a)')} Install Ollama (free, local): ${c.dim('https://ollama.ai')}`);
    console.log(`    ${c.cyan('b)')} Set ANTHROPIC_API_KEY for Claude`);
    console.log(`    ${c.cyan('c)')} Set OPENAI_API_KEY for GPT`);
    console.log(`    ${c.cyan('d)')} Set MOONSHOT_API_KEY for Kimi`);
    console.log('');
    const choice = await ask('  Choose (a/b/c/d) or press Enter to skip: ');
    if (choice === 'a') {
      console.log(`\n  ${c.cyan('Install Ollama:')} curl -fsSL https://ollama.ai/install.sh | sh`);
      console.log(`  ${c.dim('Then run: ollama pull qwen2.5:32b')}\n`);
    }
  }

  // Step 2: Pick a blueprint
  console.log(`\n${c.bold('Step 2: Pick Your First Blueprint')}\n`);

  const { categories } = await getAllCategories();
  categories.forEach((cat, i) => {
    const isLocal = existsSync(join(BLUEPRINTS_DIR, cat));
    const features = isLocal ? countFeatures(cat) : '?';
    const badge = isLocal ? '' : c.dim(' [remote]');
    console.log(`  ${c.green(`${i + 1})`)} ${cat} ${c.dim(`(${features} features)`)}${badge}`);
  });

  const catChoice = await ask('\n  Choose (number or name): ');
  let category;
  const idx = parseInt(catChoice) - 1;
  if (idx >= 0 && idx < categories.length) {
    category = categories[idx];
  } else {
    category = catChoice;
  }

  console.log(`\n  ${c.green('✓')} Blueprint: ${c.bold(category)}`);

  // Step 3: Pick language
  console.log(`\n${c.bold('Step 3: Choose Your Language')}\n`);

  const languages = ['rust', 'go', 'python', 'java', 'typescript', 'dotnet', 'zig', 'c', 'cpp'];
  languages.forEach((lang, i) => {
    console.log(`  ${c.green(`${i + 1})`)} ${lang}`);
  });

  const langChoice = await ask('\n  Choose (number or name): ');
  let lang;
  const langIdx = parseInt(langChoice) - 1;
  if (langIdx >= 0 && langIdx < languages.length) {
    lang = languages[langIdx];
  } else {
    lang = langChoice;
  }

  console.log(`\n  ${c.green('✓')} Language: ${c.bold(lang)}`);

  // Step 4: Generate driver.md
  console.log(`\n${c.bold('Step 4: Creating driver.md')}\n`);

  const driverContent = generateDriver(category, lang);
  writeFileSync('driver.md', driverContent);

  console.log(`  ${c.green('✓')} Created ${c.bold('driver.md')}`);

  // Done
  console.log(`
${c.green('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}
${c.green('  ✅ Setup complete!')}
${c.green('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}

  ${c.bold('Next steps:')}
  1. Edit ${c.cyan('driver.md')} — check/uncheck features you want
  2. Run  ${c.cyan('forge build')} — AI generates your custom software
  3. Run  ${c.cyan('forge test')}  — validate against blueprint specs

  ${c.dim('Tip: Run "forge info ' + category + '" to read the full blueprint')}

  ${c.green('Happy forging! 🐧')}
`);
}

function generateDriver(category, lang) {
  let content = `# driver.md — My Custom ${category.replace(/-/g, ' ')}

## Blueprint
category: ${category}

## Language
target: ${lang}

## Profile
hardware: server
memory: standard

## Features
<!-- Select features below. [x] = include, [ ] = skip -->

`;

  // Try to parse features from features.yml
  const featuresFile = join(BLUEPRINTS_DIR, category, 'features.yml');
  if (existsSync(featuresFile)) {
    const yml = readFileSync(featuresFile, 'utf8');
    const lines = yml.split('\n');
    let currentGroup = '';

    for (const line of lines) {
      // Group headers
      const groupMatch = line.match(/^  - name:\s*(.+)/);
      if (groupMatch) {
        content += `\n### ${groupMatch[1].trim()}\n`;
        continue;
      }
      // Feature names (deeper indent)
      const featMatch = line.match(/^\s{6,}- name:\s*(.+)/);
      if (featMatch) {
        content += `- [x] ${featMatch[1].trim()}\n`;
      }
    }
  }

  content += `
## Build
auto-test: true
auto-benchmark: false
output: ./${category}-custom/
`;

  return content;
}

async function cmdInit(category) {
  if (!category) {
    return cmdOnboard();
  }

  const lang = process.argv[4] || await ask('Language (rust/go/python/java/typescript): ');
  const driverContent = generateDriver(category, lang);
  writeFileSync('driver.md', driverContent);
  console.log(`${c.green('✓')} Created driver.md for ${c.bold(category)} (${lang})`);
  console.log(c.dim("Edit features, then run 'forge build'"));
}

async function cmdBuild(driverPath = 'driver.md') {
  if (!existsSync(driverPath)) {
    console.log(c.red('No driver.md found. Run: forge init'));
    return;
  }

  penguin();
  const driver = readFileSync(driverPath, 'utf8');

  // Parse category and language
  const catMatch = driver.match(/^category:\s*(.+)/m);
  const langMatch = driver.match(/^target:\s*(.+)/m);

  if (!catMatch) {
    console.log(c.red("No 'category:' in driver.md"));
    return;
  }

  const category = catMatch[1].trim();
  const lang = langMatch ? langMatch[1].trim() : 'rust';
  const bpDir = join(BLUEPRINTS_DIR, category);

  if (!existsSync(bpDir)) {
    console.log(c.red(`Blueprint '${category}' not found.`));
    return;
  }

  console.log(c.bold(`🔨 Forging: ${category} → ${lang}\n`));

  // Collect all blueprint context
  const context = [];
  context.push('=== DRIVER CONFIGURATION ===');
  context.push(driver);

  const files = ['BLUEPRINT.md', 'features.yml', 'architecture.md'];
  for (const f of files) {
    const fp = join(bpDir, f);
    if (existsSync(fp)) {
      context.push(`\n=== ${f.toUpperCase()} ===`);
      context.push(readFileSync(fp, 'utf8'));
    }
  }

  // Memory profiles
  const memMatch = driver.match(/^memory:\s*(.+)/m);
  const memProfile = memMatch ? memMatch[1].trim() : 'standard';
  const memFile = join(bpDir, 'memory-profiles', `${memProfile}.md`);
  if (existsSync(memFile)) {
    context.push('\n=== MEMORY MANAGEMENT ===');
    context.push(readFileSync(memFile, 'utf8'));
  }

  // Tests
  const testsDir = join(bpDir, 'tests');
  if (existsSync(testsDir)) {
    for (const tf of readdirSync(testsDir)) {
      context.push(`\n=== TEST: ${tf} ===`);
      context.push(readFileSync(join(testsDir, tf), 'utf8'));
    }
  }

  const fullContext = context.join('\n');
  const contextKB = Math.round(Buffer.byteLength(fullContext) / 1024);
  console.log(`  ${c.green('✓')} Loaded ${c.dim(`${contextKB}KB`)} of blueprint context`);

  // Detect AI
  let provider = process.env.FORGE_AI || '';
  if (!provider) {
    if (process.env.ANTHROPIC_API_KEY) provider = 'anthropic';
    else if (process.env.OPENAI_API_KEY) provider = 'openai';
    else if (process.env.MOONSHOT_API_KEY) provider = 'moonshot';
    else {
      try { execSync('ollama --version', { stdio: 'pipe' }); provider = 'ollama'; } catch {}
    }
  }

  if (!provider) {
    console.log(c.red('\n  No AI provider found. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, MOONSHOT_API_KEY, or install Ollama.'));
    console.log(c.dim('  Run: forge doctor'));
    return;
  }

  console.log(`  ${c.green('✓')} AI: ${provider}`);
  console.log(`\n  ${c.yellow('🔨 Forging...')} ${c.dim('(this may take a few minutes)')}\n`);

  // The actual AI call would go here
  // For now, output instructions
  console.log(`  ${c.bold('To forge manually:')}`);
  console.log(`  1. Copy the blueprint context (${contextKB}KB) to your AI`);
  console.log(`  2. Ask it to generate a complete ${lang} implementation`);
  console.log(`  3. The AI should follow all specs in BLUEPRINT.md`);
  console.log(`\n  ${c.dim('Full AI integration coming in v0.2.0')}`);
  console.log(`\n  ${c.dim('For now, try:')}`);
  console.log(`  ${c.cyan(`cat driver.md blueprints/${category}/*.md | pbcopy`)}`);
  console.log(`  ${c.dim('Then paste into Claude, GPT, or Kimi')}\n`);
}

async function cmdDoctor() {
  penguin();
  console.log(c.bold('🩺 Forge Doctor\n'));

  // Blueprints
  const cats = getCategories();
  if (cats.length > 0) {
    console.log(`  ${c.green('✓')} Blueprints: ${cats.length} categories`);
  } else {
    console.log(`  ${c.red('✗')} No blueprints found`);
  }

  // AI Providers
  console.log(`\n  ${c.bold('AI Providers:')}`);
  try {
    execSync('ollama --version', { stdio: 'pipe' });
    console.log(`  ${c.green('✓')} Ollama installed`);
  } catch {
    console.log(`  ${c.dim('○')} Ollama not installed`);
  }

  console.log(process.env.ANTHROPIC_API_KEY ? `  ${c.green('✓')} Anthropic key set` : `  ${c.dim('○')} ANTHROPIC_API_KEY not set`);
  console.log(process.env.OPENAI_API_KEY ? `  ${c.green('✓')} OpenAI key set` : `  ${c.dim('○')} OPENAI_API_KEY not set`);
  console.log(process.env.MOONSHOT_API_KEY ? `  ${c.green('✓')} Moonshot key set` : `  ${c.dim('○')} MOONSHOT_API_KEY not set`);

  // Tools
  console.log(`\n  ${c.bold('Tools:')}`);
  for (const tool of ['git', 'curl', 'node']) {
    try {
      execSync(`which ${tool}`, { stdio: 'pipe' });
      console.log(`  ${c.green('✓')} ${tool}`);
    } catch {
      console.log(`  ${c.red('✗')} ${tool} (required)`);
    }
  }

  console.log(`\n${c.dim("All good? Run 'forge onboard' to start!")}`);
}

async function cmdSearch(query) {
  if (!query) {
    console.log(c.red('Usage: forge search <query>'));
    return;
  }

  penguin();
  console.log(c.bold(`Searching: ${query}\n`));
  const q = query.toLowerCase();
  let hits = 0;

  // 1. Search local blueprints
  const categories = getCategories();
  for (const cat of categories) {
    const bpDir = join(BLUEPRINTS_DIR, cat);
    const files = readdirSync(bpDir, { recursive: true });
    for (const f of files) {
      const fp = join(bpDir, String(f));
      if (!statSync(fp).isFile()) continue;
      try {
        const content = readFileSync(fp, 'utf8');
        if (content.toLowerCase().includes(q)) {
          const line = content.split('\n').find(l => l.toLowerCase().includes(q));
          console.log(`  ${c.green(`blueprints/${cat}/${f}`)}`);
          console.log(`    ${c.dim(line?.trim().slice(0, 80) || '')}\n`);
          hits++;
        }
      } catch {}
    }
  }

  // 2. Search remote categories by name (for blueprints not installed locally)
  const remote = await fetchRemoteCategories();
  if (remote) {
    const remoteMatches = remote.filter(r => r.toLowerCase().includes(q) && !categories.includes(r));
    for (const cat of remoteMatches) {
      console.log(`  ${c.green(cat)} ${c.dim('[remote — not installed locally]')}`);
      console.log(`    ${c.dim(`Run: forge update ${cat}`)}\n`);
      hits++;
    }
  }

  if (hits > 0) {
    console.log(c.dim(`  ${hits} result(s) found.`));
    return;
  }

  // 3. No results — offer to generate
  console.log(c.yellow(`  No blueprints found matching "${query}".\n`));
  console.log(c.bold('  Want to create one?\n'));
  console.log(`  SKForge can generate a new blueprint for "${query}" using`);
  console.log(`  the RECON methodology — researching top products, extracting`);
  console.log(`  features, and building a complete spec.\n`);

  const answer = await ask(`  Generate a "${query}" blueprint? (y/n): `);
  if (answer.toLowerCase() !== 'y') {
    console.log(c.dim('\n  No worries. You can also request one at:'));
    console.log(c.cyan(`  https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues/new`));
    return;
  }

  await generateNewBlueprint(query);
}

async function generateNewBlueprint(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const display = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const outDir = join(BLUEPRINTS_DIR, slug);

  if (existsSync(outDir)) {
    console.log(c.yellow(`\n  Blueprint directory already exists: blueprints/${slug}/`));
    console.log(c.dim('  Edit it directly or run: forge info ' + slug));
    return;
  }

  console.log(`\n  ${c.cyan('Scaffolding blueprint:')} ${slug}\n`);

  mkdirSync(outDir, { recursive: true });
  for (const sub of ['memory-profiles', 'tests', 'deployment', 'references']) {
    mkdirSync(join(outDir, sub), { recursive: true });
  }

  // BLUEPRINT.md
  writeFileSync(join(outDir, 'BLUEPRINT.md'), `# ${display} Blueprint

> AI-native specification for building custom ${display.toLowerCase()} software.

## Overview
<!-- Describe what ${display.toLowerCase()} software does and why it exists -->

## Core Concepts
<!-- Fundamental concepts an AI needs to understand to build this -->

## Architecture Patterns
<!-- Main architectural approaches used by top implementations -->

## Data Flow
\`\`\`
<!-- ASCII diagram showing how data flows through the system -->
\`\`\`

## Configuration Model
<!-- What the user/operator configures and how -->

## Security Considerations
<!-- Security patterns specific to this category -->

## Performance Targets
<!-- Expected performance baselines by feature tier -->

## Extension Points
<!-- How the generated software can be extended after creation -->

## References
<!-- Top 10 OSS + proprietary products researched -->
`);

  // features.yml
  writeFileSync(join(outDir, 'features.yml'), `# ${display} — Feature Catalog
# Generated by forge — fill in with RECON research

groups:
  - name: Core
    description: Fundamental features every ${display.toLowerCase()} needs
    features:
      - name: TODO
        description: Research and add features here
        complexity: medium
        default: true
        dependencies: []

  - name: Security
    description: Security-related features
    features: []

  - name: Observability
    description: Monitoring, logging, and tracing
    features: []

  - name: Performance
    description: Optimization and tuning features
    features: []
`);

  // memory profiles
  for (const profile of ['embedded', 'standard', 'enterprise']) {
    writeFileSync(join(outDir, 'memory-profiles', `${profile}.md`), `# ${display} — ${profile.charAt(0).toUpperCase() + profile.slice(1)} Memory Profile\n\n<!-- Memory management patterns for ${profile} deployments -->\n`);
  }

  // tests
  writeFileSync(join(outDir, 'tests', 'unit-tests.md'), `# ${display} — Unit Tests\n\n<!-- Unit test specifications -->\n`);
  writeFileSync(join(outDir, 'tests', 'integration-tests.md'), `# ${display} — Integration Tests\n\n<!-- Integration test specifications -->\n`);
  writeFileSync(join(outDir, 'tests', 'benchmarks.md'), `# ${display} — Benchmarks\n\n<!-- Performance benchmarks -->\n`);

  console.log(`  ${c.green('Created:')} blueprints/${slug}/`);
  console.log(`    BLUEPRINT.md, features.yml, memory-profiles/, tests/\n`);

  console.log(c.bold('  Next steps:\n'));
  console.log(`  1. ${c.cyan('Research')} — study top products in the "${display}" space`);
  console.log(`     Use any AI tool: "Research top 10 ${display.toLowerCase()} products,`);
  console.log(`     extract features, architecture patterns, and test specs"`);
  console.log(`  2. ${c.cyan('Fill in')} — update BLUEPRINT.md and features.yml`);
  console.log(`  3. ${c.cyan('Contribute')} — run ${c.bold('forge contribute ' + slug)} to share it\n`);
  console.log(c.dim('  Tip: Feed RECON.md + TEMPLATE/ to an AI for a guided deep-dive'));

  return slug;
}

async function cmdContribute(category) {
  penguin();

  if (!category) {
    console.log(c.bold('Contribute a Blueprint\n'));
    console.log('  Share your blueprint with the community.\n');
    console.log(`  ${c.bold('Usage:')}`);
    console.log(`    forge contribute <category>    ${c.dim('# Submit existing blueprint')}`);
    console.log(`    forge contribute new <name>    ${c.dim('# Create + submit a new one')}`);
    console.log(`\n  ${c.bold('What happens:')}`);
    console.log(`    1. Validates your blueprint has required files`);
    console.log(`    2. Creates a fork (if needed) and branch`);
    console.log(`    3. Commits your blueprint and opens a PR`);
    console.log(`\n  ${c.dim('Requires: git, gh (GitHub CLI)')}`);
    console.log(c.dim(`  Install gh: https://cli.github.com/`));
    return;
  }

  // "forge contribute new <name>" shortcut
  if (category === 'new') {
    const name = args[1];
    if (!name) {
      console.log(c.red('Usage: forge contribute new <blueprint-name>'));
      return;
    }
    const slug = await generateNewBlueprint(name);
    if (!slug) return;
    category = slug;
  }

  const bpDir = join(BLUEPRINTS_DIR, category);
  if (!existsSync(bpDir)) {
    console.log(c.red(`Blueprint '${category}' not found locally.`));
    console.log(c.dim(`Run 'forge search ${category}' to find or create it.`));
    return;
  }

  // Validate required files
  console.log(c.bold(`Validating: ${category}\n`));
  const required = ['BLUEPRINT.md', 'features.yml'];
  let valid = true;
  for (const f of required) {
    if (existsSync(join(bpDir, f))) {
      console.log(`  ${c.green('ok')} ${f}`);
    } else {
      console.log(`  ${c.red('missing')} ${f}`);
      valid = false;
    }
  }

  // Check BLUEPRINT.md has real content (not just template)
  const bp = readFileSync(join(bpDir, 'BLUEPRINT.md'), 'utf8');
  if (bp.includes('<!-- Describe what') && bp.split('\n').length < 20) {
    console.log(`\n  ${c.yellow('Warning:')} BLUEPRINT.md appears to be the template — fill it in first.`);
    valid = false;
  }

  const features = countFeatures(category);
  console.log(`\n  Features: ${features}`);
  if (features === '?' || features < 5) {
    console.log(`  ${c.yellow('Warning:')} Aim for 50+ features for a quality blueprint.`);
  }

  if (!valid) {
    console.log(c.red('\n  Blueprint needs more work before contributing.'));
    return;
  }

  // Check for git + gh
  let hasGh = false;
  try { execSync('gh --version', { stdio: 'pipe' }); hasGh = true; } catch {}

  if (!hasGh) {
    console.log(`\n  ${c.bold('Manual contribution:')}`);
    console.log(`  1. Fork https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`);
    console.log(`  2. Copy blueprints/${category}/ into your fork`);
    console.log(`  3. Open a Pull Request\n`);
    console.log(c.dim('  Or install gh CLI for automated PR creation: https://cli.github.com/'));
    return;
  }

  console.log(`\n  ${c.cyan('Creating pull request...')}\n`);

  try {
    // Check if we're in the skforge repo
    const repoRoot = __dirname;
    const branch = `blueprint/${category}`;

    execSync(`git -C "${repoRoot}" checkout -b ${branch} 2>/dev/null || git -C "${repoRoot}" checkout ${branch}`, { stdio: 'pipe' });
    execSync(`git -C "${repoRoot}" add "blueprints/${category}/"`, { stdio: 'pipe' });
    execSync(`git -C "${repoRoot}" commit -m "feat(blueprint): add ${category} blueprint"`, { stdio: 'pipe' });
    execSync(`git -C "${repoRoot}" push -u origin ${branch}`, { stdio: 'pipe' });

    const prUrl = execSync(
      `gh pr create --repo ${GITHUB_OWNER}/${GITHUB_REPO} --title "feat(blueprint): add ${category}" --body "New blueprint: **${category}**\n\nGenerated via \\\`forge contribute\\\`.\n\nFeatures: ${features}"`,
      { stdio: 'pipe', cwd: repoRoot }
    ).toString().trim();

    console.log(`  ${c.green('PR created:')} ${prUrl}\n`);
  } catch (err) {
    console.log(`  ${c.yellow('Auto-PR failed.')} You can submit manually:\n`);
    console.log(`  1. cd ${__dirname}`);
    console.log(`  2. git checkout -b blueprint/${category}`);
    console.log(`  3. git add blueprints/${category}/`);
    console.log(`  4. git commit -m "feat(blueprint): add ${category}"`);
    console.log(`  5. gh pr create --repo ${GITHUB_OWNER}/${GITHUB_REPO}\n`);
    console.log(c.dim(`  Error: ${err.message?.split('\n')[0] || err}`));
  }
}

async function cmdStack(stackFile) {
  if (!stackFile) {
    console.log(c.red('Usage: forge stack <stack.yml>'));
    console.log(c.dim('  Compose a full vertical stack from multiple blueprints'));
    console.log();
    console.log(c.cyan('  Pre-built templates:'));
    console.log(`    ${c.green('saas-starter')}      Gateway + Web + DB + Cache + Queue`);
    console.log(`    ${c.green('ai-platform')}       Gateway + DB + Vectors + Graph + Queue + Storage`);
    console.log(`    ${c.green('enterprise')}        Full 9-layer production stack`);
    console.log(`    ${c.green('notion-killer')}     Gateway + Web + DB + Search + Storage + Realtime`);
    console.log(`    ${c.green('zero-trust')}        Gateway + Secrets + DB + Vectors + Graph + Storage`);
    console.log();
    console.log(c.dim('  See STACKS.md for full documentation'));
    return;
  }

  // Check if it's a template name or a file
  const templates = ['saas-starter', 'ai-platform', 'enterprise', 'notion-killer', 'zero-trust'];
  if (templates.includes(stackFile)) {
    console.log(`\n    🐧 ${c.bold('SKForge')} v${VERSION} — Stack Composer\n`);
    console.log(c.cyan(`🏗️  Stack template: ${stackFile}`));
    console.log();
    const stacks = {
      'saas-starter': ['api-gateways', 'web-servers', 'databases', 'key-value-stores', 'message-queues'],
      'ai-platform': ['api-gateways', 'databases', 'vector-databases', 'graph-databases', 'message-queues', 'object-storage'],
      'enterprise': ['api-gateways', 'web-servers', 'databases', 'key-value-stores', 'search-engines', 'message-queues', 'secret-management', 'container-orchestrators', 'workflow-orchestrators'],
      'notion-killer': ['api-gateways', 'web-servers', 'databases', 'search-engines', 'object-storage', 'message-queues'],
      'zero-trust': ['api-gateways', 'secret-management', 'databases', 'vector-databases', 'graph-databases', 'object-storage', 'container-orchestrators'],
    };
    const layers = stacks[stackFile];
    console.log(`  ${c.bold('Layers:')}`);
    layers.forEach((l, i) => {
      const exists = existsSync(join(BLUEPRINTS_DIR, l, 'BLUEPRINT.md'));
      const status = exists ? c.green('✅ ready') : c.dim('📋 planned');
      console.log(`    ${i + 1}. ${c.cyan(l.padEnd(28))} ${status}`);
    });
    console.log();
    const ready = layers.filter(l => existsSync(join(BLUEPRINTS_DIR, l, 'BLUEPRINT.md'))).length;
    console.log(`  ${c.green(`${ready}/${layers.length}`)} blueprints available`);
    if (ready < layers.length) {
      console.log(c.dim(`  Remaining blueprints coming soon — contribute at github.com/smilinTux/skforge`));
    }
    console.log();
    console.log(c.dim('  Full stack building coming in v0.2.0'));
    console.log(c.dim('  For now: forge init <blueprint> to build individual layers'));
    return;
  }

  // File-based stack
  if (!existsSync(stackFile)) {
    console.log(c.red(`Stack file not found: ${stackFile}`));
    return;
  }
  console.log(`\n    🐧 ${c.bold('SKForge')} v${VERSION} — Stack Composer\n`);
  console.log(c.cyan(`🏗️  Loading stack: ${stackFile}`));
  console.log(c.dim('  Stack composition from YAML coming in v0.2.0'));
  console.log(c.dim('  See STACKS.md for the stack.yml format'));
}

async function cmdUpdate(category) {
  penguin();
  console.log(c.bold('Updating blueprints from GitHub...\n'));

  const remote = await fetchRemoteCategories();
  if (!remote) {
    console.log(c.red('  Cannot reach GitHub. Check your connection.'));
    console.log(c.dim('  Or update via npm: npm update -g skforge'));
    return;
  }

  // If a specific category is given, just download that one
  const toDownload = category ? [category] : remote;

  let downloaded = 0;
  let skipped = 0;

  for (const cat of toDownload) {
    if (category && !remote.includes(cat)) {
      console.log(c.red(`  Blueprint '${cat}' not found in remote registry.`));
      return;
    }

    const localDir = join(BLUEPRINTS_DIR, cat);
    const bpExists = existsSync(join(localDir, 'BLUEPRINT.md'));

    // Skip existing unless forced or specific category requested
    if (bpExists && !category) {
      skipped++;
      continue;
    }

    // Download key files
    const files = ['BLUEPRINT.md', 'features.yml', 'architecture.md'];
    let gotAny = false;

    for (const fname of files) {
      const content = await fetchRemoteFile(cat, fname);
      if (content) {
        mkdirSync(localDir, { recursive: true });
        writeFileSync(join(localDir, fname), content);
        gotAny = true;
      }
    }

    if (gotAny) {
      const features = countFeatures(cat);
      console.log(`  ${c.green('+')} ${cat} ${c.dim(`(${features} features)`)}`);
      downloaded++;
    }
  }

  if (downloaded > 0) {
    console.log(`\n  ${c.green(`Downloaded ${downloaded} blueprint(s).`)}`);
  }
  if (skipped > 0) {
    console.log(`  ${c.dim(`${skipped} already installed (run 'forge update <name>' to refresh).`)}`);
  }
  if (downloaded === 0 && skipped > 0) {
    console.log(`\n  ${c.green('All blueprints up to date.')}`);
  }

  console.log(c.dim(`\n  ${remote.length} blueprints available at github.com/${GITHUB_OWNER}/${GITHUB_REPO}`));
}

async function cmdServe() {
  const portArg = args.indexOf('--port');
  const port = portArg !== -1 ? parseInt(args[portArg + 1]) || 3000 : 3000;

  const { startServer } = await import('./cli/serve.mjs');
  startServer(port);
}

// ─── Main ────────────────────────────────────────────────────────────
const [,, cmd, ...args] = process.argv;

const commands = {
  onboard: () => cmdOnboard(),
  init: () => cmdInit(args[0]),
  build: () => cmdBuild(args[0]),
  stack: () => cmdStack(args[0]),
  serve: () => cmdServe(),
  list: () => cmdList(),
  info: () => cmdInfo(args[0]),
  search: () => cmdSearch(args.join(' ')),
  doctor: () => cmdDoctor(),
  update: () => cmdUpdate(args[0]),
  new: () => generateNewBlueprint(args[0] || ''),
  contribute: () => cmdContribute(args[0]),
  version: () => cmdVersion(),
  '-v': () => cmdVersion(),
  '--version': () => cmdVersion(),
  help: () => cmdHelp(),
  '-h': () => cmdHelp(),
  '--help': () => cmdHelp(),
};

const handler = commands[cmd];
if (handler) {
  await handler();
} else if (!cmd) {
  await cmdHelp();
} else {
  console.log(c.red(`Unknown command: ${cmd}`));
  console.log(c.dim("Run 'forge help' for usage"));
  process.exit(1);
}
