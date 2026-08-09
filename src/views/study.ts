import { h } from '../ui';
import { getMeta, setMeta, bumpActivity, getWordState, setWordState, removeWordState } from '../store';
import { loadList, loadSentences } from '../data';
import { buildSession } from '../session';
import { schedule } from '../srs';
import { speak } from '../speech';
import { t } from '../i18n';
import { GRADES } from '../grades';
import type { Ctx, ViewResult, WordEntry, Example, WordState } from '../types';

export default function study([listId]: string[], { navigate }: Ctx): ViewResult {
  const el = h('div', { class: 'page page-focus' });
  let queue: WordEntry[] = [];
  let idx = 0;
  let revealed = false;
  let sentences: Record<string, Example[]> = {};
  const session = { total: 0, ok: 0 };
  // Snapshot of the last graded card, for one-step undo ("oops, misclick").
  let undoLast: { word: string; prev: WordState | null; q: number } | null = null;

  const undoBtn = h('button', { class: 'btn ghost icon-only', title: t('study.undo'), onclick: undo, style: 'display:none' }, h('i', { class: 'fa-solid fa-rotate-left' }));
  const topbar = h('div', { class: 'topbar' },
    h('button', { class: 'btn ghost', onclick: () => navigate('#/') }, h('i', { class: 'fa-solid fa-arrow-left' }), t('common.back')),
    h('div', { class: 'topbar-right' },
      h('div', { class: 'progress-info' }, ''),
      undoBtn,
    ),
  );
  const area = h('div', { class: 'card-area' });
  el.append(topbar, area);

  function updateProgress(): void {
    const pi = topbar.querySelector('.progress-info');
    if (pi) pi.textContent = `${Math.min(idx, queue.length)} / ${queue.length}`;
  }
  function updateUndo(): void {
    undoBtn.style.display = undoLast ? '' : 'none';
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
    updateProgress();
    updateUndo();
    if (idx >= queue.length) return drawDone();
    const e: WordEntry = queue[idx];
    const ex: Example | undefined = (sentences[e.word.toLowerCase()] || [])[0];
    const voice = getMeta().voice;

    area.innerHTML = '';
    const card = h('div', { class: 'entry' },
      h('div', { class: 'entry-head' },
        h('div', { class: 'word', onclick: () => speak(e.word, voice) }, e.word),
        e.pos ? h('span', { class: 'pos' }, e.pos) : null,
        h('div', { class: 'phonetic' }, e.phonetic || ''),
        h('button', { class: 'say', onclick: () => speak(e.word, voice) }, h('i', { class: 'fa-solid fa-volume-high' }), t('study.speak')),
      ),
    );

    if (revealed) {
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
      card.append(meaning);
      area.append(card);
      area.append(
        h('div', { class: 'grades' },
          ...GRADES.map((g) => h('button', { class: `grade ${g.cls}`, onclick: () => grade(g.q) }, t(g.label))),
        ),
      );
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
    const word = queue[idx].word;
    const prev = getWordState(listId, word); // snapshot before schedule overwrites it
    schedule(listId, word, q);
    bumpActivity(1);
    session.total++;
    if (q >= 3) session.ok++;
    undoLast = { word, prev, q };
    idx++;
    revealed = false;
    render();
  }

  // Revert the last grade: restore the pre-grade SRS state, step back one card,
  // and undo the session/activity counters so stats stay honest.
  function undo(): void {
    if (!undoLast) return;
    const { word, prev, q } = undoLast;
    if (prev) setWordState(listId, word, prev);
    else removeWordState(listId, word);
    bumpActivity(-1);
    session.total--;
    if (q >= 3) session.ok--;
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
    const s = buildSession(list, listId, getMeta().dailyLimit || 50);
    queue = s.due.concat(s.fresh);
    sentences = await loadSentences();
    render();
  })().catch((err: Error) => {
    area.innerHTML = '';
    area.append(h('div', { class: 'done' }, h('div', { class: 'done-title' }, t('loadFail')), h('div', { class: 'muted' }, err.message)));
  });

  return {
    el,
    cleanup() {
      document.removeEventListener('keydown', onKey);
    },
  };
}
