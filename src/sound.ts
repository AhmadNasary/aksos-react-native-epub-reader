// Page-turn sound: real recorded page flips (see README for credit), a different one each turn.
// expo-audio is optional: without it the reader is simply silent.
//
// One player per recording, and every play first waits for the rewind to finish.
// (Calling play() right after an un-awaited seekTo(0) on a player that already finished plays nothing.)
let audio: any = null;
let missing = false;
let players: any[] = [];
let last = -1;
let modeSet = false;

function sources(): any[] {
  // static requires so the bundler can find the assets
  return [
    require('./assets/page-turn-1.wav'),
    require('./assets/page-turn-2.wav'),
    require('./assets/page-turn-3.wav'),
    require('./assets/page-turn-4.wav')
  ];
}

function load(): boolean {
  if (audio) return true;
  if (missing) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    audio = require('expo-audio');
    return true;
  } catch {
    missing = true;
    return false;
  }
}

function player(i: number): any {
  if (!players[i]) {
    players[i] = audio.createAudioPlayer(sources()[i]);
    players[i].volume = 0.7;
  }
  return players[i];
}

export function playPageTurn(): void {
  if (!load()) return;
  try {
    if (!modeSet) {
      modeSet = true;
      // do not stop the user's music, and follow the silent switch
      Promise.resolve(audio.setAudioModeAsync?.({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' })).catch(() => undefined);
    }
    // random recording, never the same one twice in a row
    let i = Math.floor(Math.random() * 4);
    if (i === last) i = (i + 1) % 4;
    last = i;
    const p = player(i);
    Promise.resolve(p.seekTo(0))
      .catch(() => undefined)
      .then(() => p.play())
      .catch(() => {
        // a broken player is replaced on its next use
        players = [];
      });
  } catch {
    players = [];
  }
}
