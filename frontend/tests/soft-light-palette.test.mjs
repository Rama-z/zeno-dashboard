import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
const palette = (css, selector, marker) => {
  const start = css.indexOf(selector, css.indexOf(marker));
  assert.notEqual(start, -1, `${selector} missing`);
  return css.slice(start, css.indexOf('}', start));
};
const color = (css, token) => {
  const match = css.match(new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, 'i'));
  assert.ok(match, `${token} missing`);
  return match[1];
};
const luminance = (hex) => {
  const channels = hex.slice(1).match(/../g).map((ch) => parseInt(ch, 16) / 255);
  const linear = channels.map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);

test('light mode canvas and blank surfaces are subdued without losing text contrast', () => {
  const css = palette(read('styles.css'), ":root[data-theme='light']{", '/* Zeno Playground semantic color');
  const canvas = color(css, '--background');
  const surface = color(css, '--surface');
  assert.ok(luminance(canvas) < .77, 'empty canvas is too bright');
  assert.ok(luminance(surface) < .85, 'empty cards remain near-white');
  assert.ok(luminance(surface) > luminance(canvas), 'cards need a gentle elevation');
  assert.ok(contrast(color(css, '--text-primary'), surface) >= 7);
  assert.ok(contrast(color(css, '--text-secondary'), surface) >= 4.5);
});

test('public light surfaces and dashboard atmosphere share the softened palette', () => {
  const landingPalette = palette(read('landing.css'), '.zeno-landing {\n  --landing-bg:', 'body:has(> #app > .zeno-landing)');
  const authPalette = palette(read('auth.css'), '.auth-shell {\n  --auth-bg:', '/* Zeno Playground auth:');
  assert.ok(luminance(color(landingPalette, '--landing-bg')) < .77);
  assert.ok(luminance(color(landingPalette, '--landing-surface')) < .85);
  assert.ok(luminance(color(authPalette, '--auth-bg')) < .77);
  assert.ok(luminance(color(authPalette, '--auth-surface')) < .85);
  const brandPanel = palette(read('auth.css'), ":root[data-theme='light'] .auth-shell .auth-brand-panel {", '/* Zeno Playground auth:');
  assert.ok(luminance(color(brandPanel, 'background')) < .6, 'large login brand panel is too vivid');
  const darkLanding = palette(read('landing.css'), ":root[data-theme='dark'] .zeno-landing {", '.zeno-landing {\n  --landing-bg:');
  const darkAuth = palette(read('auth.css'), ":root[data-theme='dark'] .auth-shell {", '/* Zeno Playground auth:');
  assert.equal(color(darkLanding, '--landing-lime').toUpperCase(), '#DAF978');
  assert.equal(color(darkAuth, '--auth-lime').toUpperCase(), '#DAF978');
  assert.match(read('playground-dashboard.css'), /--aurora-core-opacity:\s*\.2[0-9]/);
});
