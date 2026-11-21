import { copyFile, mkdir } from 'node:fs/promises';

const files = [
  'index.html', 'style.css', 'game.js', 'leaderboard.js', 'leaderboard-config.js',
  'assets/font/MartianMono-Light.ttf', 'assets/font/MartianMono-Medium.ttf',
  'assets/font/OFL.txt',
  'assets/icon/tap.svg', 'assets/icon/release.svg', 'assets/icon/driver.svg', 'assets/icon/start.svg', 'assets/icon/restart.svg', 'assets/icon/sound on.svg', 'assets/icon/sound off.svg',
];

for (const path of files) {
  const from = new URL(`../${path}`, import.meta.url);
  const to = new URL(`./public/btb/${path}`, import.meta.url);
  await mkdir(new URL('.', to), { recursive: true });
  await copyFile(from, to);
}
