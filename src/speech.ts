// Browser speech synthesis (Web Speech API) wrapper.

function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

let cachedVoices: SpeechSynthesisVoice[] = [];

export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!isSpeechSupported()) return resolve([]);
    const existing = window.speechSynthesis.getVoices();
    if (existing.length) {
      cachedVoices = existing;
      return resolve(existing);
    }
    const handler = () => {
      cachedVoices = window.speechSynthesis.getVoices();
      resolve(cachedVoices);
    };
    window.speechSynthesis.addEventListener('voiceschanged', handler, { once: true });
    setTimeout(() => {
      cachedVoices = window.speechSynthesis.getVoices();
      resolve(cachedVoices);
    }, 600);
  });
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  return (
    cachedVoices.find((v) => v.lang === lang) ||
    cachedVoices.find((v) => v.lang && v.lang.startsWith(lang.slice(0, 2)))
  );
}

export function speak(text: string, lang = 'en-US'): void {
  if (!isSpeechSupported() || !text) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  const v = pickVoice(lang);
  if (v) u.voice = v;
  u.rate = 0.95;
  synth.speak(u);
}

// Prime the TTS engine so the first real speak() isn't delayed by a cold start.
// speechSynthesis.speak() without user activation is deprecated, so we defer the
// priming to the first user gesture — which will almost always happen before the
// user taps a word to hear it.
let warmed = false;
function prime(): void {
  if (warmed || !isSpeechSupported()) return;
  warmed = true;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch (e) {
    /* ignore — best effort */
  }
}
let armed = false;
export function warmup(): void {
  if (armed || !isSpeechSupported()) return;
  armed = true;
  const opts: AddEventListenerOptions = { once: true };
  window.addEventListener('pointerdown', prime, opts);
  window.addEventListener('keydown', prime, opts);
}
