import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(resolve(root, relativePath), 'utf8');

const reasonCodes = ['typo', 'clarify', 'incorrect_information', 'changed_my_mind'];

 test('journal revision API contract keeps stable reason codes and lazy endpoints', async () => {
  const api = await read('src/api.ts');
  for (const code of reasonCodes) assert.match(api, new RegExp(`['"]${code}['"]`), `missing reason code ${code}`);
  assert.match(api, /type JournalInput/);
  assert.match(api, /type JournalRevision/);
  assert.match(api, /latestRevisionNumber/);
  assert.match(api, /latestEditReason/);
  assert.match(api, /journalRevisions|revisions/);
  assert.match(api, /appendJournalRevision|createJournalRevision/);
  assert.match(api, /baseRevisionNumber/);
});

test('journal UI contract requires deliberate edit, full-version slides, and accessible native swipe', async () => {
  const lifestyle = await read('src/lifestyle.ts');
  const css = await read('src/lifestyle.css');
  const packageJson = JSON.parse(await read('package.json'));

  assert.match(lifestyle, /Kenapa kamu ingin mengubah catatan ini\?/);
  assert.match(lifestyle, /Typo/);
  assert.match(lifestyle, /Memperjelas/);
  assert.match(lifestyle, /Informasi tidak tepat/);
  assert.match(lifestyle, /Berubah pikiran/);
  assert.match(lifestyle, /data-journal-edit/);
  assert.match(lifestyle, /data-journal-edit-reason/);
  assert.match(lifestyle, /data-journal-history/);
  assert.match(lifestyle, /data-journal-revision-newer/);
  assert.match(lifestyle, /data-journal-revision-older/);
  assert.match(lifestyle, /track\.scrollTo\(\{ left, behavior: 'auto' \}\)/, 'arrow navigation must not let smooth-scroll events reset the selected revision');
  assert.match(lifestyle, /hermes-monitor-journal-edit-draft-v1/);
  assert.match(lifestyle, /latestRevisionNumber/);
  assert.match(lifestyle, /journalHistoryRequestTokens\.clear\(\)/);
  assert.match(lifestyle, /aria-live="polite"/);
  assert.match(lifestyle, /inert/);
  assert.match(lifestyle, /Versi lama/);
  assert.match(lifestyle, /Simpan revisi/);
  assert.match(lifestyle, /Simpan jurnal/);
  assert.doesNotMatch(lifestyle, /journalEditSaving \? 'true' : 'false'/);
  assert.match(lifestyle, /Hapus jurnal ini beserta semua revisinya secara permanen\?/);
  assert.match(css, /scroll-snap-type:\s*x\s+mandatory/);
  assert.match(css, /scroll-snap-align:\s*start/);
  assert.match(css, /prefers-reduced-motion/);
  assert.equal(packageJson.dependencies?.['embla-carousel'] ?? packageJson.dependencies?.['swiper'], undefined, 'do not add a carousel dependency');
});
