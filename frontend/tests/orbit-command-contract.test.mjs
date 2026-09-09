import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const read = async (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8').catch(() => '');

async function loadOrbitModule() {
  const source = await read('src/orbit-navigation.ts');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

test('Orbit Command owns one permission-aware navigation configuration', async () => {
  const navigation = await read('src/orbit-navigation.ts');

  assert.match(navigation, /export const orbitNavigation/, 'structured Orbit navigation config is missing');
  assert.match(navigation, /permission:\s*'admin'/, 'admin-only navigation permission must remain explicit');
  assert.match(navigation, /children:/, 'navigation config must express real drill-down children');
  assert.match(navigation, /\/learning\/materials/, 'Learning Materials route must remain reachable');
  assert.match(navigation, /\/workout\/materials/, 'Workout Materials route must remain reachable');
  assert.match(navigation, /export function activeOrbitLocation/, 'active label must be derived from the browser route');
  assert.match(navigation, /startsWith/, 'nested deep links must resolve to their parent navigation item');
  assert.match(navigation, /export function visibleOrbitNavigation/, 'permission filtering must be shared and reusable');
  assert.match(navigation, /export function orbitSegmentGeometry/, 'segment geometry must be computed from the available item count');
});

test('dashboard replaces sidebar with a modal radial command overlay', async () => {
  const [main, styles] = await Promise.all([read('src/main.ts'), read('src/styles.css')]);

  assert.doesNotMatch(main, /<aside class="sidebar"/, 'sidebar must be removed from dashboard markup');
  assert.doesNotMatch(main, /sidebarCollapsed|sidebar-toggle/, 'obsolete sidebar state and controls must be removed');
  assert.match(main, /class="orbit-trigger"/, 'collapsed navigation must render as one floating pill');
  assert.match(main, /aria-expanded="\$\{orbitOpen\}"/, 'floating pill must expose expanded state');
  assert.match(main, /role="dialog"[^>]*aria-modal="true"/, 'open Orbit must use consistent modal semantics');
  assert.match(main, /data-orbit-backdrop/, 'outside click backdrop must be actionable');
  assert.match(main, /data-orbit-close/, 'Orbit needs an explicit close control');
  assert.match(main, /data-orbit-back/, 'drill-down needs an explicit back control');
  assert.match(main, /data-orbit-segment/, 'the full radial segment must be the navigation target');
  assert.match(main, /<strong class="orbit-wordmark">ZENO<\/strong>/, 'root Orbit center must show the rigid ZENO wordmark without a placeholder logo');
  assert.doesNotMatch(main, /orbit-center-mark/, 'root Orbit center must not keep the temporary compass mark');
  assert.doesNotMatch(main, /const center =[^;\n]*<strong>(?:Zeno|Orbit Command)<\/strong>/, 'legacy mixed-case and Orbit Command center titles must not remain visible');
  assert.match(main, /event\.key === 'Escape'/, 'Escape must close Orbit');
  assert.match(main, /event\.key === 'Tab'/, 'Orbit must trap modal keyboard focus');
  assert.match(main, /ArrowRight|ArrowDown/, 'radial options must support arrow-key navigation');
  assert.match(main, /window\.addEventListener\('popstate'/, 'Back and Forward must resync the route-derived label');

  assert.match(styles, /\.orbit-trigger\s*\{[^}]*position:\s*fixed/s, 'floating trigger must not affect document layout');
  assert.match(styles, /\.orbit-overlay\s*\{[^}]*position:\s*fixed/s, 'Orbit overlay must not shift dashboard content');
  assert.match(styles, /env\(safe-area-inset-bottom/, 'mobile trigger must account for safe-area inset');
  assert.match(styles, /@media\s*\(max-width:\s*560px\)/, 'Orbit requires a compact mobile layout');
  assert.match(styles, /prefers-reduced-motion\s*:\s*reduce/, 'Orbit motion must respect reduced-motion preferences');
  assert.match(styles, /\.zeno-dashboard\s*>\s*\.main\s*\{[^}]*width:\s*100%/s, 'dashboard content must use the full shell width');
  assert.match(styles, /\.orbit-overlay\.is-closing[^}]*\.orbit-dialog/, 'closing Orbit must animate instead of disappearing instantly');
  assert.match(styles, /\.orbit-disc\s*\{[^}]*overflow:\s*visible[^}]*border:\s*0[^}]*background:\s*transparent/s, 'flower layout must remove the enclosing pie disc');
  assert.match(styles, /\.orbit-segment-label\s*\{[^}]*flex-direction:\s*column/s, 'petal icons and labels should use the compact vertical hierarchy');
  assert.match(styles, /\.orbit-segment\s*\{[^}]*opacity:\s*1/s, 'petals must remain visible even when animation frames are throttled');
});

test('Orbit route labels and permissions stay derived from the real navigation tree', async () => {
  const { activeOrbitLocation, visibleOrbitNavigation } = await loadOrbitModule();
  const userNavigation = visibleOrbitNavigation('user');
  const adminNavigation = visibleOrbitNavigation('admin');

  assert.equal(userNavigation.length, 8, 'all eight user-visible main menus must remain available');
  assert.equal(adminNavigation.length, 8, 'admin uses the same main information architecture');
  assert.deepEqual(userNavigation.find((item) => item.id === 'account').children.map((item) => item.id), ['profile']);
  assert.deepEqual(adminNavigation.find((item) => item.id === 'account').children.map((item) => item.id), ['profile', 'settings']);
  assert.equal(activeOrbitLocation('/learning', 'user').label, 'Learning (Journal)');
  assert.equal(activeOrbitLocation('/learning/materials/english/grammar/present-simple', 'user').label, 'Learning (Materials)');
  assert.equal(activeOrbitLocation('/workout/materials/mobility/open-book', 'user').label, 'Workout (Materials)');
  assert.equal(activeOrbitLocation('/spending', 'user').label, 'Lifestyle (Spending)');
  assert.equal(activeOrbitLocation('/settings', 'admin').label, 'Account (Settings)');
  assert.equal(activeOrbitLocation('/settings', 'user').label, 'Overview (Session log)', 'a forbidden route must never leak an admin destination label');
});

test('Orbit geometry and compact pagination support five and ten usable options', async () => {
  const { orbitSegmentGeometry, paginateOrbitItems } = await loadOrbitModule();
  const ten = Array.from({ length: 10 }, (_, index) => `item-${index + 1}`);
  assert.deepEqual(paginateOrbitItems(ten, 0, 5), { items: ten.slice(0, 5), currentPage: 0, pageCount: 2 });
  assert.deepEqual(paginateOrbitItems(ten, 1, 5), { items: ten.slice(5), currentPage: 1, pageCount: 2 });
  assert.deepEqual(paginateOrbitItems(ten, 99, 10), { items: ten, currentPage: 0, pageCount: 1 });

  for (const count of [2, 5, 8]) {
    const segments = Array.from({ length: count }, (_, index) => orbitSegmentGeometry(index, count));
    assert.equal(new Set(segments.map((segment) => segment.angle)).size, count);
    assert.equal(segments[0].angle, count === 2 ? 180 : -90);
    for (const segment of segments) {
      assert.ok(segment.labelX > 0 && segment.labelX < 100);
      assert.ok(segment.labelY > 0 && segment.labelY < 100);
      assert.ok(segment.outerWidth > segment.innerWidth);
      assert.match(segment.clip, /^polygon/);
    }
  }
});

test('Orbit trigger chooses a viewport dock that does not cover Doing editor actions', async () => {
  const { chooseOrbitTriggerDock } = await loadOrbitModule();
  const viewport = { width: 327, height: 667 };
  const trigger = { width: 180, height: 54 };
  const bottomActions = [{ left: 70, right: 303, top: 590, bottom: 634 }];
  const topRightCancel = { left: 259, right: 303, top: 82, bottom: 126 };

  assert.equal(chooseOrbitTriggerDock(viewport, trigger, []), 'bottom-right', 'other pages keep the default Orbit position');
  assert.equal(chooseOrbitTriggerDock(viewport, trigger, bottomActions), 'top-right', 'a bottom action row must move Orbit away from submit and cancel');
  assert.equal(chooseOrbitTriggerDock(viewport, trigger, [...bottomActions, topRightCancel]), 'top-left', 'the next non-overlapping dock must be selected deterministically');
});

test('dashboard continuously docks Orbit away from visible Doing submit and cancel controls', async () => {
  const [main, styles] = await Promise.all([read('src/main.ts'), read('src/styles.css')]);

  assert.match(main, /chooseOrbitTriggerDock/);
  assert.match(main, /\.doing-editor :is\(button\[type="submit"\],\[data-doing-editor-cancel\]\)/);
  assert.match(main, /trigger\.dataset\.orbitDock\s*=\s*chooseOrbitTriggerDock/);
  assert.match(main, /window\.addEventListener\('scroll', scheduleOrbitTriggerDock, true\)/);
  assert.match(main, /window\.addEventListener\('resize', scheduleOrbitTriggerDock\)/);
  assert.match(main, /scheduleOrbitTriggerDock\(\)/);
  for (const dock of ['bottom-left', 'top-right', 'top-left']) {
    assert.match(styles, new RegExp(`\\.orbit-trigger\\[data-orbit-dock=['"]${dock}['"]\\]`), `missing ${dock} Orbit dock style`);
  }
});
