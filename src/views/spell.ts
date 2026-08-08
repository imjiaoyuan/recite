import { h } from '../ui';
import { getMeta, setMeta, bumpActivity } from '../store';
import { loadList, loadSentences } from '../data';
import { buildSession } from '../session';
import { schedule } from '../srs';
import { speak } from '../speech';
import { t } from '../i18n';
import type { Ctx, ViewResult, WordEntry, Example } from '../types';

// Blank the target word out of an example sentence (case-insensitive, whole word).
function cloze(sentence: string, word: string): string {
  if (!sentence) return '';
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return sentence.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '_____');
}

interface Answered {
  ok: boolean;
  timeout?: boolean;
}

export default function spell([listId]: string[], { navigate }: Ctx): ViewResult {
  const el = h('div', { class: 'page page-focus' });
  let queue: WordEntry[] = [];
  let idx = 0;
  let answered: Answered | false = false;
  let sentences: Record<string, Example[]> = {};
  const session = { total: 0, ok: 0 };

  let timerId: ReturnType<typeof setInterval> | null = null;
  let timeLeft = 0;
  let timerEl: HTMLElement | null = null;

  const topbar = h('div', { class: 'topbar' },
    h('button', { class: 'btn ghost', onclick: () => navigate('#/') }, h('i', { class: 'fa-solid fa-arrow-left' }), t('common.back')),
    h('div', { class: 'progress-info' }, ''),
  );
  const area = h('div', { class: 'card-area' });
  el.append(topbar, area);

  function clearTimer(): void {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }
  function paintTimer(): void {
    if (timerEl) {
      timerEl.innerHTML = '';
      timerEl.append(h('i', { class: 'fa-solid fa-clock' }), ` ${timeLeft}s`);
      timerEl.classList.toggle('warn', timeLeft <= 3);
    }
  }
  function startTimer(seconds: number): void {
    timeLeft = seconds;
    paintTimer();
    timerId = setInterval(() => {
      timeLeft -= 1;
      if (timeLeft <= 0) {
        clearTimer();
        markWrong(true);
      } else {
        paintTimer();
      }
    }, 1000);
  }

  function updateProgress(): void {
    const pi = topbar.querySelector('.progress-info');
    if (pi) pi.textContent = `${Math.min(idx, queue.length)} / ${queue.length}`;
  }

  function drawDone(): void {
    clearTimer();
    area.innerHTML = '';
    const empty = queue.length === 0;
    const acc = session.total ? Math.round((session.ok / session.total) * 100) : 0;
    area.append(
      h('div', { class: 'done' },
        h('div', { class: 'done-title' }, empty ? t('done.noneSpell') : t('done.titleSpell')),
        h('div', { class: 'muted' }, empty ? t('done.noneHintSpell') : t('done.countSpell', { total: session.total, ok: session.ok, acc })),
        h('div', {},
          h('button', { class: 'btn primary', onclick: () => navigate(`#/spell/${listId}`) }, t('done.again')),
          h('button', { class: 'btn', onclick: () => navigate('#/') }, t('done.home')),
        ),
      ),
    );
  }

  function render(): void {
    updateProgress();
    if (idx >= queue.length) return drawDone();
    const e: WordEntry = queue[idx];
    const ex: Example | undefined = (sentences[e.word.toLowerCase()] || [])[0];
    const voice = getMeta().voice;
    const countdown = getMeta().spellCountdown || 0;

    area.innerHTML = '';

    if (answered) {
      clearTimer();
      const ok = answered.ok;
      area.append(
        h('div', { class: 'entry' },
          h('div', { class: `feedback ${ok ? 'right' : 'wrong'}` },
            ok ? t('spell.right') : (answered.timeout ? t('spell.timeout') : t('spell.wrong', { word: e.word }))),
          h('div', { class: 'phonetic' }, e.phonetic || ''),
          h('div', { class: 'trans' }, e.translation || t('noMeaning')),
          ex
            ? h('div', { class: 'example' },
                h('div', { class: 'ex-en', onclick: () => speak(ex.en, voice) }, ex.en),
                ex.zh ? h('div', { class: 'ex-zh muted' }, ex.zh) : null)
            : null,
        ),
        h('button', { class: 'btn primary big', onclick: next }, t('spell.next'), h('i', { class: 'fa-solid fa-arrow-right' })),
      );
      const nb = area.querySelector('.btn.primary.big') as HTMLElement | null;
      if (nb) setTimeout(() => nb.focus(), 0);
      return;
    }

    clearTimer();
    timerEl = countdown > 0 ? h('div', { class: 'timer' }) : null;
    const card = h('div', { class: 'entry' },
      timerEl,
      h('div', { class: 'spell-prompt' }, e.translation || t('noMeaning')),
      ex ? h('div', { class: 'cloze muted' }, cloze(ex.en, e.word)) : null,
    );

    const input = h('input', {
      class: 'spell-input',
      type: 'text',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      placeholder: t('spell.placeholder'),
    }) as HTMLInputElement;
    input.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Enter') submit(input.value);
    });

    area.append(card, input);
    area.append(h('button', { class: 'btn primary big', onclick: () => submit(input.value) }, t('spell.submit')));
    setTimeout(() => input.focus(), 0);
    if (countdown > 0) startTimer(countdown);
  }

  function markWrong(timeout = false): void {
    clearTimer();
    schedule(listId, queue[idx].word, 1);
    bumpActivity(1);
    session.total += 1;
    answered = { ok: false, timeout };
    render();
  }

  function submit(value: string): void {
    if (answered) return;
    const e = queue[idx];
    if (value.trim().toLowerCase() !== e.word.toLowerCase()) return markWrong(false);
    clearTimer();
    schedule(listId, e.word, 4);
    bumpActivity(1);
    session.total += 1;
    session.ok += 1;
    answered = { ok: true };
    render();
  }

  function next(): void {
    idx += 1;
    answered = false;
    render();
  }

  (async () => {
    setMeta({ selectedList: listId });
    const list = await loadList(listId);
    const s = buildSession(list, listId, getMeta().dailyLimit || 50);
    queue = s.due.concat(s.fresh);
    try {
      sentences = await loadSentences();
    } catch (e) {
      /* optional */
    }
    render();
  })().catch((err: Error) => {
    clearTimer();
    area.innerHTML = '';
    area.append(h('div', { class: 'done' }, h('div', { class: 'done-title' }, t('loadFail')), h('div', { class: 'muted' }, err.message)));
  });

  return { el, cleanup: clearTimer };
}
