#!/usr/bin/env node
/** Validate sample CDR CSV headers — run: node scripts/test-cdr-parser.mjs */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sample = path.join(__dirname, '../test-data/sample-8x8-cdr.csv');
const text = fs.readFileSync(sample, 'utf8');
const header = text.split('\n')[0];
const required = ['Call ID', 'Direction', 'Caller', 'Callee', 'Answered'];
const missing = required.filter((c) => !header.includes(c));
if (missing.length) {
  console.error('Missing columns:', missing);
  process.exit(1);
}
const rows = text.trim().split('\n').length - 1;
console.log('OK — sample CSV has', rows, 'data rows and required columns');
