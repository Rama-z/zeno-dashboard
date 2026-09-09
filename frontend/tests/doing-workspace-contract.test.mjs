import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const doing = readFileSync(new URL('../src/doing.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/api.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const openapi = readFileSync(new URL('../../backend/internal/api/openapi.yaml', import.meta.url), 'utf8');

const attributes = [
  'status', 'priority', 'timeBlockStart', 'timeBlockEnd', 'estimatedMinutes',
  'actualMinutes', 'category', 'project', 'goalOutcome', 'progress',
  'energyFocus', 'dependency', 'blockedBy', 'note', 'carryOver', 'completedAt',
];

test('Doing API contract exposes every planning attribute', () => {
  for (const attribute of attributes) {
    assert.match(api, new RegExp(`\\b${attribute}\\??:`), `missing ${attribute} in frontend API type`);
    assert.match(openapi, new RegExp(`\\b${attribute}:`), `missing ${attribute} in OpenAPI contract`);
  }
  assert.match(api, /status: 'todo' \| 'doing' \| 'blocked' \| 'done'/);
  assert.match(api, /priority: 'high' \| 'medium' \| 'low'/);
  assert.match(api, /energyFocus: 'deep' \| 'medium' \| 'light'/);
  assert.match(openapi, /timeBlockStart:\s*\{[^\n]*pattern:\s*['"]\^\$\|\^/);
  assert.match(openapi, /timeBlockEnd:\s*\{[^\n]*pattern:\s*['"]\^\$\|\^/);
  assert.match(openapi, /estimatedMinutes:\s*\{[^\n]*maximum:\s*2147483647/);
  assert.match(openapi, /actualMinutes:\s*\{[^\n]*maximum:\s*2147483647/);
});

test('Doing redesign uses progressive task workspace controls', () => {
  for (const marker of [
    'doing-workspace', 'doing-planner-rail', 'doing-command-bar', 'doing-task-row',
    'doing-task-details', 'doing-editor-grid', 'data-doing-status-filter',
    'data-doing-priority-filter', 'data-doing-expand', 'data-doing-new',
  ]) assert.match(doing + css, new RegExp(marker), `missing ${marker}`);

  for (const field of attributes.filter((name) => name !== 'completedAt')) {
    assert.match(doing, new RegExp(`name="${field}"`), `missing form control ${field}`);
  }
  assert.match(doing, /<input[^>]*name="category"[^>]*value="\$\{value\('category', draft\.category\)\}"[^>]*list="doing-category-options"/);
  assert.match(doing, /<datalist id="doing-category-options">/);
  assert.match(doing, /<label[^>]*>.*Task/s);
  assert.match(doing, /aria-expanded=/);
  assert.doesNotMatch(doing, /<svg\b/, 'Doing must use the existing Phosphor icon family');
});

test('Doing interaction keeps filters, completion mapping, and scroll restoration explicit', () => {
  assert.match(doing, /status === 'done'/);
  assert.match(doing, /progress: 100/);
  assert.match(doing, /listScrollTop/);
  assert.match(doing, /requestAnimationFrame/);
  assert.match(css, /\.doing-list[^}]*overflow-anchor:\s*none/);
  assert.match(css, /\.doing-list[^}]*align-content:\s*start/, 'a short mobile task list must not stretch collapsed rows');
  assert.match(doing, /data-doing-query[^\n]*addEventListener\('input'/);
  assert.match(doing, /role="progressbar"[^>]*aria-valuemin="0"[^>]*aria-valuemax="100"[^>]*aria-valuenow="\$\{entry\.progress\}"/);
  assert.match(doing, /role="dialog"[^>]*aria-modal="true"/);
  assert.match(doing, /data-doing-delete-dialog[\s\S]*addEventListener\('keydown'/);
  assert.match(doing, /event\.key === 'Escape'/);
  assert.match(doing, /event\.key (?:===|!==) 'Tab'/);
  assert.match(doing, /data-doing-edit-form[\s\S]*input\[name="title"\][\s\S]*focus\(\)/);
  assert.match(doing, /focusTaskAction\('edit', id\)\s*\|\|\s*focusStableDoingControl\(\)/);
  assert.match(doing, /persistEntry\(entry\.id,[\s\S]*options, 'toggle'\)/);
  assert.doesNotMatch(doing, /button\.blur\(\)/);
  assert.match(doing, /let actionPending = false/);
  assert.match(doing, /if \(actionPending\) return false/);
  assert.match(doing, /finally\s*\{\s*actionPending = false/);
  assert.match(doing, /data-doing-status-filter[\s\S]*requestAnimationFrame[\s\S]*data-doing-status-filter[\s\S]*focus\(\)/);
  assert.match(doing, /data-doing-priority-filter[\s\S]*requestAnimationFrame[\s\S]*data-doing-priority-filter[\s\S]*focus\(\)/);
  assert.match(doing, /name="estimatedMinutes"[^>]*step="1"/);
  assert.match(doing, /name="actualMinutes"[^>]*step="1"/);
  assert.match(doing, /name="progress"[^>]*step="1"/);
  assert.doesNotMatch(doing, /name="(?:estimatedMinutes|actualMinutes|progress)"[^>]*step="5"/);
  assert.match(doing, /let createDraft:\s*DoingInput\s*\|\s*null/);
  assert.match(doing, /let editDraft:\s*DoingInput\s*\|\s*null/);
  assert.match(doing, /const draft:\s*DoingInput\s*=\s*entry\s*\?\s*editDraft\s*\?\?/);
  assert.match(doing, /createDraft\s*\?\?/);
  assert.match(doing, /type DoingFormSnapshot =/);
  assert.match(doing, /function snapshotDoingForm\(form: HTMLFormElement\)/);
  assert.match(doing, /function rerenderPreservingDraft\(options: BindOptions\)/);
  assert.match(doing, /const textareaValue =/);
  assert.match(doing, /raw\.startsWith\('\\n'\) \? '\\n' : ''/);
  for (const field of ['goalOutcome', 'dependency', 'blockedBy', 'note']) {
    assert.match(doing, new RegExp(`textareaValue\\('${field}', draft\\.${field}\\)`));
  }
  assert.match(doing, /#doing-form, \[data-doing-edit-form\]/);
  assert.match(doing, /form\.addEventListener\('input', capture\)/);
  assert.match(doing, /form\.addEventListener\('change', capture\)/);
  assert.match(doing, /createFormSnapshot = null/);
  assert.match(doing, /editFormSnapshot = null/);
  assert.match(doing, /return true/);
  assert.match(doing, /return false/);
  assert.match(doing, /data-doing-month-prev[\s\S]*requestAnimationFrame[\s\S]*data-doing-month-prev[\s\S]*focus\(\)/);
  assert.match(doing, /data-doing-month-next[\s\S]*requestAnimationFrame[\s\S]*data-doing-month-next[\s\S]*focus\(\)/);
  assert.match(doing, /data-doing-today[\s\S]*requestAnimationFrame[\s\S]*data-doing-today[\s\S]*focus\(\)/);
  assert.match(doing, /data-doing-day[\s\S]*CSS\.escape\(date\)[\s\S]*focus\(\)/);
  assert.match(doing, /data-doing-expand[\s\S]*focusTaskAction\('expand', id\)/);
  assert.match(doing, /composerOpen[\s\S]*data-doing-new[\s\S]*focus\(\)/);
  assert.match(css, /@media\s*\(max-width:\s*980px\)[\s\S]*\.doing-workspace/);
  assert.match(css, /@media\s*\(max-width:\s*680px\)[\s\S]*\.doing-icon-button[^}]*width:\s*44px[^}]*height:\s*44px/);
  assert.match(css, /@media\s*\(max-width:\s*680px\)[\s\S]*\.doing-command-bar[^}]*min-height:\s*44px/);
  assert.match(css, /@media\s*\(max-width:\s*680px\)[\s\S]*\.doing-planner-rail \.calendar-nav[^}]*width:\s*44px[^}]*height:\s*44px/);
  assert.match(css, /@media\s*\(max-width:\s*680px\)[\s\S]*\.doing-secondary-button[^}]*min-width:\s*44px[^}]*min-height:\s*44px/);
  assert.match(css, /@media\s*\(max-width:\s*680px\)[\s\S]*\.delete-popover button[^}]*min-width:\s*44px[^}]*min-height:\s*44px/);
  assert.match(css, /@media\s*\(max-width:\s*680px\)[\s\S]*\.doing-planner-rail \.calendar-day[^}]*min-width:\s*44px[^}]*min-height:\s*44px/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('Doing narrow calendar has contained geometry and an accessible scroll affordance', () => {
  assert.match(doing, /class="doing-calendar-scroll"[^>]*role="region"[^>]*tabindex="0"[^>]*aria-describedby="doing-calendar-scroll-hint"/);
  assert.match(doing, /id="doing-calendar-scroll-hint"[^>]*>Geser kalender ke samping</);
  assert.match(css, /\.doing-calendar-scroll :is\(\.calendar-weekdays,\.calendar-grid\)\{[^}]*grid-template-columns:\s*repeat\(7,minmax\(44px,1fr\)\)[^}]*gap:\s*0/);
  assert.match(css, /\.doing-planner-rail \.calendar-day\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/);
  assert.match(css, /@media\s*\(max-width:\s*460px\)[\s\S]*body:has\(\.doing-workspace\)\{[^}]*min-width:\s*0/);
  assert.match(css, /@media\s*\(max-width:\s*460px\)[\s\S]*\.doing-calendar-scroll\{[^}]*overflow-x:\s*auto[^}]*overscroll-behavior-x:\s*contain/);
  assert.match(css, /@media\s*\(max-width:\s*460px\)[\s\S]*\.doing-calendar-scroll :is\(\.calendar-weekdays,\.calendar-grid\)\{[^}]*grid-template-columns:\s*repeat\(7,44px\)[^}]*width:\s*max-content/);
  assert.match(css, /@media\s*\(max-width:\s*460px\)[\s\S]*\.doing-planner-rail \.calendar-day\{[^}]*width:\s*44px[^}]*height:\s*44px/);
});

test('Doing mobile editor gives every control a 44px interaction area while desktop stays compact', () => {
  assert.match(css, /\.doing-field input,\.doing-field select\{[^}]*height:\s*37px/, 'desktop editor controls must stay compact');
  assert.match(css, /@media\s*\(max-width:\s*680px\)[\s\S]*\.doing-editor \.doing-field :is\(input,select,textarea\)\{[^}]*min-height:\s*44px/, 'mobile editor fields must be at least 44px tall');
  assert.match(css, /@media\s*\(max-width:\s*680px\)[\s\S]*\.doing-editor \.doing-carry input\{[^}]*width:\s*44px[^}]*height:\s*44px/, 'mobile carry-over checkbox must expose a 44px control');
  assert.match(css, /@media\s*\(max-width:\s*680px\)[\s\S]*\.doing-editor \.doing-carry:has\(input:focus-visible\)\{[^}]*outline:/, 'mobile custom checkbox must retain a visible focus ring');
  assert.match(css, /@media\s*\(max-width:\s*680px\)[\s\S]*\.doing-primary-button\{[^}]*min-height:\s*44px/, 'mobile primary editor button must be at least 44px tall');
  assert.match(css, /@media\s*\(max-width:\s*680px\)[\s\S]*\.doing-secondary-button\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/, 'mobile secondary editor button must be at least 44px square');
  assert.match(css, /@media\s*\(max-width:\s*680px\)[\s\S]*\.doing-icon-button[^}]*width:\s*44px[^}]*height:\s*44px/, 'mobile icon editor button must be 44px square');
});

test('Doing text limits use Unicode code points instead of native UTF-16 maxlength', () => {
  const textLimits = {
    title: 160,
    category: 60,
    project: 160,
    goalOutcome: 500,
    dependency: 500,
    blockedBy: 500,
    note: 2000,
  };

  assert.match(doing, /function codePointLength\(value: string\)[\s\S]*Array\.from\(value\)\.length/);
  assert.match(doing, /function validateDoingTextLimits\(formElement: HTMLFormElement\)/);
  assert.match(doing, /validateDoingTextLimits\(formElement\)/);
  assert.match(doing, /setCustomValidity\(message\)/);
  assert.match(doing, /data-doing-field-error=/);
  assert.match(doing, /aria-live="polite"/);

  for (const [field, limit] of Object.entries(textLimits)) {
    assert.match(doing, new RegExp(`name="${field}"[^>]*data-doing-max-code-points="${limit}"`), `missing code-point limit for ${field}`);
    assert.doesNotMatch(doing, new RegExp(`name="${field}"[^>]*maxlength=`), `${field} must not use native UTF-16 maxlength`);
  }
});

test('Doing single-flight mutations expose an accessible busy state and lock destructive controls', () => {
  assert.match(doing, /type DoingMutationKind = 'create' \| 'edit' \| 'toggle' \| 'delete'/);
  assert.match(doing, /aria-busy="\$\{actionPending\}"/);
  assert.match(doing, /class="doing-mutation-status" role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(doing, /activeMutation \? mutationStatusLabels\[activeMutation\] : ''/);
  assert.match(doing, /actionPending = true;[\s\S]*activeMutation = kind;[\s\S]*rerenderPreservingDraft\(options\);[\s\S]*await action\(\)/);
  assert.match(doing, /finally\s*\{[\s\S]*actionPending = false;[\s\S]*activeMutation = null;[\s\S]*rerenderPreservingDraft\(options\)/);
  assert.match(doing, /data-doing-editor-cancel[^>]*\$\{disabledWhilePending\}/);
  assert.match(doing, /type="submit"[^>]*\$\{disabledWhilePending\}/);
  assert.match(doing, /data-doing-toggle=[^>]*\$\{disabledWhilePending\}/);
  assert.match(doing, /data-doing-edit=[^>]*\$\{disabledWhilePending\}/);
  assert.match(doing, /data-doing-delete=[^>]*\$\{disabledWhilePending\}/);
  assert.match(doing, /data-doing-delete-confirm[^>]*\$\{disabledWhilePending\}/);
  assert.match(css, /\.doing-mutation-status:not\(:empty\)/);
  assert.doesNotMatch(doing + css, /doing-(?:busy-)?spinner/, 'busy feedback must not add a generic spinner');
});

test('Doing create response stays in its submitted date bucket after calendar navigation', () => {
  assert.match(
    doing,
    /const created = normalizeEntry\(await api\.createDoing\(input\)\);\s*entriesByDate\[created\.date\] = \[\.\.\.\(entriesByDate\[created\.date\] \?\? \[\]\), created\];/,
  );
  assert.doesNotMatch(
    doing,
    /const created = normalizeEntry\(await api\.createDoing\(input\)\);\s*entriesByDate\[selectedDate\]/,
  );
});
