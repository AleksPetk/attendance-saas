let sharedAudioContext = null;

function audioContextConstructor(globalObject) {
  return globalObject?.AudioContext || globalObject?.webkitAudioContext || null;
}

function confirmationAudioContext(globalObject) {
  if (sharedAudioContext) return sharedAudioContext;
  const AudioContextClass = audioContextConstructor(globalObject);
  if (!AudioContextClass) return null;
  try {
    sharedAudioContext = new AudioContextClass();
  } catch {
    return null;
  }
  return sharedAudioContext;
}

export function primeConfirmationAudio({ enabled = true, globalObject = globalThis } = {}) {
  if (!enabled) return false;
  const context = confirmationAudioContext(globalObject);
  if (!context) return false;
  if (context.state === "suspended" && typeof context.resume === "function") {
    Promise.resolve(context.resume()).catch(() => {});
  }
  return true;
}

export async function playConfirmationTone({
  enabled = true,
  audioContext = null,
  globalObject = globalThis,
} = {}) {
  if (!enabled) return false;
  const context = audioContext || confirmationAudioContext(globalObject);
  if (!context) return false;

  try {
    if (context.state === "suspended" && typeof context.resume === "function") {
      await context.resume();
    }
    if (context.state === "closed") return false;

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(659.25, now);
    oscillator.frequency.exponentialRampToValueAtTime(783.99, now + 0.09);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.18);
    return true;
  } catch {
    return false;
  }
}

export function vibrateConfirmation({
  enabled = true,
  navigatorObject = globalThis?.navigator,
} = {}) {
  if (!enabled || typeof navigatorObject?.vibrate !== "function") return false;
  try {
    return Boolean(navigatorObject.vibrate(45));
  } catch {
    return false;
  }
}

export function shouldRunConfirmationEffects({
  step,
  confirmation,
  lastPresentationId,
}) {
  const presentationId = confirmation?.presentation_id;
  return Boolean(
    step === "success"
      && presentationId != null
      && presentationId !== lastPresentationId,
  );
}

export function runConfirmationEffects(
  { soundEnabled, vibrationEnabled },
  dependencies = {},
) {
  void playConfirmationTone({
    enabled: Boolean(soundEnabled),
    audioContext: dependencies.audioContext || null,
    globalObject: dependencies.globalObject || globalThis,
  });
  vibrateConfirmation({
    enabled: Boolean(vibrationEnabled),
    navigatorObject: dependencies.navigatorObject || globalThis?.navigator,
  });
}
