import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const entry = (id, title) => ({ id, date: '2026-09-23', title, note: 'Private', category: 'General', completed: false });
const tick = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };

function journalHarness({ cache = {}, users = {}, remote = {} } = {}) {
  const data = new Map(Object.entries(cache));
  const localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const created = [];
  let submitCreate;
  const learningForm = { addEventListener: (_, handler) => { submitCreate = handler; } };
  let learningRequest = async () => ({ entries: remote[currentUser?.id] ?? [] });
  let currentUser = null;
  let renders = 0;
  const api = {
    login: async email => { currentUser = users[email]; return { user: currentUser }; }, logout: async () => { currentUser = null; },
    health: async () => ({}), overview: async () => ({ entries: [], sourceFile: '', generatedAt: '' }),
    activity: async () => ({ events: [] }), settings: async () => ({}),
    learning: () => learningRequest(), changeLogs: async () => ({ entries: [] }),
    createLearning: async payload => { created.push({ owner: currentUser?.id, ...payload }); return entry('created', payload.title); },
    updateLearning: async (id, payload) => ({ ...payload, id }), deleteLearning: async () => {},
  };
  const code = [
    between('const today =', '\nfunction applyTheme()'),
    between('function learningCalendar()', '\nfunction renderMarkdown('),
    between('async function loginAccount(', '\nasync function verifyCurrentEmailToken('),
    between('async function logoutAccount(', '\nasync function bootstrapAuth('),
    between('async function syncBackend()', '\nlet disposeLanding:'),
    between('function bindLearningJournalEvents()', "\nwindow.addEventListener('popstate'"),
  ].join('\n') + '\nreturn { loginAccount, logoutAccount, syncBackend, persistLearningEntry, removeLearningEntry, bindLearningJournalEvents, renderLearningPage, get entries() { return learningEntries; }, get owner() { return currentUser?.id; } };';
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = {
    localStorage, api, currentUser, authChecked: false, authState: {}, route: {}, page: '', profileBusy: false,
    dashboardEntryPending: false, authView: '', overviewDataState: '', overviewFailedSources: new Set(),
    backendOnline: false, backendError: '', logs: [], activityEvents: [], changeLogEntries: [],
    syncLifestyleData: async () => ({}), syncDoingData: async () => ({}), errorMessage: error => String(error),
    render: () => { renders++; }, history: { replaceState() {} }, pagePaths: { overview: '/overview' },
    window: { setTimeout() {} }, document: { querySelector: selector => selector === '#learning-form' ? learningForm : null, querySelectorAll: () => [] },
    FormData: class { constructor(form) { this.form = form; } get(key) { return this.form.fields[key]; } },
    requestAnimationFrame() {}, icon: () => '', Date,
  };
  const runtime = Function(...Object.keys(context), js)(...Object.values(context));
  runtime.data = data;
  runtime.created = created;
  Object.defineProperty(runtime, 'renders', { get: () => renders });
  runtime.setLearningRequest = fn => { learningRequest = fn; };
  runtime.setUpdateResponse = callback => { api.updateLearning = () => new Promise(callback); };
  runtime.setCreateResponse = callback => { api.createLearning = payload => { created.push({ owner: currentUser?.id, ...payload }); return new Promise(callback); }; };
  runtime.submitCreate = fields => { runtime.bindLearningJournalEvents(); return submitCreate({ preventDefault() {}, currentTarget: { fields } }); };
  runtime.visibleTitles = () => {
    const dom = new JSDOM(runtime.renderLearningPage());
    return [...dom.window.document.querySelectorAll('.learning-entry h3')].map(node => node.textContent);
  };
  return runtime;
}

test('A journal in memory and legacy cache never appears in B or uploads into an empty B backend', async () => {
  const a = { id: 'a' }, b = { id: 'b' };
  const privateEntry = entry('a1', 'A private journal');
  const app = journalHarness({ users: { a, b }, remote: { a: [privateEntry], b: [] }, cache: { 'hermes-monitor-learning-v1': JSON.stringify({ '2026-09-23': [privateEntry] }) } });
  await app.loginAccount('a', '');
  assert.equal(app.entries['2026-09-23'][0].title, 'A private journal');
  assert.deepEqual(app.visibleTitles(), ['A private journal']);
  await app.logoutAccount();
  assert.deepEqual(app.entries, {}, 'logout clears in-memory journal');
  assert.deepEqual(app.visibleTitles(), [], 'logout hides A journal in rendered DOM');
  await app.loginAccount('b', '');
  assert.deepEqual(app.entries, {}, 'B never sees A journal');
  assert.deepEqual(app.visibleTitles(), [], 'B journal DOM has no A rows');
  assert.deepEqual(app.created, [], 'empty B backend must not trigger legacy cache migration');
  assert.deepEqual(JSON.parse(app.data.get('hermes-monitor-learning-v1')), { '2026-09-23': [privateEntry] }, 'unowned legacy cache is quarantined, not deleted or overwritten');
});

test('same owner reload restores backend journal and CRUD persists without local cache', async () => {
  const a = { id: 'a' };
  const app = journalHarness({ users: { a }, remote: { a: [entry('a1', 'Saved lesson')] } });
  await app.loginAccount('a', '');
  assert.equal(app.entries['2026-09-23'][0].title, 'Saved lesson');
  const persisted = new Map(app.data);
  const reload = journalHarness({ users: { a }, remote: { a: [entry('a1', 'Saved lesson')] }, cache: Object.fromEntries(persisted) });
  await reload.loginAccount('a', '');
  assert.equal(reload.entries['2026-09-23'][0].title, 'Saved lesson');
  await reload.persistLearningEntry({ ...reload.entries['2026-09-23'][0], completed: true });
  assert.equal(reload.entries['2026-09-23'][0].completed, true);
  await reload.removeLearningEntry(reload.entries['2026-09-23'][0]);
  assert.deepEqual(reload.entries['2026-09-23'], []);
});

test('old async learning response is ignored after auth switch', async () => {
  const a = { id: 'a' }, b = { id: 'b' };
  const app = journalHarness({ users: { a, b } });
  let resolveOld;
  app.setLearningRequest(() => app.owner === 'a' ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ entries: [] }));
  const loginA = app.loginAccount('a', '');
  await tick();
  await app.logoutAccount();
  await app.loginAccount('b', '');
  resolveOld({ entries: [entry('a1', 'Late private lesson')] });
  await loginA;
  assert.deepEqual(app.entries, {});
  assert.deepEqual(app.created, []);
  assert.ok(![...app.data.values()].some(value => value.includes('Late private lesson')));
});

test('B has no A rows even while B backend response is pending', async () => {
  const a = { id: 'a' }, b = { id: 'b' };
  const app = journalHarness({ users: { a, b }, remote: { a: [entry('a1', 'A private journal')] } });
  await app.loginAccount('a', '');
  let resolveB;
  app.setLearningRequest(() => new Promise(resolve => { resolveB = resolve; }));
  await app.logoutAccount();
  const loginB = app.loginAccount('b', '');
  await tick();
  assert.deepEqual(app.entries, {});
  resolveB({ entries: [] });
  await loginB;
  assert.deepEqual(app.entries, {});
});

test('late journal update from A cannot mutate B journal or status', async () => {
  const a = { id: 'a' }, b = { id: 'b' };
  const app = journalHarness({ users: { a, b }, remote: { a: [entry('a1', 'A lesson')], b: [entry('b1', 'B lesson')] } });
  await app.loginAccount('a', '');
  let resolveUpdate;
  // The original API instance is used by the extracted app functions.
  app.setUpdateResponse(resolve => { resolveUpdate = resolve; });
  const update = app.persistLearningEntry({ ...app.entries['2026-09-23'][0], title: 'Edited A' });
  await app.logoutAccount();
  await app.loginAccount('b', '');
  resolveUpdate(entry('a1', 'Edited A'));
  await update;
  assert.deepEqual(app.entries['2026-09-23'].map(item => item.title), ['B lesson']);
});

test('late journal create from A cannot append to B journal', async () => {
  const a = { id: 'a' }, b = { id: 'b' };
  const app = journalHarness({ users: { a, b }, remote: { b: [entry('b1', 'B lesson')] } });
  await app.loginAccount('a', '');
  let resolveCreate;
  app.setCreateResponse(resolve => { resolveCreate = resolve; });
  const create = app.submitCreate({ title: 'A new lesson', note: 'Private', category: 'General' });
  await app.logoutAccount();
  await app.loginAccount('b', '');
  resolveCreate(entry('a2', 'A new lesson'));
  await create;
  assert.deepEqual(app.entries['2026-09-23'].map(item => item.title), ['B lesson']);
  assert.deepEqual(app.created.map(item => item.owner), ['a']);
});
