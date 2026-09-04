// Pronunciation via the Web Speech API. Best-effort by design: browsers
// without a usable engine (e.g. Via and other WebView shells) get a silent
// no-op, so never assume audio plays.
import { getMeta } from './store';

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

// System TTS is only "usable" when an engine is present AND it has a voice for the language.
// Via and other WebView shells with no TTS engine expose the API but return [] here.
function isWebSpeechUsable(lang: string): boolean {
  if (!isSpeechSupported() || !cachedVoices.length) return false;
  const prefix = lang.slice(0, 2).toLowerCase();
  return cachedVoices.some((v) => v.lang && v.lang.toLowerCase().startsWith(prefix));
}

// Broken WebViews sometimes fire neither onend nor onerror, so we optimistically
// resolve true on timeout — silence beats an error toast for every tap.
function speakViaWebSpeech(text: string, lang: string): Promise<boolean> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    const v = pickVoice(lang);
    if (v) u.voice = v;
    u.rate = 0.95;
    let settled = false;
    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    u.onend = () => finish(true);
    u.onerror = (e) => {
      // 'canceled'/'interrupted' mean a newer speak() called synth.cancel() and
      // took over — not an engine failure.
      if (e.error === 'canceled' || e.error === 'interrupted') return finish(true);
      console.warn('[speech] Web Speech error', e.error);
      finish(false);
    };
    synth.speak(u);
    setTimeout(() => finish(true), 6000);
  });
}

// Speak `text`. Fire-and-forget from click handlers; never throws.
export async function speak(text: string, lang = 'en-US'): Promise<void> {
  if (!text) return;
  // Voices may not be populated yet on a cold load (PWA resume straight into an
  // auto-playing view) — wait once for the probe before judging system TTS unusable.
  if (!cachedVoices.length) await loadVoices();
  if (!isWebSpeechUsable(lang)) {
    console.warn('[speech] no usable system TTS engine — staying silent');
    return;
  }
  await speakViaWebSpeech(text, lang);
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
    console.warn('[speech] warmup prime failed', e);
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
