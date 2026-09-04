import { h } from '../ui';
import { getMeta, setMeta, bumpActivity, bumpNew, getWordState, setWordState, removeWordState } from '../store';
import { loadList, loadSentences } from '../data';
import { buildSession, dailyLimit } from '../session';
import { schedule } from '../srs';
import { t } from '../i18n';
import { GRADES } from '../grades';
import { setProgress, loadFailEl, loadingEl, entryHead, meaningBlock, gradesRow } from './common';
import type { Ctx, ViewResult, WordEntry, Example, WordState } from '../types';

export default function study([listId]: string[], { navigate }: Ctx): ViewResult {
  const el = h('div', { class: 'page page-focus' });
  let queue: WordEntry[] = [];
  let idx = 0;
  let revealed = false;
  let sentences: Record<string, Example[]> = {};
  const session = { total: 0, ok: 0 };
  // 墨墨-style in-session requeue: words graded q<4 (forgot/hard) are appended
  // straight to the queue tail for one more pass today. Pushing onto the queue
  // (rather than a side list merged later) keeps undo simple: the revisit is
  // always the tail entry, so undo() can pop it. At most once per word.
  const REVISIT_MAX = 1;
  const revisitCount = new Map<string, number>();
  // Every grade, oldest first — drives the unique-word totals on the done screen.
  const gradedLog: { word: string; q: number }[] = [];
  // Snapshot of the last graded card, for one-step undo ("oops, misclick").
  let undoLast: { word: string; prev: WordState | null; appended: boolean } | null = null;

  const undoBtn = h('button', { class: 'btn ghost icon-only', title: t('study.undo'), onclick: undo, style: 'display:none' }, h('i', { class: 'fa-solid fa-rotate-left' }));
  const bar = h('div', { class: 'topbar' },
    h('button', { class: 'btn ghost', onclick: () => navigate('#/') }, h('i', { class: 'fa-solid fa-arrow-left' }), t('common.back')),
    h('div', { class: 'topbar-right' },
      h('div', { class: 'progress-info' }, ''),
      undoBtn,
    ),
  );
  const area = h('div', { class: 'card-area' }, loadingEl());
  el.append(bar, area);

  function updateUndo(): void {
    undoBtn.style.display = undoLast ? '' : 'none';
  }

  // Count unique words graded this session; "mastered" = last grade was q>=3.
  // A requeued word counts once, with its final grade deciding mastery.
  function recomputeCounts(): void {
    const last = new Map<string, number>();
    for (const g of gradedLog) last.set(g.word, g.q);
    let ok = 0;
    for (const q of last.values()) if (q >= 3) ok++;
    session.total = last.size;
    session.ok = ok;
  }

  function drawDone(): void {
    area.innerHTML = '';
    const empty = queue.length === 0;
    area.append(
      h('div', { class: 'done' },
        h('div', { class: 'done-title' }, empty ? t('done.none') : t('done.title')),
        h('div', { class: 'muted' }, empty ? t('done.noneHint') : t('done.count', { total: session.total, ok: session.ok })),
        h('div', {},
          h('button', { class: 'btn primary', onclick: () => navigate(`#/study/${listId}`) }, t('done.again')),
          h('button', { class: 'btn', onclick: () => navigate('#/') }, t('done.home')),
        ),
      ),
    );
  }

  function render(): void {
    setProgress(bar, idx, queue.length);
    updateUndo();
    if (idx >= queue.length) return drawDone();
    const e: WordEntry = queue[idx];
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
    const e = queue[idx];
    const word = e.word;
    const prev = getWordState(listId, word); // snapshot before schedule overwrites it
    schedule(listId, word, q);
    bumpActivity(1);
    if (!prev) bumpNew(listId); // first-ever grade = one of today's new words
    gradedLog.push({ word, q });
    recomputeCounts();
    // Unsure answers (q<4) requeue at the queue tail — once per word.
    let appended = false;
    if (q < 4 && (revisitCount.get(word) || 0) < REVISIT_MAX) {
      queue.push(e);
      revisitCount.set(word, (revisitCount.get(word) || 0) + 1);
      appended = true;
    }
    undoLast = { word, prev, appended };
    idx++;
    revealed = false;
    render();
  }

  // Revert the last grade: restore the pre-grade SRS state, step back one card,
  // and undo the session/activity counters so stats stay honest. If that grade
  // had requeued the word, drop the still-pending revisit too.
  function undo(): void {
    if (!undoLast) return;
    const { word, prev, appended } = undoLast;
    if (prev) setWordState(listId, word, prev);
    else {
      removeWordState(listId, word);
      bumpNew(listId, -1); // the undone grade had introduced a fresh word
    }
    bumpActivity(-1);
    gradedLog.pop();
    recomputeCounts();
    if (appended) {
      // The revisit is still the queue tail (nothing was graded since).
      queue.pop();
      revisitCount.set(word, (revisitCount.get(word) || 1) - 1);
    }
    idx--;
    revealed = true; // it was revealed before grading — let them re-grade immediately
    undoLast = null; // single-step undo
    render();
  }

  // Keyboard: Space = reveal, 1-4 = grade.
  function onKey(ev: KeyboardEvent): void {
    if (ev.key === 'z' || ev.key === 'Z') {
      if (undoLast) {
        ev.preventDefault();
        undo();
      }
      return;
    }
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

  (async () => {
    setMeta({ selectedList: listId });
    const list = await loadList(listId);
    const s = buildSession(list, listId, dailyLimit());
    queue = s.due.concat(s.fresh);
    render(); // first card as soon as the list is in
    sentences = await loadSentences(); // examples stream in behind it, never blocking
    render();
  })().catch((err: Error) => {
    area.innerHTML = '';
    area.append(loadFailEl(err));
  });

  return {
    el,
    cleanup() {
      document.removeEventListener('keydown', onKey);
    },
  };
}
