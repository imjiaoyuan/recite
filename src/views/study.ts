import { h } from '../ui';
import { icon } from '../icons';
import { getMeta, setMeta, bumpActivity, bumpNew, getWordState, getState, setWordState, removeWordState } from '../store';
import { loadList, loadSentences } from '../data';
import { buildSession, dailyLimit, topupOffer } from '../session';
import { schedule } from '../srs';
import { autoSync } from '../sync';
import { t } from '../i18n';
import { GRADES } from '../grades';
import { topbar, setProgress, loadFailEl, loadingEl, entryHead, meaningBlock, gradesRow } from './common';
import type { Ctx, ViewResult, WordEntry, Example, WordState } from '../types';

export default function study([listId, extra]: string[], { navigate }: Ctx): ViewResult {
  const el = h('div', { class: 'page page-focus' });
  let queue: WordEntry[] = [];
  let idx = 0;
  let revealed = false;
  let sentences: Record<string, Example[]> = {};
  let listSize = 0; // set once the list loads — feeds the done screen's top-up offer
  const session = { total: 0, ok: 0 };
  // Manual top-up beyond today's quota (加学 from the done screen): '#/study/x?extra=N'.
  const extraNew = Math.max(0, parseInt(new URLSearchParams(extra || '').get('extra') || '', 10) || 0);
  // 墨墨-style in-session requeue. Only the FIRST grade of the day shapes the
  // word's long-term schedule (enforced in srs.schedule) — these repeats only
  // decide how often it loops TODAY:
  //   q=4/5 (良好/简单): never requeued — you know it, it's done for the day;
  //   q=3 (困难/模糊): one more pass (the word shows up at least twice);
  //   q=1 (忘了): must come back; failing the SECOND pass resets the counter
  //     (== keeps requeueing) so the word keeps cycling until you get it right.
  const REVISIT_MAX = 1; // per pass, for 困难
  const revisitCount = new Map<string, number>();
  // Every grade, oldest first — drives the unique-word totals on the done screen.
  const gradedLog: { word: string; q: number }[] = [];
  // Snapshot of the last graded card, for one-step undo ("oops, misclick").
  // revisits saves the word's PRE-grade requeue-counter value so undo restores
  // it exactly (a 忘了 on the extra pass *deletes* the counter — decrement
  // can't reverse that).
  let undoLast: { word: string; prev: WordState | null; appended: boolean; revisits: number | undefined } | null = null;

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

  // Words in this list that have any SRS state (started learning) — how many
  // unseen words remain for the done screen's top-up offer.
  function startedCount(): number {
    const state = getState();
    let n = 0;
    for (const k in state) if (k.startsWith(`${listId}:`) && !state[k].known) n++;
    return n;
  }

  function drawDone(): void {
    area.innerHTML = '';
    const empty = queue.length === 0;
    if (!empty) autoSync(); // session ended — push progress in the background
    // 加学: quota used up but still want more — a manual top-up beyond today's
    // limit. The extra words bypass recite:daily (deliberate, not quota) and
    // are handed straight to the next session via the ?extra= session param.
    const started = startedCount();
    const offer = topupOffer(listId, Math.max(0, listSize - started));
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
    const revisitsBefore = revisitCount.get(word); // pre-grade counter, for exact undo
    schedule(listId, word, q);
    bumpActivity(1);
    if (!prev) bumpNew(listId); // first-ever grade = one of today's new words
    gradedLog.push({ word, q });
    recomputeCounts();
    // Unsure answers requeue at the tail (rules in the comment at REVISIT_MAX):
    // 忘了 always comes back — botching the revisit resets the counter so it
    // keeps cycling; 困难 comes back once, then its second-chance result stands.
    let appended = false;
    if (q === 1) {
      queue.push(e);
      appended = true;
      if ((revisitCount.get(word) || 0) >= REVISIT_MAX) revisitCount.delete(word); // still lost after the extra pass — reset and cycle again
      else revisitCount.set(word, (revisitCount.get(word) || 0) + 1);
    } else if (q === 3 && (revisitCount.get(word) || 0) < REVISIT_MAX) {
      queue.push(e);
      revisitCount.set(word, (revisitCount.get(word) || 0) + 1);
      appended = true;
    }
    undoLast = { word, prev, appended, revisits: revisitsBefore };
    idx++;
    revealed = false;
    render();
  }

  // Revert the last grade: restore the pre-grade SRS state, step back one card,
  // and undo the session/activity counters so stats stay honest. If that grade
  // had requeued the word, drop the still-pending revisit and restore the
  // counter snapshot.
  function undo(): void {
    if (!undoLast) return;
    const { word, prev, appended, revisits } = undoLast;
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
      if (revisits === undefined) revisitCount.delete(word);
      else revisitCount.set(word, revisits);
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
    listSize = list.length;
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
