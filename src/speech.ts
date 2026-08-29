// Pronunciation. Two layers:
//   1. Web Speech API (system TTS) — primary path when the browser has a usable engine.
//   2. kokoro-js (Kokoro-82M neural TTS, runs locally via WASM) — optional fallback for
//      browsers with no system TTS (e.g. Via). Opt-in via settings; model is fetched from
//      Hugging Face on first use (~80–100 MB) and then cached, so it works offline afterward.
import { getMeta } from './store';
import type { KokoroTTS } from 'kokoro-js';

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

// Speak via the system engine. Resolves true if the utterance was accepted
// (ended or timed out without an error); false if the engine errored, so the
// caller can fall back to the offline engine. Broken WebViews sometimes fire
// neither onend nor onerror, so we optimistically resolve true on timeout —
// otherwise a silently-failing engine would trigger double speech.
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
      // took over — not an engine failure, so don't fall back to kokoro on top
      // of the utterance that superseded us (that would double-speak).
      if (e.error === 'canceled' || e.error === 'interrupted') return finish(true);
      console.warn('[speech] Web Speech error', e.error);
      finish(false);
    };
    synth.speak(u);
    setTimeout(() => finish(true), 6000);
  });
}

// ---- kokoro fallback ----

const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let kokoro: KokoroTTS | null = null;
let kokoroPromise: Promise<void> | null = null;
type Status = { status: 'loading' | 'ready' | 'error'; message?: string };
type StatusListener = (s: Status) => void;
const statusListeners = new Set<StatusListener>();

// Register a status listener; returns an unsubscribe. Multiple listeners may
// coexist (settings page status line + the global download toast in main.ts).
export function onKokoroStatus(cb: StatusListener): () => void {
  statusListeners.add(cb);
  return () => {
    statusListeners.delete(cb);
  };
}
function report(s: Status): void {
  for (const cb of statusListeners) {
    try {
      cb(s);
    } catch (e) {
      console.warn('[speech] kokoro status listener threw', e);
    }
  }
}

// Begin (idempotent) model download + init. Resolves once ready; safe to call repeatedly.
export function enableKokoro(): Promise<void> {
  if (kokoro) {
    report({ status: 'ready' });
    return Promise.resolve();
  }
  if (kokoroPromise) return kokoroPromise;
  kokoroPromise = (async () => {
    report({ status: 'loading' });
    const mod = await import('kokoro-js');
    const tts = await mod.KokoroTTS.from_pretrained(KOKORO_MODEL, {
      dtype: 'q8',
      device: 'wasm',
    });
    kokoro = tts;
    report({ status: 'ready' });
  })().catch((e: unknown) => {
    kokoroPromise = null; // allow retry on failure
    const message = e instanceof Error ? e.message : String(e);
    report({ status: 'error', message });
    console.warn('[speech] kokoro load failed', e);
  });
  return kokoroPromise;
}

async function getKokoro(): Promise<KokoroTTS | null> {
  if (kokoro) return kokoro;
  if (kokoroPromise) await kokoroPromise;
  return kokoro; // null if the load failed
}

function pickKokoroVoice(lang: string): 'af_heart' | 'bf_emma' {
  return lang && lang.toLowerCase().startsWith('en-gb') ? 'bf_emma' : 'af_heart';
}

async function playBlob(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  const a = new Audio(url);
  const cleanup = (): void => URL.revokeObjectURL(url);
  a.addEventListener('ended', cleanup, { once: true });
  a.addEventListener('error', cleanup, { once: true });
  try {
    await a.play();
  } catch (e) {
    cleanup(); // play() never started (e.g. autoplay blocked) — revoke now or it leaks.
    console.warn('[speech] audio play rejected (autoplay policy?)', e);
    throw e; // let speak() handle it (its catch already warns).
  }
}

// Speak `text`. System TTS first, unless the user prefers the offline engine
// outright (`ttsEngine: 'kokoro'`). When system TTS is missing (e.g. Via /
// other WebViews expose speechSynthesis but have no engine → empty voices) or
// errors out, fall back to kokoro automatically — no opt-in needed. First use
// downloads the ~80–100 MB model; the service worker caches it afterwards.
// Best-effort: never throws, fire-and-forget from click handlers.
export async function speak(text: string, lang = 'en-US'): Promise<void> {
  if (!text) return;
  // Voices may not be populated yet on a cold load (PWA resume straight into an
  // auto-playing view) — wait once for the probe before judging system TTS
  // unusable, or we'd needlessly trigger the offline model download.
  if (!cachedVoices.length) await loadVoices();
  const preferOffline = getMeta().ttsEngine === 'kokoro';
  if (isWebSpeechUsable(lang) && !preferOffline) {
    if (await speakViaWebSpeech(text, lang)) return;
    // System engine errored — fall through to the offline fallback.
  }
  try {
    await enableKokoro();
    const tts = await getKokoro();
    if (!tts) return; // load failed — enableKokoro already reported the error status
    const out = await tts.generate(text, { voice: pickKokoroVoice(lang) });
    await playBlob(out.toBlob());
  } catch (e) {
    console.warn('[speech] kokoro speak failed', e);
  }
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
