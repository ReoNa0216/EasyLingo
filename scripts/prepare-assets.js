const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const dest = path.join(root, 'src/vendor');
fs.mkdirSync(dest, { recursive: true });
const files = {
  'chart.js/dist/chart.umd.js': 'chart.js',
  'fullcalendar/index.global.min.js': 'fullcalendar.js',
  'marked/lib/marked.umd.js': 'marked.js',
  'mammoth/mammoth.browser.min.js': 'mammoth.js',
  'dompurify/dist/purify.min.js': 'purify.js',
  'pdfjs-dist/legacy/build/pdf.min.mjs': 'pdf.mjs',
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs': 'pdf.worker.mjs',
};
for (const [source, target] of Object.entries(files)) {
  fs.copyFileSync(path.join(root, 'node_modules', source), path.join(dest, target));
}
// Bundle only font files referenced by each stylesheet, including its OFL license.
for (const name of ['inter', 'noto-sans-sc', 'noto-sans-jp']) {
  const packageDir = path.join(root, 'node_modules/@fontsource-variable', name);
  const fontDir = path.join(dest, 'fonts', name);
  const css = fs.readFileSync(path.join(packageDir, 'index.css'), 'utf8');
  fs.mkdirSync(path.join(fontDir, 'files'), { recursive: true });
  fs.writeFileSync(path.join(fontDir, 'index.css'), css);
  for (const match of css.matchAll(/url\(['"]?(\.\/files\/[^)'"\s]+)['"]?\)/g)) {
    fs.copyFileSync(path.join(packageDir, match[1]), path.join(fontDir, match[1]));
  }
  fs.copyFileSync(path.join(packageDir, 'LICENSE'), path.join(fontDir, 'LICENSE.txt'));
}
fs.cpSync(path.join(root, 'node_modules/flag-icons/css'), path.join(dest, 'flags/css'), { recursive: true });
fs.cpSync(path.join(root, 'node_modules/flag-icons/flags'), path.join(dest, 'flags/flags'), { recursive: true });
execFileSync(process.execPath, [path.join(root, 'node_modules/tailwindcss/lib/cli.js'), '-c', 'tailwind.config.js', '-i', 'styles/tailwind.css', '-o', 'src/vendor/tailwind.css', '--minify'], { cwd: root, stdio: 'inherit' });

for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  fs.cpSync(path.join(root, 'node_modules/pdfjs-dist', directory), path.join(dest, 'pdf-data', directory), { recursive: true });
}
const licenseDir = path.join(dest, 'licenses');
fs.mkdirSync(licenseDir, { recursive: true });
for (const name of ['chart.js', 'fullcalendar', 'marked', 'mammoth', 'dompurify', 'pdfjs-dist', 'flag-icons', 'tailwindcss']) {
  const packageDir = path.join(root, 'node_modules', name);
  const license = fs.readdirSync(packageDir).find(file => /^licen[cs]e/i.test(file));
  if (license) fs.copyFileSync(path.join(packageDir, license), path.join(licenseDir, name + '.txt'));
}
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(licenseDir, 'EasyLingo.txt'));
