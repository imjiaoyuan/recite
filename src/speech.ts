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

function speakViaWebSpeech(text: string, lang: string): void {
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  const v = pickVoice(lang);
  if (v) u.voice = v;
  u.rate = 0.95;
  u.onerror = (e) => console.warn('[speech] Web Speech error', e.error);
  synth.speak(u);
}

// ---- kokoro fallback ----

const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let kokoro: KokoroTTS | null = null;
let kokoroPromise: Promise<void> | null = null;
type Status = { status: 'loading' | 'ready' | 'error'; message?: string };
let statusCb: ((s: Status) => void) | null = null;

export function onKokoroStatus(cb: ((s: Status) => void) | null): void {
  statusCb = cb;
}
function report(s: Status): void {
  try {
    statusCb?.(s);
  } catch (e) {
    console.warn('[speech] kokoro status listener threw', e);
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

// Speak `text`. Web Speech first; if no usable system engine and the user has enabled the
// offline engine, synthesize via kokoro. Fire-and-forget from click handlers.
export async function speak(text: string, lang = 'en-US'): Promise<void> {
  if (!text) return;
  if (isWebSpeechUsable(lang)) {
    speakViaWebSpeech(text, lang);
    return;
  }
  if (getMeta().ttsEngine === 'kokoro') {
    try {
      if (!kokoro && !kokoroPromise) enableKokoro();
      const tts = await getKokoro();
      if (!tts) return;
      const out = await tts.generate(text, { voice: pickKokoroVoice(lang) });
      await playBlob(out.toBlob());
      return;
    } catch (e) {
      console.warn('[speech] kokoro speak failed', e);
      return;
    }
  }
  console.warn(
    `[speech] no usable TTS engine for "${text}". System TTS unavailable — enable offline TTS in settings.`,
  );
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
