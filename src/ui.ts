// h(tag, attrs, ...children). attrs are loose (class/style/html/on* event handlers).
export function h(tag: string, attrs: Record<string, any> = {}, ...children: unknown[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, String(v));
  }
  for (const c of (children.flat() as unknown[])) {
    if (c === null || c === undefined || c === false || c === true) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : (c as Node));
  }
  return el;
}

// Fisher-Yates shuffle (in place).
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Transient toast message. Pass an action for anything the user may want to act on
// (the new-version notice): it lingers longer and gets a button.
let liveToasts = 0;
export function toast(msg: string, action?: { label: string; onClick: () => void }): void {
  const el = document.createElement('div');
  el.className = 'toast';
  el.append(document.createTextNode(msg));

  // Stack instead of piling up on the same spot — two can be in flight at boot
  // (new version + unsupported browser language).
  el.style.bottom = `${28 + liveToasts * 52}px`;
  liveToasts++;

  let done = false;
  function dismiss(): void {
    if (done) return; // the action button and the timer race
    done = true;
    clearTimeout(timer);
    liveToasts--;
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }

  if (action) {
    el.append(h('button', { type: 'button', class: 'toast-action', onclick: () => { action.onClick(); dismiss(); } }, action.label));
  }

  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  const timer = setTimeout(dismiss, action ? 8000 : 2400);
}
