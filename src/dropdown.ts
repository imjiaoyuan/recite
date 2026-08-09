// Custom dropdown (fully styled, both closed and open) — replaces native <select>.
import { h } from './ui';

export interface DropdownOptions {
  label: string;
  options: [string | number, string][];
  current: string | number;
  onChange: (v: string) => void;
}

export function dropdown({ label, options, current, onChange }: DropdownOptions): HTMLElement {
  const cur = options.find(([v]) => String(v) === String(current));
  const valueSpan = h('span', { class: 'dd-value' }, cur ? cur[1] : '—');
  const caret = h('i', { class: 'fa-solid fa-chevron-down dd-caret' });
  const trigger = h(
    'button',
    { type: 'button', class: 'dd-trigger', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' },
    h('span', { class: 'dd-label' }, label),
    valueSpan,
    caret,
  );

  const menu = h('div', { class: 'dd-menu', role: 'listbox' });
  for (const [val, text] of options) {
    const selected = String(val) === String(current);
    menu.append(
      h(
        'button',
        {
          type: 'button',
          class: 'dd-item' + (selected ? ' selected' : ''),
          role: 'option',
          'aria-selected': String(selected),
          onclick: () => {
            onChange(String(val));
            close();
          },
        },
        text,
      ),
    );
  }

  const wrap = h('div', { class: 'dd' }, trigger, menu);
  let open = false;
  // Owns the outside-click listener's lifecycle: aborted on close, and self-cleaned
  // if the wrap is detached while open (no leaked document listener on unmount).
  let ac: AbortController | null = null;

  function paint(): void {
    menu.classList.toggle('open', open);
    wrap.classList.toggle('open', open);
    trigger.setAttribute('aria-expanded', String(open));
  }
  function onOutside(e: MouseEvent): void {
    if (!wrap.isConnected) {
      ac?.abort(); // orphaned (host unmounted while open) — clean up and bail.
      return;
    }
    if (!wrap.contains(e.target as Node)) close();
  }
  function openMenu(): void {
    open = true;
    paint();
    const ctrl = new AbortController();
    ac = ctrl;
    requestAnimationFrame(() => document.addEventListener('click', onOutside, { signal: ctrl.signal }));
  }
  function close(): void {
    open = false;
    paint();
    ac?.abort();
    ac = null;
  }
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (open) close();
    else openMenu();
  });

  return wrap;
}
