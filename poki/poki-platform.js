'use strict';

window.bumperPlatform = (() => {
  let sdk;
  let playing = false;
  let loaded = false;
  let ad = false;

  async function initialize() {
    const script = document.createElement('script');
    script.src = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js';
    let timer;
    try {
      sdk = await Promise.race([
        new Promise((resolve, reject) => {
          script.onload = async () => {
            try {
              const candidate = window.PokiSDK;
              await candidate.init();
              resolve(candidate);
            } catch (error) {
              reject(error);
            }
          };
          script.onerror = reject;
          document.head.append(script);
        }),
        new Promise((_, reject) => {
          timer = setTimeout(reject, 4000);
        }),
      ]);
    } catch {
      script.onload = null;
      script.onerror = null;
      script.remove();
    } finally {
      clearTimeout(timer);
    }
  }

  const ready = initialize();

  function signal(event) {
    try {
      sdk?.[event]();
    } catch {
      // SDK errors must never stop the game.
    }
  }

  return {
    ready,
    get adPlaying() { return ad; },
    loadingFinished() {
      if (loaded) return;
      loaded = true;
      signal('gameLoadingFinished');
    },
    setPlaying(active) {
      if (!loaded || ad || playing === active) return;
      playing = active;
      signal(active ? 'gameplayStart' : 'gameplayStop');
    },
    async commercialBreak(onAdStart) {
      if (!sdk) return;
      ad = true;
      try {
        onAdStart();
        await sdk.commercialBreak();
      } catch {
        // Continue the run if an ad cannot play.
      } finally {
        ad = false;
      }
    },
  };
})();

window.addEventListener('wheel', event => {
  if (!window.bumperPlatform.adPlaying) event.preventDefault();
}, { passive: false });
