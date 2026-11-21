# Bumper to Bumper

One road. Five cars. One brake.

## Run locally

Open `index.html` in a browser. The prototype uses plain HTML, CSS, and JavaScript and needs no installation or build. For reliable browser storage and for testing on a phone, run a local server from this directory:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000` on your computer. On a phone connected to the same network, use your computer’s local IP address and port 8000.

## Play

The game assigns a guest nickname on the first visit. Use the Driver icon to change it, then select **Start** to drive the car shown at score zero. Hold a finger, the primary mouse button, or Space to brake. Release to pick up speed downhill. Two traffic cars travel ahead and two behind. Each run draws five distinct silhouettes from a set of seven, with the same bumper dimensions for every shape. Watch the front pair’s brake lights and the rear pair closing up for early signs of pressure. Red outlines show when the nearest car on either side is getting close. A short tick and a fading outline mark a successful near miss. A bumper collision ends the run. Select **Restart** to start immediately. The driver name, best distance, and sound preference are saved in local storage when the browser allows it.

## Locked gameplay settings

| Setting | Value |
| --- | ---: |
| Front starting gap | 35 |
| Rear starting gap | 40 |
| Base driving speed | 140 |
| Release acceleration | 140 |
| Braking strength | 160 |
| Minimum braking speed | 35 |
| Terrain bump height | 0 |
| Terrain bump frequency | 1 |
| Suspension strength | 1 |
| AI aggression | 34 |
| Difficulty progression | 1 |

The game uses these values on every run. Gaps are measured bumper to bumper. Speed uses road units per second, and acceleration uses road units per second squared. The road is straight and downhill. The live distance stays in one spot behind the mountains and rolls upward in 5-metre steps. On a collision, the score freezes at the exact final distance. The bottom panel shows your best score and Restart, and the top ten drivers appear in the horizontal strip. The crash warning keeps jiggling while the results are visible unless Reduce Motion is enabled. Roadside posts become checkmarks as you pass them every 20 metres.

## Traffic progression

The first 100 metres use the original traffic. After that, front-car slowdowns and rear-car surges grow stronger and more frequent. Their timing varies slightly, and they can overlap in longer runs. Pressure builds smoothly through 250 and 400 metres and reaches its cap at 600 metres. The traffic squeeze limit and braking-room protection still apply.

## Cloudflare leaderboard

The game is configured for `https://www.vikaspawar.online/btb/`. Cloudflare
Workers serves the game and its API. D1 stores one best run per browser and displays the ten highest scores. A driver nickname is public if it reaches the top ten. Saving an empty name restores the original guest nickname. The browser stores both the guest and custom nicknames. No player accounts or Firebase services are required.

From the game directory, with Node.js and Wrangler available:

```sh
npx wrangler login
```

The configuration points to the existing Bumper to Bumper D1 database. For a new Cloudflare account, create a database with `npx wrangler d1 create bumper-to-bumper` and replace the configured database ID. Then prepare the static files, apply the schema, and deploy:

```sh
node cloudflare/prepare.mjs
npx wrangler d1 migrations apply DB --remote --config cloudflare/wrangler.jsonc
npx wrangler deploy --config cloudflare/wrangler.jsonc
```

The existing `www` record must be proxied through Cloudflare in the account
that deploys the Worker. Routes are scoped to `/btb` and `/btb/*` so the
portfolio can keep serving the rest of the domain.

The database update is atomic. Scores come from the browser and are suitable
for a casual leaderboard. If the live endpoint is unavailable, Retry and the
local best score continue to work.

For a sample board, open `index.html` directly or use `?demoLeaderboard=1` on
localhost. Sample scores appear only in those previews and are never submitted.
