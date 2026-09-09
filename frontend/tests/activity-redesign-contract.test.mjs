import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = async (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8').catch(() => '');

test('Activity renders the grouped audit timeline from the supplied reference', async () => {
  const [main, styles] = await Promise.all([read('src/main.ts'), read('src/styles.css')]);

  assert.match(main, /renderActivityTrail\(/, 'Activity needs a dedicated grouped timeline renderer');
  assert.match(main, /class="activity-trail-toolbar"/, 'Activity needs search, actor, and date controls');
  assert.match(main, /data-activity-query/, 'Activity search must be interactive');
  assert.match(main, /data-activity-actor/, 'Activity actor filtering must be interactive');
  assert.match(main, /data-activity-period/, 'Activity period filtering must be interactive');
  assert.match(main, /class="activity-day"/, 'events must be grouped by calendar day');
  assert.match(main, /class="activity-actor-group/, 'day events must be grouped by actor');
  assert.match(main, /data-activity-group-toggle/, 'actor groups must be collapsible');
  assert.match(main, /data-activity-event-toggle/, 'individual events must expose audit details');
  assert.match(main, /data-activity-load-more/, 'older activity must be progressively revealed');
  assert.match(main, /function activityTime\(value: string, includeSeconds = false\)/, 'Activity needs one locale-safe clock formatter');
  assert.match(main, /\.replace\(\/\\\.\/g, ':'\)/, 'Indonesian locale dots must be normalized to the colon format in the reference');
  assert.doesNotMatch(main, /class="activity-summary"/, 'legacy metric cards must be removed from Activity');

  assert.match(styles, /\.activity-timeline\s*\{[^}]*--activity-rail:/s, 'timeline needs an explicit rail geometry token');
  assert.match(styles, /\.activity-actor-group\s*\{[^}]*grid-template-columns:/s, 'actor groups need a stable time, rail, and card grid');
  assert.match(styles, /\.activity-event-detail\s*\{/, 'expanded audit metadata needs its own visual state');
  assert.match(styles, /@media\s*\(max-width:\s*720px\)[\s\S]*\.activity-actor-group/s, 'the activity timeline needs a narrow-screen composition');
});
