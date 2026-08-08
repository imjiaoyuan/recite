// Difficult-words drill: focus on words you've gotten wrong (marked st.diff).
import { h, shuffle } from '../ui';
import { getDifficult, getMeta, bumpActivity } from '../store';
import { loadList, loadSentences } from '../data';
import { schedule } from '../srs';
import { speak } from '../speech';
import { t } from '../i18n';
import type { Ctx, ViewResult, Grade, WordEntry, Example } from '../types';

const GRADES: Grade[] = [
  { label: 'grade.again', q: 1, cls: 'again' },
  { label: 'grade.hard', q: 3, cls: 'hard' },
  { label: 'grade.good', q: 4, cls: 'good' },
  { label: 'grade.easy', q: 5, cls: 'easy' },
];

export default function drill(_params: string[], { navigate }: Ctx): ViewResult {
  const el = h('div', { class: 'page page-focus' });
  let queue: (WordEntry & { listId: string })[] = [];
  let idx = 0;
  let revealed = false;
  let sentences: Record<string, Example[]> = {};
  const session = { total: 0, ok: 0 };

  const topbar = h('div', { class: 'topbar' },
    h('button', { class: 'btn ghost', onclick: () => navigate('#/') }, h('i', { class: 'fa-solid fa-arrow-left' }), t('common.back')),
    h('div', { class: 'progress-info' }, t('drill.title')),
  );
  const area = h('div', { class: 'card-area' });
  el.append(topbar, area);

  function updateProgress(): void {
    const pi = topbar.querySelector('.progress-info');
    if (pi) pi.textContent = `${Math.min(idx, queue.length)} / ${queue.length}`;
  }
  function drawDone(): void {
    area.innerHTML = '';
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
    updateProgress();
    if (idx >= queue.length) return drawDone();
    const e = queue[idx];
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
      area.append(h('div', { class: 'grades' }, ...GRADES.map((g) => h('button', { class: `grade ${g.cls}`, onclick: () => grade(g.q) }, t(g.label)))));
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

  (async () => {
    const diff = getDifficult();
    if (!diff.length) {
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
        continue;
      }
      const want = new Set(byList[listId]);
      for (const e of list) if (want.has(e.word)) q0.push({ ...e, listId });
    }
    shuffle(q0);
    queue = q0;
    try {
      sentences = await loadSentences();
    } catch (e) {
      /* optional */
    }
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
