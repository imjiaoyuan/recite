// Dictation: listen to the pronunciation and type the word. No meaning shown
// until reveal. All flow logic lives in quiz.ts.
import { quiz } from './quiz';
import { h } from '../ui';
import { speak } from '../speech';
import { t } from '../i18n';

export default quiz({
  route: '#/dictation',
  placeholderKey: 'dict.placeholder',
  cardClass: 'dict-card',
  prompt: (e, _ex, voice) => [
    h('button', { class: 'play-btn', onclick: () => speak(e.word, voice) },
      h('i', { class: 'fa-solid fa-volume-high' }),
      h('span', {}, t('dict.listen')),
    ),
    h('button', { class: 'replay', onclick: () => speak(e.word, voice) }, t('dict.replay')),
  ],
  onPrompt: (e, voice) => speak(e.word, voice),
  feedbackExtra: (e, voice) => h('div', { class: 'word', onclick: () => speak(e.word, voice) }, e.word),
});
