import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/landing.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const landing = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('Playground renders the requested copy, local demo controls and linked accessible tabs', () => {
  const html = landing.renderLandingPage('light');
  for (const text of ['A LITTLE STRUCTURE. A LOT OF YOU.', 'Banyak ide.', 'Satu ruang.', 'Lebih seru.', 'Demo · Data contoh', 'Progres punya cerita.', 'Ruangmu. Tetap milikmu.', 'YOUR LIFE, A LITTLE MORE TOGETHER.']) assert.ok(html.replace(/<br\s*\/?\s*>/g, ' ').includes(text), `missing ${text}`);
  assert.equal((html.match(/data-workspace-module=/g) ?? []).length, 5);
  assert.equal((html.match(/data-demo-task=/g) ?? []).length, 3);
  assert.match(html, /<textarea[^>]*id="landing-journal"/);
  assert.match(html, /<label[^>]*for="landing-journal"/);
  assert.match(html, /data-landing-pause/);
  assert.match(html, /href="#workspace"/);
  assert.match(html, /href="#observability"/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'IDs must be unique');
  for (const match of html.matchAll(/aria-(?:controls|labelledby)="([^"]+)"/g)) {
    for (const id of match[1].split(' ')) assert.ok(ids.includes(id), `missing aria target ${id}`);
  }
});
