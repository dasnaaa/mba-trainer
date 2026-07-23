// Kopiert die statischen Web-Assets (Quelle: Repo-Root) in www/, das Capacitor
// als webDir für die native Android-App bündelt. Einzige Quelle der Wahrheit
// bleibt index.html im Root — dieses Skript hält www/ nur synchron.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
const files = ['index.html', 'robots.txt'];

fs.mkdirSync(out, { recursive: true });
for (const f of files) {
  fs.copyFileSync(path.join(root, f), path.join(out, f));
  console.log('synced', f, '->', 'www/' + f);
}
