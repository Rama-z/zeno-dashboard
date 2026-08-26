import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = async (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8').catch(() => '');

test('anonymous root has a complete interactive Zeno landing page', async () => {
  const [main, landing, styles, index, robots, appStyles] = await Promise.all([
    read('src/main.ts'),
    read('src/landing.ts'),
    read('src/landing.css'),
    read('index.html'),
    read('public/robots.txt'),
    read('src/app-styles.ts'),
  ]);

  assert.match(main, /import '\.\/landing\.css';/, 'main entry must load landing styles');
  assert.match(main, /renderLandingPage/, 'main entry must render the landing module');
  assert.match(main, /isPublicLandingPath/, 'anonymous root must be handled as a public route');
  assert.match(main, /if \(!authChecked\) \{\s*if \(isPublicLandingPath\(window\.location\.pathname\)\) \{\s*renderPublicLanding\(\);/s, 'public root must render before the auth probe completes');
  assert.doesNotMatch(main, /import '\.\/styles\.css';/, 'dashboard CSS must not block the public landing route');
  assert.match(main, /function ensureAppStyles\(\)/, 'dashboard and auth routes must load their CSS on demand');
  assert.match(appStyles, /import '\.\/styles\.css';[\s\S]*import '\.\/lifestyle\.css';[\s\S]*import '\.\/auth\.css';/, 'dynamic app style bundle is incomplete');

  assert.match(landing, /export function renderLandingPage/, 'landing renderer is missing');
  assert.match(landing, /class="zeno-landing"/, 'landing root marker is missing');
  assert.match(landing, /src="\/zeno-logo-96\.webp"/, 'landing must use the optimized brand asset');
  assert.doesNotMatch(landing, /src="\/zeno-logo\.png"/, 'landing must not download the oversized dashboard logo');
  assert.match(landing, /srcset="\/zeno-landing-hero-800\.webp 800w, \/zeno-landing-hero\.webp 1600w"/, 'hero must offer a responsive LCP source');
  assert.match(landing, /href="\/login"/, 'landing must lead to the existing login route');
  assert.match(landing, /data-feature-tab/, 'observability accordion interaction is missing');
  assert.match(landing, /data-workspace-module/, 'personal workspace interaction is missing');
  assert.match(landing, /data-landing-theme/, 'theme control is missing');
  assert.match(landing, /aria-live="polite"/, 'interactive changes need an accessible live region');
  assert.doesNotMatch(landing, /[—–]/, 'visible landing copy must not contain em/en dashes');

  assert.match(styles, /min-height:\s*100dvh/, 'landing hero must use the stable dynamic viewport');
  assert.match(styles, /\.landing-hero\s+\.landing-hero-media\s*\{[^}]*position:\s*absolute/s, 'hero media must stay out of document flow');
  assert.match(styles, /prefers-reduced-motion:\s*reduce/, 'motion must have a reduced-motion fallback');
  assert.match(styles, /data-theme=['"]light['"]/, 'landing must support light mode');
  assert.match(styles, /@media\s*\(max-width:\s*767px\)/, 'mobile collapse must be explicit below 768px');
  assert.match(styles, /overflow-x:\s*(?:clip|hidden)/, 'landing must prevent horizontal overflow');

  assert.match(index, /Zeno/, 'document metadata must retain the product brand');
  assert.match(index, /imagesrcset="\/zeno-landing-hero-800\.webp 800w, \/zeno-landing-hero\.webp 1600w"/, 'hero preload must use the responsive source set');
  assert.match(robots, /^User-agent:\s*\*\s*\nAllow:\s*\/$/m, 'robots.txt must explicitly allow the public landing page');
});
