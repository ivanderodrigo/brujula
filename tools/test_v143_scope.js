#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'assets/js/app.js');

if (!fs.existsSync(appPath)) {
  console.error('ERROR · no existe assets/js/app.js');
  process.exit(1);
}

const app = fs.readFileSync(appPath, 'utf8');

const checks = [
  ['existe BM.isICTProject', /BM\.isICTProject\s*=\s*function/],
  ['categorías TIC configurables', /ict_core_categories/],
  ['palabras TIC fuertes', /ict_strong_keywords/],
  ['autor elegible condicionado a TIC', /authorEligible\s*=\s*!!\(ict\s*&&\s*row\.externalSupport\?\.show\)/],
  ['CTA global del autor neutralizado', /BM\.injectContactCTA\s*=\s*async function\(\)\{document\.querySelectorAll\('\.contact-float'\)\.forEach\(x=>x\.remove\(\)\)\}/]
];

let failures = 0;
for (const [name, rx] of checks) {
  if (rx.test(app)) {
    console.log('OK · ' + name);
  } else {
    console.error('ERROR · ' + name);
    failures++;
  }
}

process.exit(failures ? 1 : 0);
