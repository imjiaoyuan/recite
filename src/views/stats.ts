// Statistics: per-list progress, current streak, and an activity heatmap.
import { h } from '../ui';
import { getActivity, statsByList, dateKey } from '../store';
import { loadMeta } from '../data';
import { t, listName } from '../i18n';
import { topbar } from './common';
import type { Ctx, ViewResult } from '../types';

const DAY = 86400000;
// Monday = 0 .. Sunday = 6.
const dowMon = (d: Date): number => (d.getDay() + 6) % 7;

function currentStreak(activity: Record<string, number>): number {
  const today = new Date();
  const yesterday = new Date(Date.now() - DAY);
  let cursor: Date;
  if ((activity[dateKey(today)] || 0) > 0) cursor = today;
  else if ((activity[dateKey(yesterday)] || 0) > 0) cursor = yesterday;
  else return 0;
  let n = 0;
  while ((activity[dateKey(cursor)] || 0) > 0) {
    n++;
    // Step back by calendar day, not fixed milliseconds — DST-safe.
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  }
  return n;
}

// Intensity 0..3.
function level(c: number): number {
  if (c === 0) return 0;
  if (c < 4) return 1;
  if (c < 8) return 2;
  return 3;
}

interface Cell {
  key: string;
  count: number;
  future: boolean;
}

function buildHeat(activity: Record<string, number>, weeks = 17): { cells: Cell[]; weeks: number } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today.getTime() - (weeks - 1) * 7 * DAY - dowMon(today) * DAY);
  const cells: Cell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start.getTime() + i * DAY);
    cells.push({ key: dateKey(d), count: activity[dateKey(d)] || 0, future: d > today });
  }
  return { cells, weeks };
}

export default function stats(_params: string[], { navigate }: Ctx): ViewResult {
  const el = h('div', { class: 'page' });
  el.append(topbar(navigate, t('stats.title')));

  const loading = h('p', { class: 'muted' }, t('home.loading'));
  el.append(loading);

  (async () => {
    const m = await loadMeta();
    el.removeChild(loading);

    const activity = getActivity();
    const streak = currentStreak(activity);

    const heat = buildHeat(activity);
    const grid = h('div', { class: 'heat-grid' });
    for (const c of heat.cells) {
      grid.append(
        h('div', {
          class: `heat l${c.future ? 0 : level(c.count)}` + (c.future ? ' future' : ''),
          title: `${c.key}: ${c.count}`,
        }),
      );
    }

    el.append(
      h('div', { class: 'stats-total' },
        h('div', { class: 'big' }, String(streak)),
        h('div', { class: 'muted' }, t('stats.streak', { n: streak })),
      ),
      h('div', { class: 'card heatmap-card' },
        h('div', { class: 'section-label' }, t('stats.heat')),
        grid,
        h('div', { class: 'heat-legend muted' },
          h('span', {}, t('stats.less')),
          h('i', { class: 'heat l0' }),
          h('i', { class: 'heat l1' }),
          h('i', { class: 'heat l2' }),
          h('i', { class: 'heat l3' }),
          h('span', {}, t('stats.more')),
        ),
      ),
    );

    const byList = statsByList();
    let totalSeen = 0;
    let totalDue = 0;
    el.append(h('div', { class: 'section-label', style: 'margin-top:24px' }, t('stats.section')));
    for (const list of m.lists) {
      const total = list.count;
      const s = byList[list.id] || { started: 0, due: 0 };
      totalSeen += s.started;
      totalDue += s.due;
      const pct = total ? (s.started / total) * 100 : 0;
      el.append(
        h('div', { class: 'stat-row' },
          h('div', { class: 'stat-name' }, listName(list.id)),
          h('div', { class: 'stat-bar progress' }, h('div', { class: 'progress-bar', style: `width:${pct}%` })),
          h('div', { class: 'stat-num' }, t('stats.fmt', { a: s.started, b: total, n: s.due })),
        ),
      );
    }
    el.append(
      h('div', { class: 'stats-total', style: 'margin-top:24px' },
        h('div', { class: 'big' }, String(totalSeen)),
        h('div', { class: 'muted' }, t('stats.total', { n: totalDue })),
      ),
    );
  })().catch((err: Error) => {
    loading.textContent = err.message;
  });

  return { el };
}
