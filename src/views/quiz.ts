// Shared quiz flow behind spell and dictation: question card with an optional
// countdown timer, a text input, binary grading (wrong/timeout -> q=1, correct
// -> q=4), feedback reveal, and the done screen. The two views plug in their
// question UI and feedback extras via hooks; everything else is identical.
//
// The first card renders as soon as the word list arrives; sentences.json
// (4+ MB) loads behind it. When it lands, the feedback view re-renders freely
// (no input to lose), and a question card re-renders only when the mode's
// prompt itself needs sentences (spell's cloze) — typed text and focus are
// preserved, so a slow fetch never blocks or wipes typing.
import { h } from '../ui';
import { getMeta, setMeta, bumpActivity, bumpNew, getWordState } from '../store';
import { loadList, loadSentences } from '../data';
import { buildSession, dailyLimit } from '../session';
import { schedule } from '../srs';
import { speak } from '../speech';
import { t } from '../i18n';
import { topbar, setProgress, loadFailEl, loadingEl } from './common';
import type { Ctx, ViewResult, WordEntry, Example } from '../types';

interface Answered {
  ok: boolean;
  timeout?: boolean;
}

export interface QuizHooks {
  // Route prefix for the done screen's "again" button, e.g. '#/spell'.
  route: string;
  // i18n key for the input's placeholder text (resolved lazily — the hook
  // objects are built at module scope, before initI18n() has run).
  placeholderKey: string;
  // Extra class(es) for the question card (dictation uses 'dict-card').
  cardClass?: string;
  // Question-card content below the timer; the input is added by the flow.
  prompt: (e: WordEntry, ex: Example | undefined, voice: string) => unknown[];
  // Called each time a question card appears (dictation auto-plays the word).
  onPrompt?: (e: WordEntry, voice: string) => void;
  // Extra feedback content between the verdict and the phonetic (dictation
  // reveals the word; spell shows nothing — that's the point of the test).
  feedbackExtra?: (e: WordEntry, voice: string) => unknown;
  // True when the question prompt itself renders sentence data (spell's cloze):
  // a card painted before sentences.json arrived gets re-prompted when it lands.
  repromptOnSentences?: boolean;
}

export function quiz({ route, placeholderKey, cardClass, prompt, onPrompt, feedbackExtra, repromptOnSentences: reprompt }: QuizHooks) {
  return function ([listId]: string[], { navigate }: Ctx): ViewResult {
    const el = h('div', { class: 'page page-focus' });
    let queue: WordEntry[] = [];
    let idx = 0;
    let answered: Answered | false = false;
    let sentences: Record<string, Example[]> = {};
    const session = { total: 0, ok: 0 };
    // 墨墨-style: a wrong answer gets one more pass at the queue tail today —
    // FSRS otherwise won't resurface the word until its next due date. The
    // retry counts as another attempt in the totals (accuracy reflects retries).
    const revisited = new Set<string>();

    let timerId: ReturnType<typeof setInterval> | null = null;
    let timeLeft = 0;
    let timerEl: HTMLElement | null = null;

    const bar = topbar(navigate);
    const area = h('div', { class: 'card-area' }, loadingEl());
    el.append(bar, area);

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
            h('button', { class: 'btn primary', onclick: () => navigate(`${route}/${listId}`) }, t('done.again')),
            h('button', { class: 'btn', onclick: () => navigate('#/') }, t('done.home')),
          ),
        ),
      );
    }

    function render(): void {
      setProgress(bar, idx, queue.length);
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
            feedbackExtra ? feedbackExtra(e, voice) : null,
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
      const card = h('div', { class: cardClass ? `entry ${cardClass}` : 'entry' },
        timerEl,
        ...prompt(e, ex, voice),
      );

      const input = h('input', {
        class: 'spell-input',
        type: 'text',
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        placeholder: t(placeholderKey),
      }) as HTMLInputElement;
      input.addEventListener('keydown', (ev: KeyboardEvent) => {
        if (ev.key === 'Enter') submit(input.value);
      });

      area.append(card, input);
      area.append(h('button', { class: 'btn primary big', onclick: () => submit(input.value) }, t('spell.submit')));
      setTimeout(() => input.focus(), 0);
      onPrompt?.(e, voice);
      if (countdown > 0) startTimer(countdown);
    }

    function markWrong(timeout = false): void {
      clearTimer();
      const e = queue[idx];
      if (!getWordState(listId, e.word)) bumpNew(listId); // first-ever grade = a new word today
      schedule(listId, e.word, 1);
      bumpActivity(1);
      session.total += 1;
      if (!revisited.has(e.word)) {
        queue.push(e);
        revisited.add(e.word);
      }
      answered = { ok: false, timeout };
      render();
    }

    function submit(value: string): void {
      if (answered) return;
      const e = queue[idx];
      if (value.trim().toLowerCase() !== e.word.toLowerCase()) return markWrong(false);
      clearTimer();
      if (!getWordState(listId, e.word)) bumpNew(listId);
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
      const s = buildSession(list, listId, dailyLimit());
      queue = s.due.concat(s.fresh);
      render(); // first card as soon as the list is in
      sentences = await loadSentences();
      if (answered) {
        render(); // attach examples to the feedback view (no input to lose)
      } else if (reprompt && idx < queue.length) {
        // The prompt needs sentences (spell's cloze) — re-draw the card, keeping
        // what the user has typed and the focus. The countdown restarts from
        // full, which can only give them more time.
        const old = area.querySelector<HTMLInputElement>('input.spell-input');
        const val = old ? old.value : '';
        const focused = !!old && document.activeElement === old;
        render();
        const input = area.querySelector<HTMLInputElement>('input.spell-input');
        if (input) {
          input.value = val;
          if (focused) input.focus();
        }
      }
    })().catch((err: Error) => {
      clearTimer();
      area.innerHTML = '';
      area.append(loadFailEl(err));
    });

    return { el, cleanup: clearTimer };
  };
}
