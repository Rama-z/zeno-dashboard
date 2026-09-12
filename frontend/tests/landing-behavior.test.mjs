import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

const source = await readFile(new URL('../src/landing.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function setup({ reduced = false, fine = true, touchPoints = 0 } = {}) {
  const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  Object.defineProperty(w.navigator, 'maxTouchPoints', { value: touchPoints });
  const media = new Map();
  w.matchMedia = (query) => {
    if (!media.has(query)) {
      const target = new w.EventTarget();
      target.matches = query.includes('reduced-motion') ? reduced : fine;
      media.set(query, target);
    }
    return media.get(query);
  };
  const frames = new Map(); let nextFrame = 0;
  w.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
  w.cancelAnimationFrame = (id) => frames.delete(id);
  const observers = [];
  w.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe() {} unobserve() {} disconnect() { this.disconnected = true; }
  };
  let networkCalls = 0;
  w.fetch = () => { networkCalls++; throw new Error('demo attempted network'); };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.eval(`var exports = {}; ${compiled}`);
  const api = w.exports;
  const app = w.document.querySelector('#app');
  app.innerHTML = api.renderLandingPage('light');
  let themeCalls = 0;
  const callbacks = { onThemeToggle() { themeCalls++; } };
  let cleanup = api.bindLandingEvents(callbacks);
  const $ = (selector) => app.querySelector(selector);
  return { w, $, app, api, frames, observers, media, callbacks, cleanup, get themeCalls() { return themeCalls; }, get networkCalls() { return networkCalls; }, close() { cleanup(); dom.window.close(); } };
}

test('demo changes counts and retains checklist and safely escaped journal across tabs and rerenders without network', () => {
  const env = setup();
  try {
    const { $, w, app, api } = env;
    $('[data-demo-task="1"]').click();
    assert.equal($('[data-demo-count]').textContent, '2 / 3 selesai');
    assert.equal($('[data-demo-progress]').value, 2);
    $('[data-workspace-module="journaling"]').click();
    assert.equal($('#landing-workspace-panel-journaling').hidden, false);
    const text = '</textarea><img src=x onerror=alert(1)> Pelan & pasti.';
    $('[data-demo-journal]').value = text;
    $('[data-demo-journal]').dispatchEvent(new w.Event('input', { bubbles: true }));
    $('[data-workspace-module="spending"]').click();
    assert.match($('[data-demo-total]').textContent, /152\.000/);
    $('[data-workspace-module="doing"]').click();
    assert.equal($('[data-demo-task="1"]').checked, true);
    $('[data-workspace-module="journaling"]').click();
    assert.equal($('[data-demo-journal]').value, text);
    env.cleanup();
    app.innerHTML = api.renderLandingPage('dark');
    const cleanup = api.bindLandingEvents(env.callbacks);
    assert.equal($('[data-demo-journal]').value, text);
    assert.equal($('[data-demo-journal]').parentElement.querySelector('img'), null);
    assert.equal($('#landing-workspace-panel-journaling').hidden, false);
    assert.equal(env.networkCalls, 0);
    assert.equal(w.localStorage.length, 0);
    cleanup();
  } finally { env.close(); }
});

test('keyboard tabs, menu Escape and theme callback remain accessible and are removed on cleanup', () => {
  const env = setup();
  try {
    const { $, w } = env;
    const first = $('[data-workspace-module="doing"]');
    first.focus();
    first.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal(w.document.activeElement.dataset.workspaceModule, 'learning');
    assert.equal($('#landing-workspace-panel-learning').hidden, false);
    w.document.activeElement.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    assert.equal(w.document.activeElement.dataset.workspaceModule, 'spending');
    $('[data-feature-tab="activity"]').click();
    assert.equal($('#landing-feature-panel-activity').hidden, false);
    $('[data-access-view="admin"]').click();
    assert.equal($('#landing-access-panel-admin').hidden, false);
    $('[data-landing-menu] .ph').click();
    assert.equal($('[data-landing-menu]').getAttribute('aria-expanded'), 'true');
    $('#landing-navigation a').focus();
    $('#landing-navigation a').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal($('[data-landing-menu]').getAttribute('aria-expanded'), 'false');
    assert.equal(w.document.activeElement, $('[data-landing-menu]'));
    $('[data-landing-theme]').click();
    assert.equal(env.themeCalls, 1);
    env.cleanup();
    $('[data-landing-theme]').click();
    assert.equal(env.themeCalls, 1, 'cleanup removes callbacks');
  } finally { env.close(); }
});

test('motion pause, live reduced-motion changes, touch policy, rebind and DOM removal clean up resources', async () => {
  const env = setup();
  try {
    const { $, w, api, app, media, frames, observers } = env;
    assert.equal($('[data-landing-page]').dataset.motion, 'running');
    $('[data-landing-pause]').click();
    assert.equal($('[data-landing-page]').dataset.motion, 'paused');
    assert.equal(frames.size, 0);
    const reduced = media.get('(prefers-reduced-motion: reduce)');
    reduced.matches = true;
    reduced.dispatchEvent(new w.Event('change'));
    assert.equal($('[data-landing-page]').dataset.motion, 'reduced');
    assert.equal($('[data-landing-pause]').disabled, true);
    reduced.matches = false;
    reduced.dispatchEvent(new w.Event('change'));
    assert.equal($('[data-landing-page]').dataset.motion, 'paused', 'OS changes do not erase manual pause');
    $('[data-landing-pause]').click();
    assert.equal($('[data-landing-page]').dataset.motion, 'running');
    const fine = media.get('(hover: hover) and (pointer: fine)');
    fine.matches = false;
    fine.dispatchEvent(new w.Event('change'));
    assert.equal($('[data-landing-page]').dataset.pointerMotion, 'false');
    api.bindLandingEvents(env.callbacks);
    $('[data-landing-theme]').click();
    assert.equal(env.themeCalls, 1, 'rebind must not duplicate handlers');
    const oldButton = $('[data-landing-theme]');
    app.replaceChildren();
    await new Promise((resolve) => w.setTimeout(resolve, 0));
    assert.equal(frames.size, 0);
    assert.ok(observers.every((observer) => observer.disconnected));
    oldButton.click();
    assert.equal(env.themeCalls, 1, 'detached nodes have no listeners');
  } finally { env.close(); }
});

test('touch-capable devices do not enable pointer parallax even with a fine pointer', () => {
  const env = setup({ fine: true, touchPoints: 5 });
  try { assert.equal(env.$('[data-landing-page]').dataset.pointerMotion, 'false'); }
  finally { env.close(); }
});

test('initial reduced motion has visible content and no parallax frames', () => {
  const env = setup({ reduced: true, fine: false });
  try {
    assert.equal(env.$('[data-landing-page]').dataset.motion, 'reduced');
    assert.equal(env.$('[data-landing-page]').dataset.pointerMotion, 'false');
    assert.equal(env.frames.size, 0);
    assert.ok([...env.app.querySelectorAll('[data-reveal]')].every((element) => element.classList.contains('is-visible')));
  } finally { env.close(); }
});
