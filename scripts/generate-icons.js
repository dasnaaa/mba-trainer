// Erzeugt die Android-Launcher-Icons (legacy + adaptive) direkt als PNG,
// ohne native Bildbibliotheken (sharp/@capacitor/assets sind in dieser Sandbox
// nicht installierbar, da ihr postinstall-Download von GitHub-Releases blockiert
// ist). Reines JS + pngjs reicht für ein einfaches, brand-konformes Monogramm.
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const BLUE = [0x29, 0x52, 0xe3];
const CREAM = [0xff, 0xe3, 0x8a];
const SS = 4; // Supersampling-Faktor für Kantenglättung

// "M"-Monogramm als Polygon im 108x108-Koordinatensystem (Adaptive-Icon-Konvention),
// mittig innerhalb der sicheren 66dp-Zone platziert.
const M_POLY = [
  [24, 24], [34, 24], [34, 50], [54, 66], [74, 50], [74, 24], [84, 24], [84, 84],
  [74, 84], [74, 42], [54, 58], [34, 42], [34, 84], [24, 84],
];

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function roundedRectAlpha(x, y, size, radius) {
  const cx = Math.min(Math.max(x, radius), size - radius);
  const cy = Math.min(Math.max(y, radius), size - radius);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function renderIcon(size, { withBackground }) {
  const png = new PNG({ width: size, height: size });
  const scale = size / 108;
  const radius = size * 0.18;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bgHits = 0, fgHits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          if (withBackground && roundedRectAlpha(px, py, size, radius)) bgHits++;
          if (pointInPolygon(px / scale, py / scale, M_POLY)) fgHits++;
        }
      }
      const total = SS * SS;
      const bgA = bgHits / total;
      const fgA = fgHits / total;
      const idx = (size * y + x) << 2;

      // Cream-Monogramm über Blau-Hintergrund alpha-blenden; ohne Hintergrund (Foreground-Layer) bleibt der Rest transparent.
      let r, g, b, a;
      if (withBackground) {
        r = BLUE[0] * (1 - fgA) + CREAM[0] * fgA;
        g = BLUE[1] * (1 - fgA) + CREAM[1] * fgA;
        b = BLUE[2] * (1 - fgA) + CREAM[2] * fgA;
        a = bgA;
      } else {
        r = CREAM[0]; g = CREAM[1]; b = CREAM[2]; a = fgA;
      }
      png.data[idx] = Math.round(r);
      png.data[idx + 1] = Math.round(g);
      png.data[idx + 2] = Math.round(b);
      png.data[idx + 3] = Math.round(a * 255);
    }
  }
  return png;
}

function write(png, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

const resDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

const LEGACY_SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const FOREGROUND_SIZES = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

for (const [dens, size] of Object.entries(LEGACY_SIZES)) {
  const icon = renderIcon(size, { withBackground: true });
  write(icon, path.join(resDir, `mipmap-${dens}`, 'ic_launcher.png'));
  write(icon, path.join(resDir, `mipmap-${dens}`, 'ic_launcher_round.png'));
}

for (const [dens, size] of Object.entries(FOREGROUND_SIZES)) {
  const fg = renderIcon(size, { withBackground: false });
  write(fg, path.join(resDir, `mipmap-${dens}`, 'ic_launcher_foreground.png'));
}

console.log('Icons geschrieben nach', resDir);
