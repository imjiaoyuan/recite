// Create a custom word list: name + words (one per line). Meanings are auto-filled
// from the built-in word data via getWordIndex(); unmatched words are kept blank.
import { h, toast } from '../ui';
import { createUserList } from '../store';
import { getWordIndex } from '../data';
import { invalidateSearchIndex } from './search';
import { t } from '../i18n';
import { topbar } from './common';
import type { Ctx, ViewResult, WordEntry } from '../types';

export default function createList(_params: string[], { navigate }: Ctx): ViewResult {
  const el = h('div', { class: 'page page-focus' });
  const bar = topbar(navigate, t('list.create.title'));
  const area = h('div', { class: 'card-area' });
  el.append(bar, area);

  const nameInput = h('input', {
    class: 'spell-input',
    type: 'text',
    placeholder: t('list.create.namePh'),
    autocomplete: 'off',
  }) as HTMLInputElement;
  const wordsInput = h('textarea', {
    class: 'spell-input list-words',
    placeholder: t('list.create.wordsPh'),
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
  }) as HTMLTextAreaElement;
  const status = h('div', { class: 'muted list-status' }, '');
  const submitBtn = h('button', { class: 'btn primary big', onclick: submit }, t('list.create.submit'));
  let submitting = false;

  function submit(): void {
    if (submitting) return;
    const name = nameInput.value.trim();
    if (!name) { toast(t('list.create.nameRequired')); nameInput.focus(); return; }
    // Parse: split newlines, trim, drop empties, dedupe case-insensitively (keep first casing).
    const seen = new Set<string>();
    const raw: string[] = [];
    for (const line of wordsInput.value.split('\n')) {
      const w = line.trim();
      if (!w) continue;
      const lw = w.toLowerCase();
      if (seen.has(lw)) continue;
      seen.add(lw);
      raw.push(w);
    }
    if (!raw.length) { toast(t('list.create.noWords')); wordsInput.focus(); return; }

    submitting = true;
    submitBtn.setAttribute('disabled', '');
    status.textContent = t('list.create.loading');
    (async () => {
      const idx = await getWordIndex();
      let found = 0;
      const words: WordEntry[] = raw.map((w) => {
        const hit = idx.get(w.toLowerCase());
        if (hit) { found++; return hit; }
        return { word: w, phonetic: '', pos: '', translation: '', definition: '' };
      });
      const id = createUserList(name, words);
      invalidateSearchIndex();
      toast(t('list.create.created', { name, found, total: words.length }));
      navigate(`#/list/${id}`);
    })().catch((err: Error) => {
      submitting = false;
      submitBtn.removeAttribute('disabled');
      status.textContent = '';
      console.warn('[list-create] create failed', err);
      toast(err.message);
    });
  }

  area.append(
    h('div', { class: 'entry' },
      h('label', { class: 'field-label' }, t('list.create.name')),
      nameInput,
      h('label', { class: 'field-label' }, t('list.create.words')),
      wordsInput,
    ),
    submitBtn,
    status,
  );
  setTimeout(() => nameInput.focus(), 0);
  return { el };
}
