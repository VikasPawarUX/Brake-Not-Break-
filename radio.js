'use strict';

window.createBumperRadio = ({ panel, liveStations = [], save, preference }) => {
  const rock = ['rock-1', 'rock-2'];
  const jazz = ['jazz-1', 'jazz-2'];
  const chill = ['chill-1', 'chill-2'];
  const stations = [
    { id: 'off', title: 'OFF', subtitle: 'Radio Off' },
    { id: 'bumper', title: 'BUMPER FM', subtitle: 'Roadwave', tracks: [...rock, ...jazz, ...chill] },
    { id: 'rock', title: 'ROCK FM', subtitle: 'Overdrive', tracks: rock },
    { id: 'jazz', title: 'JAZZ FM', subtitle: 'Midnight Groove', tracks: jazz },
    { id: 'chill', title: 'CHILL FM', subtitle: 'Nightfall', tracks: chill },
  ];
  if (liveStations.length) stations.push({ id: 'live', title: 'LIVE RADIO', subtitle: 'Live.LTRB.FM' });

  const indicator = panel.querySelector('.radio-station');
  const title = panel.querySelector('.radio-title');
  const subtitle = panel.querySelector('.radio-subtitle');
  const lastTracks = new Map();
  let selected = Math.max(0, stations.findIndex(station => station.id === preference));
  let media, context, level;
  let switching = false;
  let audible = false;
  let ducked = false;
  let switchTimer, connectionTimer, duckTimer;
  let generation = 0;
  let liveIndex = -1;
  let liveName = '';

  function show(message = '') {
    subtitle.textContent = message || stations[selected].subtitle;
  }

  function updateGain() {
    if (!level) return;
    const target = audible && !switching ? (ducked ? .045 : .135) : 0;
    level.gain.setTargetAtTime(target, context.currentTime, .025);
  }

  function stop() {
    clearTimeout(connectionTimer);
    liveName = '';
    if (!media?.hasAttribute('src')) return;
    media.pause();
    media.removeAttribute('src');
    media.load();
  }

  function unavailable() {
    stop();
    show('Station unavailable');
  }

  function armConnectionTimeout() {
    clearTimeout(connectionTimer);
    connectionTimer = setTimeout(nextLiveSource, 7500);
  }

  function resume() {
    if (!audible || switching || !media?.hasAttribute('src')) return;
    const expected = generation;
    const source = media.src;
    if (liveName && media.paused) armConnectionTimeout();
    media.play().catch(error => {
      if (expected !== generation || source !== media.src || !audible || error.name === 'AbortError') return;
      if (error.name === 'NotAllowedError') {
        clearTimeout(connectionTimer);
        show('Tap to resume radio');
      } else if (liveName) {
        nextLiveSource();
      } else {
        unavailable();
      }
    });
  }

  function playTrack(station) {
    const previous = lastTracks.get(station.id);
    const choices = station.tracks.filter(track => track !== previous);
    const track = choices[Math.floor(Math.random() * choices.length)];
    lastTracks.set(station.id, track);
    media.src = 'assets/radio/' + track + '.mp3';
    resume();
  }

  function nextLiveSource() {
    stop();
    const stream = liveStations[++liveIndex];
    if (!stream) return unavailable();
    liveName = stream.name;
    show('Connecting…');
    media.src = stream.url;
    resume();
  }

  function replaceSource() {
    clearTimeout(switchTimer);
    const expected = ++generation;
    const alreadyPlaying = media?.hasAttribute('src') && !media.paused;
    switching = true;
    updateGain();
    clearTimeout(connectionTimer);
    const begin = () => {
      if (generation !== expected) return;
      stop();
      switching = false;
      updateGain();
      if (!media) return;
      const station = stations[selected];
      if (station.tracks) playTrack(station);
      else if (station.id === 'live') {
        liveIndex = -1;
        nextLiveSource();
      }
    };
    if (alreadyPlaying) switchTimer = setTimeout(begin, 115);
    else begin();
  }

  function updateStation() {
    const station = stations[selected];
    title.textContent = station.title;
    indicator.classList.toggle('is-live', station.id === 'live');
    show();
  }

  function cycle(direction) {
    selected = (selected + direction + stations.length) % stations.length;
    save(stations[selected].id);
    updateStation();
    replaceSource();
  }

  panel.querySelector('.radio-prev').addEventListener('click', () => cycle(-1));
  panel.querySelector('.radio-next').addEventListener('click', () => cycle(1));
  updateStation();

  return {
    unlock(audio) {
      if (!audio) return;
      if (media) {
        if (media.paused) resume();
        return;
      }
      context = audio.context;
      level = context.createGain();
      level.gain.value = 0;
      level.connect(audio.master);
      media = new Audio();
      media.preload = 'none';
      media.crossOrigin = 'anonymous';
      context.createMediaElementSource(media).connect(level);
      media.addEventListener('playing', () => {
        clearTimeout(connectionTimer);
        if (!switching) show();
      });
      media.addEventListener('waiting', () => {
        if (!switching && liveName && audible && !media.paused) {
          show('Buffering…');
          armConnectionTimeout();
        }
      });
      media.addEventListener('error', () => {
        if (switching || !media.error || !media.hasAttribute('src')) return;
        if (liveName) nextLiveSource();
        else unavailable();
      });
      media.addEventListener('ended', () => {
        if (switching) return;
        const station = stations[selected];
        if (station.tracks) playTrack(station);
        else if (station.id === 'live') nextLiveSource();
      });
      replaceSource();
    },
    setAudible(value) {
      if (audible === value) return;
      audible = value;
      updateGain();
      if (audible) {
        resume();
      } else {
        clearTimeout(connectionTimer);
        media?.pause();
      }
    },
    duck() {
      clearTimeout(duckTimer);
      ducked = true;
      updateGain();
      duckTimer = setTimeout(() => {
        ducked = false;
        updateGain();
      }, 650);
    },
  };
};
