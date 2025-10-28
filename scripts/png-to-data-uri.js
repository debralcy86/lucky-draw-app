#!/usr/bin/env node
/**
 * Simple PNG/JPEG/SVG -> data URI encoder.
 *
 * Usage:
 *   node scripts/png-to-data-uri.js <input> [output]
 *
 * - If [output] is omitted, prints the data URI to stdout.
 * - If [output] ends with .js or .ts, writes a module with a default export.
 */
const fs = require('fs');
const path = require('path');

function guessMime(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

function toDataUri(filePath) {
  const mime = guessMime(filePath);
  const buf = fs.readFileSync(filePath);
  const base64 = buf.toString('base64');
  return `data:${mime};base64,${base64}`;
}

function writeModule(outPath, dataUri) {
  const header = outPath.endsWith('.ts')
    ? ''
    : '';
  const content = `${header}const dataUri = ${JSON.stringify(dataUri)};
export default dataUri;
`;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content, 'utf8');
}

function main() {
  const [,, input, output] = process.argv;
  if (!input) {
    console.error('Usage: node scripts/png-to-data-uri.js <input> [output]');
    process.exit(1);
  }
  if (!fs.existsSync(input)) {
    console.error(`Input not found: ${input}`);
    process.exit(1);
  }
  const dataUri = toDataUri(input);
  if (!output) {
    process.stdout.write(dataUri + '\n');
    return;
  }
  if (output.endsWith('.js') || output.endsWith('.ts')) {
    writeModule(output, dataUri);
  } else {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, dataUri, 'utf8');
  }
}

main();

