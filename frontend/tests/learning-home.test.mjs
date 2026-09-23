import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
const src = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
async function load(name) {
  const output = ts.transpileModule(src(name), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}
const session = (id, fields = {}) => ({ id, moduleId: 'm1', date: '2026-09-20', title: `Sesi ${id}`, targetMinutes: 30, actualMinutes: 0, status: 'planned', reflection: '', confusion: '', nextStep: '', reviewDate: '', objective: '', practicePlan: '', method: '', plannedItems: [], actualItems: [], createdAt: '', ...fields });
const modules = [{ id: 'm1', title: 'Modul nyata', category: 'Bahasa', level: '', objective: '', note: '', materials: [], createdAt: '' }];
function mount() { const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { url: 'https://zeno.test/learning' }); globalThis.document = dom.window.document; return dom.window.document.querySelector('#app'); }
const tick = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
test('journal route is separate from overview, and nav targets journal', async () => {
  const { resolveAppRoute } = await load('app-route.ts');
  assert.deepEqual(resolveAppRoute('/learning/journal'), { kind: 'learning-journal' });
  assert.deepEqual(resolveAppRoute('/learning'), { kind: 'page', page: 'learning' });
  assert.match(src('learning-manual.ts'), /href="\/learning\/journal"[^>]*>Jurnal/);
  assert.match(src('orbit-navigation.ts'), /id: 'learning-journal'.*route: '\/learning\/journal'/);
});
test('Overview journal quick action opens its real editor and session routes retain Learning breadcrumb', async () => {
  const main = src('main.ts');
  assert.match(main, /learning: \{ path: '\/learning\/journal', selector: '#learning-form input\[name="title"\]' \}/);
  const { activeOrbitLocation } = await load('orbit-navigation.ts');
  for (const path of ['/learning/sessions/new', '/learning/sessions/session-id']) {
    assert.equal(activeOrbitLocation(path, 'user').item.id, 'learning');
  }
});
test('real sessions produce truthful metrics, ordered escaped rows, due queue and filtering', async () => {
  const { createLearningHome } = await load('learning-home.ts');
  const app = mount();
  const home = createLearningHome({ modules: async () => modules, sessions: async () => [session('a', { title: '<img src=x>', date: '2026-09-21', status: 'completed', actualMinutes: 25, reflection: 'Paham <script>!', confusion: 'Kenapa?', reviewDate: '2026-09-22' }), session('b', { date: '2026-09-19', targetMinutes: 45, reflection: 'Belum selesai', status: 'planned', reviewDate: '2026-09-22' })] });
  home.activate('user-a', () => {}); await tick();
  app.innerHTML = home.render(new Date('2026-09-23T12:00:00'));
  assert.deepEqual([...app.querySelectorAll('.lh-metrics > div')].map(item => [item.querySelector('strong').textContent, item.querySelector('span').textContent]), [['2', 'sesi tercatat'], ['25', 'menit aktual'], ['75', 'menit direncanakan'], ['1', 'refleksi sesi selesai'], ['1', 'review jatuh tempo']]);
  assert.equal(app.querySelectorAll('.lh-session').length, 2);
  assert.equal(app.querySelectorAll('.lh-review-item').length, 1);
  assert.ok(app.querySelector('.lh-session').textContent.includes('<img src=x>'));
  assert.equal(app.querySelector('.lh-session img'), null);
  assert.ok(app.querySelector('.lh-session').textContent.includes('Modul nyata'));
  let navigations = [];
  home.bind(app, path => navigations.push(path));
  app.querySelector('.lh-session a').click();
  assert.deepEqual(navigations, ['/learning/sessions/a']);
  const search = app.querySelector('[data-lh-search]'); search.value = 'tidak ada'; search.dispatchEvent(new app.ownerDocument.defaultView.Event('input', { bubbles: true }));
  assert.equal(app.querySelectorAll('.lh-session').length, 0);
  assert.match(app.textContent, /Tidak ada sesi yang cocok/);
});
test('loading, error, retry, empty and auth boundary discard stale responses', async () => {
  const { createLearningHome } = await load('learning-home.ts');
  let resolveOld, calls = 0;
  const home = createLearningHome({ modules: async () => modules, sessions: async () => { calls++; if (calls === 1) return new Promise(resolve => { resolveOld = resolve; }); if (calls === 2) throw Error('Offline'); return []; } });
  home.activate('a', () => {});
  assert.match(home.render(), /Memuat jejak belajar/);
  home.activate('b', () => {}); await tick();
  assert.match(home.render(), /Offline/);
  resolveOld([session('private')]); await tick();
  assert.doesNotMatch(home.render(), /private/);
  home.retry(); await tick();
  assert.match(home.render(), /Belum ada sesi/);
  assert.doesNotMatch(home.render(), /private/);
  home.deactivate(); home.activate('b', () => {}); await tick();
  assert.equal(calls, 4, 're-entry reloads session data after edits on another route');
});
test('app mounts overview only at /learning and keeps calendar CRUD on journal route', () => {
  const main = src('main.ts');
  assert.match(main, /createLearningHome\(/);
  assert.match(main, /route\.kind === 'learning-journal' \? renderLearningPage\(\)/);
  assert.match(main, /page === 'learning' \? `\s*\$\{learningHome\.render\(\)\}/);
  assert.match(main, /route\.kind === 'learning-journal'\) bindLearningJournalEvents\(/);
  assert.match(main, /learningHome\.reset\(currentUser\?\.id/);
  assert.match(main, /learningHome\.deactivate\(\)/);
});
