/** Progressive enhancement: filtering, sorting, URL state and the details dialog. */

export {}; // module scope, so names like `status` / `opener` don't clash with window globals

type SortKey =
  | 'name-asc' | 'name-desc'
  | 'created-desc' | 'created-asc'
  | 'updated-desc' | 'updated-asc'
  | 'deployed-desc' | 'deployed-asc'
  | 'provider' | 'framework' | 'services-desc';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const form = byId<HTMLFormElement>('controls');
const grid = byId<HTMLUListElement>('grid');
const status = byId<HTMLParagraphElement>('result-count');
const empty = byId<HTMLDivElement>('empty');
const dialog = byId<HTMLDialogElement>('detail-dialog');
const dialogContent = byId<HTMLDivElement>('dialog-content');
const toggle = byId<HTMLButtonElement>('filters-toggle');
const panel = byId<HTMLDivElement>('filter-panel');

const items = [...grid.querySelectorAll<HTMLLIElement>(':scope > li')];
const total = items.length;

const num = (el: HTMLElement, key: string) => Number(el.dataset[key] ?? 0);
const str = (el: HTMLElement, key: string) => el.dataset[key] ?? '';
const byName = (a: HTMLElement, b: HTMLElement) => str(a, 'name').localeCompare(str(b, 'name'));

const comparators: Record<SortKey, (a: HTMLElement, b: HTMLElement) => number> = {
  'name-asc': byName,
  'name-desc': (a, b) => byName(b, a),
  'created-desc': (a, b) => num(b, 'created') - num(a, 'created'),
  'created-asc': (a, b) => num(a, 'created') - num(b, 'created'),
  'updated-desc': (a, b) => num(b, 'updated') - num(a, 'updated'),
  'updated-asc': (a, b) => num(a, 'updated') - num(b, 'updated'),
  // Never-deployed (0) sinks to the bottom in both directions.
  'deployed-desc': (a, b) => num(b, 'deployed') - num(a, 'deployed'),
  'deployed-asc': (a, b) => (num(a, 'deployed') || Infinity) - (num(b, 'deployed') || Infinity),
  provider: (a, b) => str(a, 'provider').localeCompare(str(b, 'provider')),
  // Empty framework sorts last.
  framework: (a, b) => (str(a, 'framework') || '\uffff').localeCompare(str(b, 'framework') || '\uffff'),
  'services-desc': (a, b) => num(b, 'serviceCount') - num(a, 'serviceCount'),
};

interface State {
  q: string;
  providers: string[];
  framework: string;
  service: string;
  git: boolean;
  domain: boolean;
  withServices: boolean;
  sort: SortKey;
}

const field = <T extends HTMLElement>(name: string) => form.elements.namedItem(name) as T;

function readState(): State {
  const data = new FormData(form);
  return {
    q: String(data.get('q') ?? '').trim().toLowerCase(),
    providers: data.getAll('provider').map(String),
    framework: String(data.get('framework') ?? ''),
    service: String(data.get('service') ?? ''),
    git: data.has('git'),
    domain: data.has('domain'),
    withServices: data.has('withServices'),
    sort: (String(data.get('sort')) || 'name-asc') as SortKey,
  };
}

function matches(el: HTMLElement, s: State): boolean {
  if (s.q && !str(el, 'search').includes(s.q)) return false;
  if (s.providers.length && !s.providers.includes(str(el, 'provider'))) return false;
  if (s.framework === '__none__' ? str(el, 'framework') !== '' : s.framework && str(el, 'framework') !== s.framework) return false;
  if (s.service && !str(el, 'services').split(' ').includes(s.service)) return false;
  if (s.git && str(el, 'git') !== '1') return false;
  if (s.domain && str(el, 'domain') !== '1') return false;
  if (s.withServices && num(el, 'serviceCount') === 0) return false;
  return true;
}

function countActiveFilters(s: State): number {
  return [s.providers.length > 0, !!s.framework, !!s.service, s.git, s.domain, s.withServices].filter(Boolean).length;
}

function syncUrl(s: State) {
  const params = new URLSearchParams();
  if (s.q) params.set('q', s.q);
  s.providers.forEach((p) => params.append('provider', p));
  if (s.framework) params.set('framework', s.framework);
  if (s.service) params.set('service', s.service);
  if (s.git) params.set('git', '1');
  if (s.domain) params.set('domain', '1');
  if (s.withServices) params.set('withServices', '1');
  if (s.sort !== 'name-asc') params.set('sort', s.sort);
  const query = params.toString();
  history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
}

function apply() {
  const s = readState();
  const visible = items.filter((el) => matches(el, s));
  const visibleSet = new Set(visible);

  items.forEach((el) => (el.hidden = !visibleSet.has(el)));
  const ordered = [...items].sort((a, b) => comparators[s.sort](a, b) || byName(a, b));
  grid.append(...ordered);

  status.textContent = `Showing ${visible.length} of ${total} deployments`;
  empty.hidden = visible.length > 0;
  grid.hidden = visible.length === 0;

  const active = countActiveFilters(s);
  toggle.textContent = active ? `Filters (${active})` : 'Filters';
  syncUrl(s);
}

function restoreFromUrl() {
  const params = new URLSearchParams(location.search);
  field<HTMLInputElement>('q').value = params.get('q') ?? '';
  const providers = params.getAll('provider');
  form.querySelectorAll<HTMLInputElement>('input[name="provider"]').forEach((box) => (box.checked = providers.includes(box.value)));
  const setSelect = (name: string, value: string | null) => {
    const select = field<HTMLSelectElement>(name);
    select.value = value ?? '';
    if (select.value !== (value ?? '')) select.value = ''; // unknown option in URL
  };
  setSelect('framework', params.get('framework'));
  setSelect('service', params.get('service'));
  setSelect('sort', params.get('sort') ?? 'name-asc');
  (['git', 'domain', 'withServices'] as const).forEach((name) => (field<HTMLInputElement>(name).checked = params.get(name) === '1'));
}

// Debounce typing so screen readers aren't flooded with count announcements.
let timer: number | undefined;
form.addEventListener('input', (event) => {
  window.clearTimeout(timer);
  if ((event.target as HTMLElement).id === 'q') timer = window.setTimeout(apply, 200);
  else apply();
});
form.addEventListener('submit', (e) => e.preventDefault());
form.addEventListener('reset', () => setTimeout(apply)); // after the browser has reset the fields
byId('empty-reset').addEventListener('click', () => {
  form.reset();
  field<HTMLInputElement>('q').focus();
});

// Filter panel: collapsible on small screens, always open on wide ones (CSS shows it regardless).
const wide = window.matchMedia('(min-width: 48em)');
toggle.hidden = false;
const setPanel = (open: boolean) => {
  panel.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
};
toggle.addEventListener('click', () => setPanel(panel.hasAttribute('hidden')));
setPanel(wide.matches);
wide.addEventListener('change', (e) => setPanel(e.matches));

// Details dialog -------------------------------------------------------------
let openedByClick = false;
let opener: HTMLElement | null = null;

const idFromHash = () => {
  const match = /^#d=(.+)$/.exec(location.hash);
  return match ? decodeURIComponent(match[1]!) : null;
};

function showDialog(id: string) {
  const item = items.find((el) => el.dataset.id === id);
  const template = item?.querySelector<HTMLTemplateElement>('template[data-detail]');
  if (!template) return false;
  dialogContent.replaceChildren(template.content.cloneNode(true));
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  dialog.querySelector<HTMLElement>('.dialog__panel')!.scrollTop = 0;
  return true;
}

grid.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.card__open');
  const item = button?.closest<HTMLLIElement>('li.card-item');
  if (!button || !item?.dataset.id) return;
  opener = button;
  openedByClick = true;
  location.hash = `d=${encodeURIComponent(item.dataset.id)}`;
});

function syncDialogToHash() {
  const id = idFromHash();
  if (id) {
    if (!showDialog(id)) history.replaceState(history.state, '', location.pathname + location.search);
  } else if (dialog.open) {
    dialog.close();
  }
}
window.addEventListener('hashchange', syncDialogToHash);

dialog.addEventListener('close', () => {
  dialogContent.replaceChildren();
  if (idFromHash()) {
    // Closed via Esc / button while the hash is still set: unwind our own history entry if we made one.
    if (openedByClick) history.back();
    else history.replaceState(history.state, '', location.pathname + location.search);
  }
  openedByClick = false;
  (opener?.isConnected ? opener : null)?.focus();
  opener = null;
});
byId('dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close(); // backdrop
});

restoreFromUrl();
apply();
syncDialogToHash();
