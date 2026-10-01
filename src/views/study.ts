import { h } from '../ui';
import { icon } from '../icons';
import { getMeta, setMeta, bumpActivity, bumpNew, getWordState, setWordState, removeWordState } from '../store';
import { loadList, loadSentences } from '../data';
import { buildSession, dailyLimit, topupOffer, remainingFresh } from '../session';
import { schedule } from '../srs';
import { autoSync } from '../sync';
import { t } from '../i18n';
import { GRADES, PASSES } from '../grades';
import { topbar, setProgress, loadFailEl, loadingEl, entryHead, meaningBlock, gradesRow } from './common';
import type { Ctx, ViewResult, WordEntry, Example, WordState } from '../types';

export default function study([listId, extra]: string[], { navigate }: Ctx): ViewResult {
  const el = h('div', { class: 'page page-focus' });
  let queue: WordEntry[] = [];
  let idx = 0;
  let revealed = false;
  let sentences: Record<string, Example[]> = {};
  const session = { total: 0, ok: 0 };
  // Manual top-up beyond today's quota (加学 from the done screen): '#/study/x?extra=N'.
  // The route regexp captures only the digits after '?extra=', so parse them
  // directly — never through URLSearchParams, which would need the '?key=' part
  // and quietly returns null for a bare '100' (the bug that made 加学 dead).
  const extraNew = Math.max(0, parseInt(extra || '', 10) || 0);
  // 墨墨-style in-session requeue (tiers in grades.ts PASSES). Only the FIRST
  // grade of the day shapes the word's long-term schedule (enforced in
  // srs.schedule) — these repeats only decide how often it loops TODAY. Each
  // click RESETS the word's remaining passes to its tier (忘了 3 / 困难 2 /
  // 良好 1 / 简单 0); a second 良好 in a row finishes the word.
  const lastGrade = new Map<string, number>();
  // Every grade, oldest first — drives the unique-word totals on the done screen.
  const gradedLog: { word: string; q: number }[] = [];
  // Snapshot of the last graded card, for one-step undo ("oops, misclick").
  // queued = copies this grade appended (undo trims exactly that many from
  // the tail); prevLast = the word's prior last-grade tier (undo restores it).
  let undoLast: { word: string; prev: WordState | null; queued: number; prevLast: number | undefined } | null = null;

  const undoBtn = h('button', { class: 'btn ghost icon-only', title: t('study.undo'), onclick: undo, style: 'display:none' }, icon('rotate-left'));
  const bar = topbar(navigate, '', [undoBtn]);
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

  // The list words, kept for the done screen's top-up offer — remainingFresh()
  // needs the actual entries, not just a count, to tell unseen from known.
  let listWords: WordEntry[] = [];

  function drawDone(): void {
    area.innerHTML = '';
    const empty = queue.length === 0;
    if (!empty) autoSync(); // session ended — push progress in the background
    // 加学: quota used up but still want more — a manual top-up beyond today's
    // limit. The extra words bypass recite:daily (deliberate, not quota) and
    // are handed straight to the next session via the ?extra= session param.
    const offer = topupOffer(remainingFresh(listWords, listId));
    area.append(
      h('div', { class: 'done' },
        h('div', { class: 'done-title' }, empty ? t('done.none') : t('done.title')),
        h('div', { class: 'muted' }, empty ? t('done.noneHint') : t('done.count', { total: session.total, ok: session.ok })),
        h('div', {},
          h('button', { class: 'btn primary', onclick: () => navigate(`#/study/${listId}`) }, t('done.again')),
          h('button', { class: 'btn', onclick: () => navigate('#/') }, t('done.home')),
        ),
        offer > 0
          ? h('div', { class: 'done-more' },
              h('div', { class: 'muted' }, t('done.moreHint', { limit: dailyLimit(), n: offer })),
              h('button', { class: 'btn', onclick: () => navigate(`#/study/${listId}?extra=${offer}`) }, t('done.moreBtn', { n: offer })),
            )
          : null,
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
    // Tiered reset (PASSES in grades.ts): first DROP this word's pending
    // copies from the queue (a weaker grade may have left up to 3), then push
    // the new tier's count. Each click therefore *replaces* the plan: 忘了 3,
    // 困难 2, 良好 1, 简单 0. A second consecutive 良好 ends the word (its
    // confirmation pass was successful — nothing more to reinforce).
    const prevLast = lastGrade.get(word);
    // Tiered reset (PASSES in grades.ts): every click first DROPS this word's
    // pending copies from the queue (a weaker grade may have left up to 4),
    // then pushes the new tier's count — 忘了 4, 困难 3, 良好 2, 简单 0.
    // The confirmation rule: a second consecutive 良好 ends the word (its
    // confirmation passes succeeded — nothing more to reinforce), which is why
    // the drop happens even when nothing new is queued.
    for (let i = queue.length - 1; i > idx; i--) {
      if (queue[i].word === word) queue.splice(i, 1);
    }
    let queued = 0;
    if (!(prevLast === 4 && q === 4)) {
      queued = PASSES[q] ?? 0;
      for (let i = 0; i < queued; i++) queue.push(e);
    }
    lastGrade.set(word, q);
    undoLast = { word, prev, queued, prevLast };
    idx++;
    revealed = false;
    render();
  }

  // Revert the last grade: restore the pre-grade SRS state, step back one card,
  // and undo the session/activity counters so stats stay honest. The exact
  // number of requeue copies that grade added is trimmed from the tail.
  function undo(): void {
    if (!undoLast) return;
    const { word, prev, queued, prevLast } = undoLast;
    if (prev) setWordState(listId, word, prev);
    else {
      removeWordState(listId, word);
      bumpNew(listId, -1); // the undone grade had introduced a fresh word
    }
    bumpActivity(-1);
    gradedLog.pop();
    recomputeCounts();
    for (let i = 0; i < queued; i++) queue.pop(); // trim the copies this grade appended
    if (prevLast === undefined) lastGrade.delete(word);
    else lastGrade.set(word, prevLast);
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
    listWords = list;
    const s = buildSession(list, listId, dailyLimit(), extraNew);
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
