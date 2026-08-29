// Shared view building blocks: the standard topbar, progress text, load-failure
// block, and the study/drill word-card sections.
import { h } from '../ui';
import { t } from '../i18n';
import { speak } from '../speech';
import { GRADES } from '../grades';
import type { Ctx, WordEntry, Example } from '../types';

export function topbar(navigate: Ctx['navigate'], title = ''): HTMLElement {
  return h('div', { class: 'topbar' },
    h('button', { class: 'btn ghost', onclick: () => navigate('#/') }, h('i', { class: 'fa-solid fa-arrow-left' }), t('common.back')),
    h('div', { class: 'progress-info' }, title),
  );
}

export function setProgress(bar: HTMLElement, idx: number, total: number): void {
  const pi = bar.querySelector('.progress-info');
  if (pi) pi.textContent = `${Math.min(idx, total)} / ${total}`;
}

export function loadFailEl(err: Error): HTMLElement {
  return h('div', { class: 'done' }, h('div', { class: 'done-title' }, t('loadFail')), h('div', { class: 'muted' }, err.message));
}

// A quiet placeholder shown while the list data streams in, so the view isn't blank.
export function loadingEl(): HTMLElement {
  return h('p', { class: 'muted' }, t('home.loading'));
}

// ---- study / drill card sections ----

export function entryHead(e: WordEntry, voice: string): HTMLElement {
  return h('div', { class: 'entry-head' },
    h('div', { class: 'word', onclick: () => speak(e.word, voice) }, e.word),
    e.pos ? h('span', { class: 'pos' }, e.pos) : null,
    h('div', { class: 'phonetic' }, e.phonetic || ''),
    h('button', { class: 'say', onclick: () => speak(e.word, voice) }, h('i', { class: 'fa-solid fa-volume-high' }), t('study.speak')),
  );
}

export function meaningBlock(e: WordEntry, ex: Example | undefined, voice: string): HTMLElement {
  const meaning = h('div', { class: 'meaning' },
    h('div', { class: 'trans' }, e.translation || t('noMeaning')),
    e.definition ? h('div', { class: 'def muted' }, e.definition) : null,
  );
  if (ex) {
    meaning.append(
      h('div', { class: 'example' },
        h('div', { class: 'ex-en', onclick: () => speak(ex.en, voice) }, ex.en),
        ex.zh ? h('div', { class: 'ex-zh muted' }, ex.zh) : null,
      ),
    );
  }
  return meaning;
}

export function gradesRow(onGrade: (q: number) => void): HTMLElement {
  return h('div', { class: 'grades' }, ...GRADES.map((g) => h('button', { class: `grade ${g.cls}`, onclick: () => onGrade(g.q) }, t(g.label))));
}
