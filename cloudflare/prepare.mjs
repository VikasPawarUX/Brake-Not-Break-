import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';

const files = [
  'index.html', 'style.css', 'game.js', 'scene-3d.mjs', 'radio.js', 'leaderboard.js', 'leaderboard-config.js',
  'assets/font/OpenSans-Regular.ttf', 'assets/font/OpenSans-Bold.ttf', 'assets/font/OpenSans-OFL.txt',
  'assets/icon/gameicon.jpg', 'assets/icon/game-favicon.ico', 'assets/icon/game-favicon.png', 'assets/icon/splash.png', 'assets/icon/dark.svg', 'assets/icon/light.svg',
  'assets/icon/alert.svg', 'assets/icon/edit.svg', 'assets/icon/driver.svg', 'assets/icon/info.svg', 'assets/icon/start.svg', 'assets/icon/restart.svg', 'assets/icon/sound on.svg', 'assets/icon/sound off.svg',
];

await rm(new URL('./public/btb/assets/font/', import.meta.url), { recursive: true, force: true });

await rm(new URL('./public/btb/radio-live.js', import.meta.url), { force: true });

const radioFiles = await readdir(new URL('../assets/radio/', import.meta.url));
files.push(...radioFiles.filter(name => name.endsWith('.mp3')).map(name => 'assets/radio/' + name));

for (const path of files) {
  const from = new URL(`../${path}`, import.meta.url);
  const to = new URL(`./public/btb/${path}`, import.meta.url);
  await mkdir(new URL('.', to), { recursive: true });
  await copyFile(from, to);
}
