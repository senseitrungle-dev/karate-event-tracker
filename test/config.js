// v1.39.1 release guard: the deployed Firebase config must be the real project, never the example template.
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'vercel', 'firebase-config.js'), 'utf8');
const win = {}; vm.runInNewContext(src, { window: win });
const c = win.KT_FIREBASE_CONFIG, fails = [];
if (!c) fails.push('vercel/firebase-config.js does not set window.KT_FIREBASE_CONFIG');
else {
  for (const k of ['apiKey', 'authDomain', 'projectId', 'appId']) if (!c[k] || /YOUR_/.test(String(c[k]))) fails.push(`KT_FIREBASE_CONFIG.${k} is missing or a placeholder`);
  if (c.projectId && c.projectId !== 'karate-event-webapp') fails.push(`projectId is "${c.projectId}", expected "karate-event-webapp"`);
}
if (fails.length) { console.error('FAIL ' + fails.join('\nFAIL ')); process.exit(1); }
console.log('PASS vercel/firebase-config.js points at Firebase project ' + c.projectId);
