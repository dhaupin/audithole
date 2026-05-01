/**
 * AUDITHOLE - build.js
 * Simple bundler using native Node.js.
 * Concatenates src modules into a single dist/audithole.min.js.
 * For production use, replace with esbuild or rollup for real minification.
 *
 * Usage: node build.js
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const files = [
  'src/escape.js',
  'src/fingerprint.js',
  'src/traps.js',
  'src/logger.js',
  'src/social.js',
  'src/audithole.js',
];

let bundle = `/**
 * audithole.min.js - v0.1.0
 * Defensive honeypot + bot fingerprinting for Cloudflare Pages.
 * MIT License - https://github.com/dhaupin/audithole
 * Deploy on infrastructure you own. See docs/ETHICS.md.
 */\n\n`;

// Naive bundler: strip import/export statements, concatenate.
// Replace with esbuild for production:
//   npx esbuild src/audithole.js --bundle --minify --outfile=dist/audithole.min.js

for (const file of files) {
  const content = readFileSync(join(__dirname, file), 'utf8');
  const stripped = content
    .replace(/^import\s+.*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^export\s+(default\s+)?/gm, '')
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
  bundle += `// --- ${file} ---\n${stripped}\n\n`;
}

mkdirSync(join(__dirname, 'dist'), { recursive: true });
writeFileSync(join(__dirname, 'dist/audithole.min.js'), bundle);
console.log('Built dist/audithole.min.js');
console.log('Tip: for production, use esbuild:');
console.log('  npx esbuild src/audithole.js --bundle --minify --outfile=dist/audithole.min.js');
