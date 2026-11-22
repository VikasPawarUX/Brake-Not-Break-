import { copyFile, mkdir, rm } from 'node:fs/promises';

const files = [
  'index.html', 'style.css', 'game.js', 'scene-3d.mjs', 'leaderboard.js', 'leaderboard-config.js',
  'assets/font/OpenSans-Regular.ttf', 'assets/font/OpenSans-Bold.ttf', 'assets/font/OpenSans-OFL.txt',
  'assets/icon/gameicon.jpg', 'assets/icon/splash.png', 'assets/icon/dark.svg', 'assets/icon/light.svg',
  'assets/icon/alert.svg', 'assets/icon/edit.svg', 'assets/icon/driver.svg', 'assets/icon/start.svg', 'assets/icon/restart.svg', 'assets/icon/sound on.svg', 'assets/icon/sound off.svg',
];

await rm(new URL('./public/btb/assets/font/', import.meta.url), { recursive: true, force: true });

for (const path of files) {
  const from = new URL(`../${path}`, import.meta.url);
  const to = new URL(`./public/btb/${path}`, import.meta.url);
  await mkdir(new URL('.', to), { recursive: true });
  await copyFile(from, to);
}
