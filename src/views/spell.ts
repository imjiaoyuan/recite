// Spell test: a clozed example sentence (or just the meaning) prompts you to
// type the word. All flow logic lives in quiz.ts.
import { quiz } from './quiz';
import { h } from '../ui';
import { t } from '../i18n';
import type { WordEntry, Example } from '../types';

// Blank the target word out of an example sentence (case-insensitive, whole word).
// The per-word regex is compiled once and cached (a card can render many times).
const clozeReCache = new Map<string, RegExp>();
function cloze(sentence: string, word: string): string {
  if (!sentence) return '';
  let re = clozeReCache.get(word);
  if (!re) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    clozeReCache.set(word, (re = new RegExp(`\\b${escaped}\\b`, 'gi')));
  }
  return sentence.replace(re, '_____');
}

export default quiz({
  route: '#/spell',
  placeholderKey: 'spell.placeholder',
  repromptOnSentences: true, // the cloze IS the prompt — repaint once sentences land
  prompt: (e: WordEntry, ex: Example | undefined) => [
    h('div', { class: 'spell-prompt' }, e.translation || t('noMeaning')),
    ex ? h('div', { class: 'cloze muted' }, cloze(ex.en, e.word)) : null,
  ],
});
