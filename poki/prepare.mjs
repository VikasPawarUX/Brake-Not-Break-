import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const destination = process.argv[2];
if (!destination) throw new Error('Usage: node poki/prepare.mjs <new-output-directory>');
const output = resolve(destination);
await mkdir(output);

const files = [
  'style.css', 'game.js', 'radio.js', 'assets/font/OpenSans-Regular.ttf', 'assets/font/OpenSans-Bold.ttf', 'assets/font/OpenSans-OFL.txt',
  'assets/icon/gameicon.jpg', 'assets/icon/game-favicon.ico', 'assets/icon/game-favicon.png', 'assets/icon/dark.svg', 'assets/icon/light.svg', 'assets/icon/driver.svg', 'assets/icon/info.svg',
  'assets/icon/start.svg', 'assets/icon/restart.svg', 'assets/icon/sound on.svg',
  'assets/icon/sound off.svg',
];

const radioFiles = await readdir(new URL('../assets/radio/', import.meta.url));
files.push(...radioFiles.filter(name => name.endsWith('.mp3')).map(name => 'assets/radio/' + name));

for (const path of files) {
  const target = resolve(output, path);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(new URL(`../${path}`, import.meta.url), target);
}

for (const path of ['poki-platform.js', 'poki.css']) {
  await copyFile(new URL(path, import.meta.url), resolve(output, path));
}

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const page = index
  .replace(/  <script src="radio-live\.js[^"]*" defer><\/script>\n/g, '')
  .replace(/  <script src="leaderboard(?:-config)?\.js[^"]*" defer><\/script>\n/g, '')
  .replace('  <script src="game.js', '  <link rel="stylesheet" href="poki.css">\n  <script src="poki-platform.js" defer></script>\n  <script src="game.js')
  .replace(/      <img class="launch-logo"[^\n]*\n/, '')
  .replace('    <canvas id="road" aria-hidden="true"></canvas>', '    <canvas id="road" aria-hidden="true"></canvas>\n    <button id="pause-game" type="button" aria-keyshortcuts="Escape" hidden>Pause</button>')
  .replace('        <div class="panel-actions">', '        <p class="poki-controls poki-touch">Hold to brake. Release to accelerate.</p>\n        <p class="poki-controls poki-keyboard">Hold Space or ↓ to brake. Esc to pause.</p>\n        <div class="panel-actions">')
  .replace('id="edit-driver"', 'id="edit-driver" hidden');

if (page === index || /launch-logo|radio-live\.js|leaderboard(?:-config)?\.js|assets\/icon\/splash\.png/.test(page)) {
  throw new Error('The Poki HTML transformations did not match the game template.');
}
await writeFile(pathToFileURL(resolve(output, 'index.html')), page);
