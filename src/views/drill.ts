// Difficult-words drill: focus on words you've gotten wrong (marked st.diff).
import { h, shuffle } from '../ui';
import { getDifficult, getMeta, bumpActivity } from '../store';
import { loadList, loadSentences } from '../data';
import { schedule } from '../srs';
import { autoSync, setOnPulled } from '../sync';
import { t } from '../i18n';
import { GRADES } from '../grades';
import { topbar, setProgress, loadFailEl, loadingEl, entryHead, meaningBlock, gradesRow } from './common';
import type { Ctx, ViewResult, WordEntry, Example } from '../types';

export default function drill(_params: string[], { navigate }: Ctx): ViewResult {
  const el = h('div', { class: 'page page-focus' });
  let queue: (WordEntry & { listId: string })[] = [];
  let idx = 0;
  let revealed = false;
  let sentences: Record<string, Example[]> = {};
  const session = { total: 0, ok: 0 };

  const bar = topbar(navigate, t('drill.title'));
  const area = h('div', { class: 'card-area' }, loadingEl());
  el.append(bar, area);

  // The difficult-words queue comes entirely from SRS state, which boot
  // auto-sync may top up from another device — rebuild in place (only when
  // still waiting; mid-session grades would be lost).
  setOnPulled(() => {
    if (idx === 0 && !revealed && !session.total) build();
  });

  function drawDone(): void {
    area.innerHTML = '';
    if (session.total) autoSync(); // session ended — push progress in the background
    area.append(
      h('div', { class: 'done' },
        h('div', { class: 'done-title' }, t('done.title')),
        h('div', { class: 'muted' }, t('done.count', { total: session.total, ok: session.ok })),
        h('div', {},
          h('button', { class: 'btn primary', onclick: () => navigate('#/drill') }, t('done.again')),
          h('button', { class: 'btn', onclick: () => navigate('#/') }, t('done.home')),
        ),
      ),
    );
  }

  function render(): void {
    setProgress(bar, idx, queue.length);
    if (idx >= queue.length) return drawDone();
    const e = queue[idx];
    const ex: Example | undefined = (sentences[e.word.toLowerCase()] || [])[0];
    const voice = getMeta().voice;
    area.innerHTML = '';
    const card = h('div', { class: 'entry' }, entryHead(e, voice));
    if (revealed) {
      card.append(meaningBlock(e, ex, voice));
      area.append(card, gradesRow(grade));
    } else {
      card.append(h('div', { class: 'flip-hint' }, t('study.hint')));
      area.append(card);
      area.append(h('button', { class: 'btn primary big', onclick: reveal }, t('study.reveal')));
    }
  }

  function reveal(): void {
    revealed = true;
    render();
  }
  function grade(q: number): void {
    schedule(queue[idx].listId, queue[idx].word, q);
    bumpActivity(1);
    session.total++;
    if (q >= 3) session.ok++;
    idx++;
    revealed = false;
    render();
  }
  function onKey(ev: KeyboardEvent): void {
    if (idx >= queue.length) return;
    if (ev.key === ' ' && !revealed) {
      ev.preventDefault();
      reveal();
    } else if (revealed && ev.key >= '1' && ev.key <= '4') {
      ev.preventDefault();
      grade(GRADES[Number(ev.key) - 1].q);
    }
  }
  document.addEventListener('keydown', onKey);

  async function build(): Promise<void> {
    const diff = getDifficult();
    if (!diff.length) {
      area.innerHTML = '';
      area.append(
        h('div', { class: 'done' },
          h('div', { class: 'done-title' }, t('drill.empty')),
          h('div', { class: 'muted' }, t('drill.emptyHint')),
          h('button', { class: 'btn', onclick: () => navigate('#/') }, t('done.home')),
        ),
      );
      return;
    }
    const byList: Record<string, string[]> = {};
    for (const d of diff) {
      (byList[d.listId] ||= []).push(d.word);
    }
    const q0: (WordEntry & { listId: string })[] = [];
    for (const listId in byList) {
      let list: WordEntry[];
      try {
        list = await loadList(listId);
      } catch (e) {
        console.warn(`[drill] skipping list "${listId}" — load failed`, e);
        continue;
      }
      const want = new Set(byList[listId]);
      for (const e of list) if (want.has(e.word)) q0.push({ ...e, listId });
    }
    shuffle(q0);
    queue = q0;
    idx = 0;
    revealed = false;
    render(); // first card as soon as the words are in
    sentences = await loadSentences(); // examples stream in behind it, never blocking
    render();
  }

  build().catch((err: Error) => {
    area.innerHTML = '';
    area.append(loadFailEl(err));
  });

  return {
    el,
    cleanup() {
      document.removeEventListener('keydown', onKey);
      setOnPulled(null);
    },
  };
}
