/**
 * SKForge Web UI — Blueprint Marketplace & Driver Builder
 *
 * Zero-dependency HTTP server that provides:
 *   - REST API for blueprint data
 *   - Self-contained SPA for browsing, searching, and configuring
 *   - Driver.md builder with feature selection
 *
 * Usage: node cli/serve.mjs [--port 3000]
 * Or:    forge serve [--port 3000]
 */

import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const BLUEPRINTS_DIR = join(ROOT, 'blueprints');

// ─── Blueprint Data ──────────────────────────────────────────────────

function getCategories() {
  if (!existsSync(BLUEPRINTS_DIR)) return [];
  return readdirSync(BLUEPRINTS_DIR)
    .filter(d => d !== 'TEMPLATE' && d !== 'LICENSE' &&
      statSync(join(BLUEPRINTS_DIR, d)).isDirectory());
}

function countFeatures(category) {
  const featuresFile = join(BLUEPRINTS_DIR, category, 'features.yml');
  if (!existsSync(featuresFile)) return 0;
  const content = readFileSync(featuresFile, 'utf8');
  return (content.match(/^\s+- name:/gm) || []).length;
}

function getBlueprintSummary(category) {
  const bpDir = join(BLUEPRINTS_DIR, category);
  const bpFile = join(bpDir, 'BLUEPRINT.md');
  let description = '';
  let excerpt = '';

  if (existsSync(bpFile)) {
    const content = readFileSync(bpFile, 'utf8');
    const lines = content.split('\n');
    description = lines.find(l => l.trim() && !l.startsWith('#'))?.trim() || '';
    excerpt = lines.slice(0, 50).join('\n');
  }

  const featureCount = countFeatures(category);

  const files = [];
  function walk(dir, prefix = '') {
    for (const f of readdirSync(dir)) {
      const full = join(dir, f);
      if (statSync(full).isDirectory()) {
        walk(full, `${prefix}${f}/`);
      } else {
        files.push(`${prefix}${f}`);
      }
    }
  }
  walk(bpDir);

  return { category, description, featureCount, files, excerpt };
}

function parseFeatures(category) {
  const featuresFile = join(BLUEPRINTS_DIR, category, 'features.yml');
  if (!existsSync(featuresFile)) return { groups: [] };

  const content = readFileSync(featuresFile, 'utf8');
  const lines = content.split('\n');
  const groups = [];
  let currentGroup = null;
  let inFeaturesList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Top-level category groups: exactly 2 spaces, word followed by colon
    // Must be followed by name/description/features children
    const groupKeyMatch = line.match(/^  (\w[\w_-]*):$/);
    if (groupKeyMatch) {
      // Peek ahead to see if this has a "name:" and "features:" child
      let hasName = false;
      let hasFeatures = false;
      for (let j = i + 1; j < lines.length && j < i + 6; j++) {
        if (lines[j].match(/^\s{4}name:/)) hasName = true;
        if (lines[j].match(/^\s{4}features:/)) hasFeatures = true;
        if (lines[j].match(/^  \w/)) break; // Next top-level key
      }
      if (hasName || hasFeatures) {
        currentGroup = { id: groupKeyMatch[1], name: '', description: '', features: [] };
        groups.push(currentGroup);
        inFeaturesList = false;
        continue;
      }
    }

    // Group name at indent 4
    if (currentGroup && !inFeaturesList) {
      const nameMatch = line.match(/^\s{4}name:\s*"?(.+?)"?\s*$/);
      if (nameMatch) {
        currentGroup.name = nameMatch[1];
        continue;
      }
      const descMatch = line.match(/^\s{4}description:\s*"?(.+?)"?\s*$/);
      if (descMatch) {
        currentGroup.description = descMatch[1];
        continue;
      }
    }

    // Features list marker
    if (line.match(/^\s{4}features:\s*$/)) {
      inFeaturesList = true;
      continue;
    }

    // Feature items (indent 6+, starting with "- name:")
    const featNameMatch = line.match(/^\s{6,}- name:\s*"?(.+?)"?\s*$/);
    if (featNameMatch && currentGroup && inFeaturesList) {
      const feature = { name: featNameMatch[1], description: '', complexity: 'medium', dependencies: [], default: 'off' };

      // Peek ahead for feature properties
      for (let j = i + 1; j < lines.length && j < i + 8; j++) {
        const next = lines[j];
        if (next.match(/^\s{6,}- name:/)) break;
        if (next.match(/^  \w/)) break; // Next top-level category
        const fDescMatch = next.match(/^\s+description:\s*"?(.+?)"?\s*$/);
        if (fDescMatch) { feature.description = fDescMatch[1]; continue; }
        const fCompMatch = next.match(/^\s+complexity:\s*"?(.+?)"?\s*$/);
        if (fCompMatch) { feature.complexity = fCompMatch[1]; continue; }
        const fDefMatch = next.match(/^\s+default:\s*"?(.+?)"?\s*$/);
        if (fDefMatch) { feature.default = fDefMatch[1]; continue; }
      }

      currentGroup.features.push(feature);
    }
  }

  // Clean up groups with no name (use id as name)
  for (const g of groups) {
    if (!g.name) g.name = g.id.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  // Filter out empty groups that have no features
  const filtered = groups.filter(g => g.features.length > 0);

  return { groups: filtered };
}

function getBlueprintDetail(category) {
  const bpDir = join(BLUEPRINTS_DIR, category);
  if (!existsSync(bpDir)) return null;

  const summary = getBlueprintSummary(category);
  const features = parseFeatures(category);

  // Read full files
  const blueprint = readFile(join(bpDir, 'BLUEPRINT.md'));
  const architecture = readFile(join(bpDir, 'architecture.md'));

  // Memory profiles
  const memDir = join(bpDir, 'memory-profiles');
  const memoryProfiles = {};
  if (existsSync(memDir)) {
    for (const f of readdirSync(memDir)) {
      const name = f.replace('.md', '');
      memoryProfiles[name] = readFile(join(memDir, f));
    }
  }

  return { ...summary, features, blueprint, architecture, memoryProfiles };
}

function readFile(path) {
  if (existsSync(path)) return readFileSync(path, 'utf8');
  return '';
}

function generateDriverMd(config) {
  const { category, language, hardware, memory, selectedFeatures } = config;
  let content = `# driver.md — My Custom ${(category || 'project').replace(/-/g, ' ')}

## Blueprint
category: ${category || 'load-balancers'}

## Language
target: ${language || 'rust'}

## Profile
hardware: ${hardware || 'server'}
memory: ${memory || 'standard'}

## Features
<!-- Select features below. [x] = include, [ ] = skip -->

`;

  if (selectedFeatures && typeof selectedFeatures === 'object') {
    for (const [group, features] of Object.entries(selectedFeatures)) {
      content += `### ${group}\n`;
      for (const feat of features) {
        const check = feat.enabled ? 'x' : ' ';
        content += `- [${check}] ${feat.name}\n`;
      }
      content += '\n';
    }
  }

  content += `## Build
auto-test: true
auto-benchmark: false
output: ./${category || 'project'}-custom/
`;

  return content;
}

// ─── API Routes ──────────────────────────────────────────────────────

function handleAPI(pathname, req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (pathname === '/api/blueprints') {
    const categories = getCategories();
    const blueprints = categories.map(c => getBlueprintSummary(c));
    return json(res, blueprints);
  }

  const detailMatch = pathname.match(/^\/api\/blueprints\/([a-z0-9-]+)$/);
  if (detailMatch) {
    const detail = getBlueprintDetail(detailMatch[1]);
    if (!detail) return notFound(res, 'Blueprint not found');
    return json(res, detail);
  }

  const featMatch = pathname.match(/^\/api\/blueprints\/([a-z0-9-]+)\/features$/);
  if (featMatch) {
    const cat = featMatch[1];
    if (!existsSync(join(BLUEPRINTS_DIR, cat))) return notFound(res, 'Blueprint not found');
    return json(res, parseFeatures(cat));
  }

  if (pathname === '/api/stacks') {
    const stacks = {
      'saas-starter': { name: 'SaaS Starter', layers: ['api-gateways', 'web-servers', 'databases', 'key-value-stores', 'message-queues'] },
      'ai-platform': { name: 'AI Platform', layers: ['api-gateways', 'databases', 'vector-databases', 'message-queues', 'object-storage'] },
      'enterprise': { name: 'Enterprise', layers: ['api-gateways', 'web-servers', 'databases', 'key-value-stores', 'search-engines', 'message-queues'] },
      'notion-killer': { name: 'Notion Killer', layers: ['api-gateways', 'web-servers', 'databases', 'search-engines', 'object-storage', 'message-queues'] },
      'zero-trust': { name: 'Zero Trust', layers: ['api-gateways', 'databases', 'vector-databases', 'object-storage'] },
    };

    // Mark which layers have blueprints
    for (const stack of Object.values(stacks)) {
      stack.layers = stack.layers.map(l => ({
        category: l,
        ready: existsSync(join(BLUEPRINTS_DIR, l, 'BLUEPRINT.md')),
      }));
    }

    return json(res, stacks);
  }

  if (pathname === '/api/search') {
    const url = new URL(req.url, `http://localhost`);
    const query = url.searchParams.get('q') || '';
    if (!query) return json(res, []);

    const results = [];
    const categories = getCategories();
    for (const cat of categories) {
      const bpDir = join(BLUEPRINTS_DIR, cat);
      let matched = false;

      // Search category name
      if (cat.includes(query.toLowerCase())) {
        results.push({ category: cat, type: 'category', match: cat });
        matched = true;
      }

      // Search blueprint content
      if (!matched) {
        const bpFile = join(bpDir, 'BLUEPRINT.md');
        if (existsSync(bpFile)) {
          const content = readFileSync(bpFile, 'utf8');
          if (content.toLowerCase().includes(query.toLowerCase())) {
            const line = content.split('\n').find(l => l.toLowerCase().includes(query.toLowerCase()));
            results.push({ category: cat, type: 'blueprint', match: line?.trim().slice(0, 120) || '' });
          }
        }
      }

      // Search features
      const featFile = join(bpDir, 'features.yml');
      if (existsSync(featFile)) {
        const content = readFileSync(featFile, 'utf8');
        if (content.toLowerCase().includes(query.toLowerCase())) {
          const line = content.split('\n').find(l => l.toLowerCase().includes(query.toLowerCase()));
          if (!results.find(r => r.category === cat)) {
            results.push({ category: cat, type: 'feature', match: line?.trim().slice(0, 120) || '' });
          }
        }
      }
    }

    return json(res, results);
  }

  if (pathname === '/api/generate-driver' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const config = JSON.parse(body);
        const driver = generateDriverMd(config);
        json(res, { driver });
      } catch (e) {
        res.writeHead(400);
        json(res, { error: e.message });
      }
    });
    return;
  }

  return notFound(res, 'Unknown API endpoint');
}

function json(res, data) {
  if (!res.headersSent) res.writeHead(200);
  res.end(JSON.stringify(data, null, 2));
}

function notFound(res, msg) {
  res.writeHead(404);
  res.end(JSON.stringify({ error: msg }));
}

// ─── SPA HTML ────────────────────────────────────────────────────────

function getSPA() {
  const spaFile = join(ROOT, 'website', 'app.html');
  if (existsSync(spaFile)) return readFileSync(spaFile, 'utf8');
  return '<h1>SKForge Web UI</h1><p>website/app.html not found</p>';
}

// ─── Server ──────────────────────────────────────────────────────────

export function startServer(port = 3000) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const pathname = url.pathname;

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    // API routes
    if (pathname.startsWith('/api/')) {
      return handleAPI(pathname, req, res);
    }

    // Serve SPA for all other routes
    const html = getSPA();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  server.listen(port, () => {
    console.log(`\n  🐧 SKForge Web UI`);
    console.log(`  ─────────────────────────────────────`);
    console.log(`  Local:   http://localhost:${port}`);
    console.log(`  API:     http://localhost:${port}/api/blueprints`);
    console.log(`  ─────────────────────────────────────`);
    console.log(`  Press Ctrl+C to stop\n`);
  });

  return server;
}

// Run directly
if (process.argv[1] === __filename || process.argv[1]?.endsWith('/serve.mjs')) {
  const portArg = process.argv.indexOf('--port');
  const port = portArg !== -1 ? parseInt(process.argv[portArg + 1]) || 3000 : 3000;
  startServer(port);
}
