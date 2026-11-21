# BRAKE!

One road. Five cars. One brake.

## Run locally

Open `index.html` in a browser. The prototype uses plain HTML, CSS, and JavaScript and needs no installation or build. For reliable browser storage and for testing on a phone, run a local server from this directory:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000` on your computer. On a phone connected to the same network, use your computer’s local IP address and port 8000.

## Play

Select **Play**. Hold a finger, the primary mouse button, or Space to brake. Release to pick up speed downhill. Two traffic cars travel ahead and two behind. Each run draws five distinct silhouettes from a set of seven, with the same bumper dimensions for every shape. Watch the front pair’s brake lights and the rear pair closing up for early signs of pressure. Red outlines show when the nearest car on either side is getting close. A short tick and a fading outline mark a successful near miss. A bumper collision ends the run. Select **Retry** to start immediately. The best distance and sound preference are saved in local storage when the browser allows it.

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

The game uses these values on every run. Gaps are measured bumper to bumper. Speed uses road units per second, and acceleration uses road units per second squared. The road is straight and downhill. The live distance sits above your car, and roadside posts become checkmarks as you pass them every 20 metres.
