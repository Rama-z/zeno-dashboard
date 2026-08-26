# Implementation Brief — Full Font Profile Coverage

**Audience:** Luna  
**Project:** Zeno  
**Repository:** `/home/capriconous/Documents/monitoring`  
**Status:** audit-only handoff; application code has not been changed by this task

## 1. Objective

Make the existing **Compact / Standard / Expanded** font-profile preference affect every intended user-visible text role consistently, while preserving hierarchy, responsive behavior, accessibility, and the current Compact appearance.

This brief deliberately separates:

- **Observed repository facts** — verified from current source or served computed styles;
- **Audit findings** — what currently changes and what does not;
- **Recommendations** — proposed implementation direction;
- **Open decisions** — product choices Luna must not silently guess.

## 2. Scope of this audit

Audited visual text sources:

- `frontend/index.html`
- `frontend/src/main.ts`
- `frontend/src/doing.ts`
- `frontend/src/lifestyle.ts`
- `frontend/src/auth.ts`
- `frontend/src/landing.ts`
- `frontend/src/learning-materials.ts`
- static lesson content loaded through `frontend/src/learning-content.ts`
- `frontend/src/styles.css`
- `frontend/src/lifestyle.css`
- `frontend/src/learning-materials.css`
- `frontend/src/auth.css`
- `frontend/src/landing.css`
- current font-profile contract test
- frontend settings API and relevant backend settings model/store/API/schema

Included states:

- public landing;
- login, registration, email verification, and auth feedback;
- authenticated sidebar/topbar;
- Overview, Change Log, Activity, Doing, Learning Journal, Workout, Journaling, Spending, Profile, and Settings;
- Learning Material subject/category/topic/lesson/not-found pages;
- forms, placeholders, select controls, badges, metadata, empty states, errors, inline confirmation, delete popovers, journal Markdown, revision history, quiz/practice feedback, and mastery UI.

Not visual font targets:

- document `<title>`, meta description, `aria-label`, `alt`, and `title` attributes;
- icon-only Phosphor/SVG/glyph content;
- screen-reader-only text;
- text deliberately hidden with `font-size: 0` at responsive/collapsed states;
- browser-native validation popups and native select popup chrome, whose rendering is user-agent controlled.

These still require accessibility verification but should not be treated as ordinary visual typography.

## 3. Observed repository facts

### 3.1 Preference state and lifecycle

The entire feature is currently frontend-local:

- `FontProfile` is `compact | standard | expanded`: `frontend/src/main.ts:48`.
- Labels and descriptions live at `frontend/src/main.ts:49-50`.
- Storage key is `hermes-monitor-font-profile`: `frontend/src/main.ts:51`.
- Invalid or absent stored values fall back to `compact`: `frontend/src/main.ts:52-55`.
- `applyTheme()` writes the selected value to `<html data-font-profile="…">`: `frontend/src/main.ts:81-84`.
- A radio change writes localStorage, reapplies the root dataset, rerenders, and restores focus: `frontend/src/main.ts:522-529`.
- The control is a native radio group in the Appearance card: `frontend/src/main.ts:452-453`.

The font-profile radio group is **not part of** `#settings-form`. “Save to backend” saves only `workspaceName`.

### 3.2 Persistence is not backend-backed

- `SettingsResponse` and `api.updateSettings()` contain only workspace settings: `frontend/src/api.ts:44-47,188-191`.
- Backend `model.Settings` contains workspace name/source-file output only.
- `app_settings` stores only `workspace_name`: `backend/internal/store/schema.sql:6-12`.
- `GetSettings`/`UpdateSettings` read and write only that value: `backend/internal/store/postgres.go:236-251`.
- No `fontProfile`, `font_profile`, font-size, or typography field exists in backend model, API, OpenAPI, or schema.

Therefore the current preference is browser/device-local. Changing it should produce no API traffic.

### 3.3 Availability mismatch

The Settings navigation item is rendered only for admins: `frontend/src/main.ts:462`. Non-admin navigation to `/settings` is redirected to Profile: `frontend/src/main.ts:315-319,551-555`.

Consequently, a device-local readability preference is currently selectable only by an admin, even though it is not a workspace-admin backend setting.

### 3.4 Style loading

- Landing CSS loads directly from `frontend/src/main.ts:4`.
- Authenticated/auth styles are lazy-loaded through `ensureAppStyles()`: `frontend/src/main.ts:20-23,320,570-574`.
- `frontend/src/app-styles.ts:1-5` imports, in order:
  1. `styles.css`
  2. `lifestyle.css`
  3. `learning-materials.css`
  4. `auth.css`

Landing and auth markup do not use `.zeno-dashboard`. Current profile application selectors are scoped to `.zeno-dashboard`, so merely setting `data-font-profile` on `<html>` does not make those pages responsive to the profile.

### 3.5 Current tokens

`frontend/src/styles.css:807-841` defines:

| Token | Compact | Standard | Expanded |
|---|---:|---:|---:|
| `--zeno-font-body-size` | 13px | 14px | 15px |
| `--zeno-font-line-height` | 1.68 | 1.78 | 1.9 |
| `--zeno-font-letter-spacing` | .012em | .018em | .024em |
| `--zeno-font-heading-size` | clamp(33px,3.35vw,47px) | clamp(35px,3.6vw,51px) | clamp(37px,3.85vw,55px) |
| `--zeno-font-copy-size` | 13px | 14px | 15px |
| `--zeno-font-control-size` | 13px | 14px | 15px |
| `--zeno-font-meta-size` | 9px | 10px | 11px |
| `--zeno-font-title-size` | 16px | 17px | 18px |
| `--zeno-font-editor-size` | 13px | 14px | 15px |

No profile changes root `font-size`. Therefore `rem` values do not respond to the profile.

### 3.6 Current selector architecture

Only nine font-size rule blocks consume `--zeno-font-*`, all at `frontend/src/styles.css:845-885`:

1. `.zeno-dashboard .page-heading h1`
2. body-copy group at `styles.css:848-850`
3. lifestyle/card title group at `styles.css:858-860`
4. journal/workout/spending copy group at `styles.css:861-864`
5. lifestyle/journal metadata group at `styles.css:865-868`
6. lifestyle control group at `styles.css:869-871`
7. mood/tag/writer metadata group at `styles.css:875-878`
8. lifestyle tabs/reason-panel group at `styles.css:879-881`
9. journal editor textarea at `styles.css:883-885`

A broad rule sets only tracking on the content container:

```css
.zeno-dashboard .content {
  letter-spacing: var(--zeno-font-letter-spacing);
}
```

This creates a misleading partial result: many fixed-size descendants change letter spacing but not font size or line height.

Programmatic CSS inventory found **341 declarations using `font-size` or a size-bearing `font` shorthand** across the five CSS files. Most are fixed px/clamp values. `lifestyle.css`, `learning-materials.css`, `auth.css`, and `landing.css` contain no direct `--zeno-font-*` references; some lifestyle rules are overridden only because the later, more-specific grouped rules in `styles.css` target them.

### 3.7 Existing tests

`frontend/tests/font-profile-contract.test.mjs` verifies source strings and selected CSS selectors. It does not instantiate the UI or verify:

- computed styles by route;
- actual localStorage writes/restoration;
- invalid stored-value fallback at runtime;
- root dataset mutation;
- absence of API traffic;
- public/auth/global-shell coverage;
- Learning Material coverage;
- all conditional states;
- mobile/responsive precedence.

## 4. Runtime audit method

The currently served Docker UI was checked at `http://127.0.0.1:8080`; the container reported healthy and root/login returned HTTP 200.

A temporary headless Chrome audit harness outside the repository intercepted API reads with representative in-memory responses. It did not write application or database state. For each route, the harness changed only `document.documentElement.dataset.fontProfile` and compared computed `font-size`, `line-height`, and `letter-spacing` for visible direct-text elements.

Counts below are representative desktop observations, not a substitute for conditional-state tests. They demonstrate the coverage pattern:

| Route/surface | Visible direct-text sample | Font size changes | Result |
|---|---:|---:|---|
| public landing `/` | 75 | 0 | unaffected |
| login `/login` | 17 | 0 | unaffected; register/verify share the same fixed CSS |
| Overview `/` | 51 | 4 | partial |
| Change Log `/change-log` | 120 | 2 | partial |
| Activity `/activity` | 44 | 3 | partial |
| Doing `/doing` | 84 | 4 | partial |
| Learning Journal `/learning` | 84 | 4 | partial |
| Workout `/workout` | 95 | 5 | partial |
| Journaling archive `/journaling` | 51 | 16 | strongest current coverage, still partial |
| Spending `/spending` | 64 | 12 | partial |
| Profile `/profile` | 43 | 2 | partial |
| Settings `/settings` | 52 | 10 | partial |
| Materials subject list | 37 | 2 | only shared heading/subheading |
| English category | 39 | 2 | only shared heading/subheading |
| Grammar topics | 84 | 2 | topic content remains fixed-size |
| Dedicated grammar lesson | 142 | 0 | no font-size or line-height response; 85 samples changed tracking only |
| route not found | 32 | 2 | only shared heading/subheading |

## 5. Current coverage matrix

“Spacing-only” means inherited tracking changes while visual size remains fixed.

### 5.1 Public landing — unaffected

**Render:** `frontend/src/landing.ts:92-240+`  
**Styles:** `frontend/src/landing.css`

Unaffected visual roles include:

- brand and nav links;
- theme/login controls;
- eyebrow, hero title, hero body, and CTAs;
- marquee text;
- section titles/body;
- media fallbacks;
- interactive tabs;
- live/workspace/access panel labels, titles, body, details;
- security terms/descriptions;
- footer.

Landing headings use responsive `rem`/viewport clamps. Because root font size is not profile-driven, those `rem` values are fixed relative to the browser default.

### 5.2 Auth — unaffected

**Render:** `frontend/src/auth.ts:34-41`  
**Styles:** `frontend/src/auth.css:1-2`

Unaffected roles:

- brand lockup and security copy;
- login/register/verify titles and descriptions;
- field labels and inputs;
- hints, alerts, switch links, submit buttons;
- verification status/loading text.

Browser-native validation messages remain UA-controlled.

### 5.3 Authenticated shell — unaffected in size

**Render:** `frontend/src/main.ts:454-472`

Unaffected roles:

- skip link;
- sidebar brand, section labels, nav labels/counts, and collapse control;
- topbar breadcrumb;
- API status;
- theme label;
- avatar initial;
- most `.eyebrow` and `.connection` text sizes.

These surfaces live outside `.content` or retain fixed declarations. Icon font sizes must remain icon-specific rather than being migrated blindly.

### 5.4 Shared page headings — affected

All `.page-heading h1` and `.subheading` text on authenticated pages change size and line height through the current profile rules.

`.eyebrow` and `.connection` text keep fixed sizes. When inside `.content`, they may inherit profile tracking only.

### 5.5 Overview — partial

**Render:** `frontend/src/main.ts:148-155,440-441`

Affected:

- page `h1`;
- `.subheading`;
- `.result-count`;
- `.entry-excerpt`;
- expanded `.question p` and `.answer-body p`.

Unaffected size:

- metric labels, values, units, and hints;
- section title;
- search input and filters;
- entry number/title/status;
- empty state;
- footnote/code.

Many of the latter change tracking only through `.content`.

### 5.6 Change Log — mostly unaffected

**Render:** `frontend/src/main.ts:158-181,442-443`

Affected size:

- shared page `h1` and `.subheading` only.

Unaffected size:

- period filters/count badges;
- sort label/select;
- update date/day labels;
- category/time metadata;
- update card title and description;
- grouped empty state.

### 5.7 Activity — partial

**Render:** `frontend/src/main.ts:444-447`

Affected:

- shared heading/subheading;
- `.activity-audit-copy p` description;
- `.feature-empty span` in the empty state.

Unaffected size:

- metric labels/values/hints;
- actor avatar;
- audit title;
- actor/entity metadata and time;
- empty-state strong title.

### 5.8 Doing — partial

**Render:** `frontend/src/doing.ts:66-93`

Affected:

- shared heading/subheading;
- `.learning-category`;
- `.learning-entry-copy p` note.

Unaffected size:

- calendar month, weekdays, dates, counters, legend, and today button;
- selected-day heading and badge;
- entry title;
- add/edit form inputs/select/buttons;
- empty-state primary/secondary copy;
- delete popover title/item/actions;
- action labels.

### 5.9 Learning Journal — partial

**Render:** `frontend/src/main.ts:99-112`

Affected:

- shared heading/subheading;
- category and note in existing entries;
- the main “Learning Material List” button through `.feature-button`;
- selected helper text only when matching a grouped selector.

Unaffected size:

- calendar system;
- month/day/detail headings and badges;
- entry title;
- add/edit controls (`.learning-form`, `.learning-edit-fields`);
- empty state primary text and some helper copy;
- delete popover.

### 5.10 Learning Material List and grammar lessons — critically incomplete

**Render:** `frontend/src/learning-materials.ts:21-106`  
**Styles:** `frontend/src/learning-materials.css:1-5`

Subject/category/topic pages:

- shared `.page-heading h1` and `.subheading` change size;
- breadcrumbs, material cards, chips, notice, filters, topic titles/body/prerequisites/availability, buttons, and empty state retain fixed sizes.

Dedicated lesson page:

- `.lesson-hero h1` is fixed by a responsive clamp and a mobile `32px` override;
- concept, explanation, examples, practice, quiz, feedback, score, mastery, review, related topics, and controls all use fixed sizes or inherit from fixed-size parents;
- current runtime sample showed **zero font-size or line-height changes** across Compact/Standard/Expanded;
- much of the lesson changed letter spacing only because `.content` supplies inherited tracking.

This page is the clearest evidence that a global content tracking rule is not a complete font-size system.

Static JSON lesson content is not itself styled; its rendered role is determined by these fixed selectors.

### 5.11 Workout — partial

**Render:** `frontend/src/lifestyle.ts:264-302`

Affected:

- shared heading/subheading;
- workout entry title/note;
- entry detail metadata in `.feature-meta i`;
- matching `.feature-button` and workout form/edit controls;
- matching empty-state secondary copy.

Unaffected size:

- summary metric labels and most values;
- calendar text;
- selected date/badge;
- form-section heading/helper;
- number-field labels;
- inline delete confirmation text/actions;
- fixed category chips and icons.

### 5.12 Journaling — best current coverage, still incomplete

**Render:** `frontend/src/lifestyle.ts:305-448`

Affected:

- shared heading/subheading;
- tab controls and tab title/helper;
- archive inputs/selects and feature buttons;
- date rail;
- journal card title, rendered body, mood, tags, kicker, footer;
- writer title, metadata controls/labels, textarea, live preview, placeholders/status;
- reason chooser copy/labels/legend;
- revision status/version/reason/loading metadata.

Still unaffected or inconsistent:

- Markdown nested `h2/h3/h4` keep fixed 18/15/13px rules even when body copy changes;
- toolbar button text/icons and some utility labels remain fixed;
- edited badge and several revision/header/action labels use fixed shorthand sizes;
- error/loading/inline controls not included in every profile group;
- responsive fixed-size overrides can create inconsistent hierarchy.

All Markdown elements—paragraphs, headings, lists, blockquote, code/pre, links, checks—must be reviewed as separate semantic roles.

### 5.13 Spending — partial

**Render:** `frontend/src/lifestyle.ts:479-496`

Affected:

- shared heading/subheading;
- summary amount values;
- ledger title;
- day heading time;
- row title/note/amount/payment-method metadata;
- form inputs/select/textarea/date and feature buttons.

Unaffected size:

- period anchor heading;
- summary labels/hints;
- form labels and form-section title/helper;
- ledger search input (`.feature-search input` is not in the current control group);
- range tabs where not covered by a grouped selector;
- day total/category chip/icon;
- empty-state strong title;
- inline confirmation.

### 5.14 Profile — mostly unaffected

**Render:** `frontend/src/auth.ts:67-68`

Affected:

- shared heading/subheading only.

Unaffected size:

- identity name/email/role;
- profile avatar;
- field labels/inputs;
- role/verified metadata;
- feedback alerts;
- save/logout buttons;
- session-card title/body.

### 5.15 Settings — partial and self-inconsistent

**Render:** `frontend/src/main.ts:452-453`

Affected:

- shared heading/subheading;
- `.setting-row small` helper text, including font-profile descriptions.

Unaffected size:

- card heading/title/description;
- setting labels;
- inputs and badges;
- save button;
- Compact/Standard/Expanded main option labels.

The control currently changes its small descriptions but not its primary option labels.

### 5.16 Not-found, empty, feedback, and overlay states — inconsistent

- Shared not-found page heading/subheading change.
- Inner not-found heading/body/button stay fixed-size.
- `.feature-empty span` changes, while `.feature-empty strong` stays fixed.
- Learning-material empty/not-found states stay fixed except the shared page header.
- Delete popovers and most inline confirmations stay fixed.
- Auth alerts stay fixed.
- Learning practice/quiz feedback and mastery copy stay fixed.
- Journal reason chooser is partially covered; other error/loading states are not consistently covered.

## 6. Root causes

1. **Opt-in selector list:** the profile is not a baseline typography system; it is nine manually maintained grouped selectors.
2. **Hard-coded sizes remain dominant:** hundreds of `px`, clamp, or size-bearing `font` shorthand declarations do not reference semantic profile tokens.
3. **Tracking is broader than sizing:** `.content` changes letter spacing for descendants whose size is fixed, producing “something changed” without full readability impact.
4. **Scope stops at `.zeno-dashboard`:** landing and auth cannot respond.
5. **New feature drift:** `learning-materials.css` was added with an independent fixed scale and no profile integration.
6. **Form controls do not reliably inherit:** inputs, selects, textareas, and buttons commonly declare fixed `font` shorthands.
7. **Responsive overrides are independent:** mobile and breakpoint rules contain fixed heading/value sizes.
8. **Tests verify source presence, not behavior or exhaustive coverage.**
9. **Accessibility preference is placed in an admin-only page.**

## 7. Recommended implementation architecture

### 7.1 Use semantic typography roles

Keep the three profiles, but replace broad component-name lists with a stable role-based token layer. Recommended roles:

- `--zeno-type-display-size`
- `--zeno-type-page-title-size`
- `--zeno-type-section-title-size`
- `--zeno-type-card-title-size`
- `--zeno-type-body-size`
- `--zeno-type-body-small-size`
- `--zeno-type-control-size`
- `--zeno-type-label-size`
- `--zeno-type-meta-size`
- `--zeno-type-code-size`
- matching `line-height` tokens for display/body/control/meta
- role-specific tracking tokens instead of one universal content tracking value

The first implementation may alias old token names to the new roles temporarily, but end-state component rules should use semantic roles.

Suggested starting scale—not a final visual sign-off:

| Role | Compact | Standard | Expanded |
|---|---:|---:|---:|
| body | 13px | 14px | 15px |
| small body | 11px | 12px | 13px |
| control | 13px | 14px | 15px |
| label | 10px | 11px | 12px |
| metadata | 9px | 10px | 11px |
| card title | 14–16px by hierarchy | +1px | +2px |
| section title | 17px | 18px | 20px |
| page title | preserve current profile clamps | preserve current profile clamps | preserve current profile clamps |

Display/landing hero sizes should use explicit per-profile responsive tokens so hierarchy remains intentional; do not globally change root font size as a shortcut.

### 7.2 Apply tokens by semantic role in each stylesheet

Implementation order:

1. `styles.css`: shared dashboard shell, shared headings, metrics, tables/lists, search/filter/control primitives, calendars, settings, overlays, errors, empty states.
2. `lifestyle.css`: Workout, every Journaling/Markdown/history/writer state, Spending.
3. `learning-materials.css`: subject/category cards, topic catalogue, dedicated lesson, practice, quiz, feedback, mastery, review, and not-found.
4. `auth.css`: all login/register/verify/profile/session visual roles.
5. `landing.css`: brand/nav, display text, section copy, panels, controls, fallbacks, security list, footer.

Prefer role tokens in the original component rules. Avoid appending another giant selector list at the end of `styles.css`; that repeats the current maintenance problem.

### 7.3 Remove the spacing-only illusion

After each surface is migrated:

- remove or narrow `.zeno-dashboard .content { letter-spacing: ... }`;
- apply body/meta/display tracking at the same semantic rule that applies size and line height;
- retain deliberate negative display tracking separately;
- retain DM Mono uppercase metadata tracking separately.

### 7.4 Preserve non-text geometry and icons

Do not migrate blindly:

- `.ph` icon glyph sizes;
- SVG action icons;
- arrows/check marks used only as symbols;
- `font-size: 0` responsive hiding rules;
- fixed avatar/icon boxes;
- calendar dots/pulses.

Text may scale while touch targets and icon boxes remain stable. Increase container height/padding only when required to avoid clipping.

### 7.5 Treat dynamic content by rendered role

The implementation must cover text regardless of whether it comes from:

- backend activity/session/change-log records;
- user-entered Doing/Learning/Workout/Journal/Spending records;
- Markdown output;
- static lesson JSON;
- status/error strings.

Do not add typography fields to content JSON or database records. Typography belongs to presentation rules.

### 7.6 Form controls and generated text

Explicitly cover:

- `input`, `textarea`, `select`, and button text;
- placeholder pseudo-elements;
- radio/checkbox option labels;
- native select element computed font, while accepting that the OS popup may vary;
- feedback, alert, loading, empty, and confirmation copy.

### 7.7 Persistence recommendation

For this implementation, retain `hermes-monitor-font-profile` and localStorage behavior to preserve continuity. Do not add a backend migration merely for CSS coverage.

If cross-device persistence is later required, model it as a **user preference**, not a singleton workspace setting. That is a separate product/API task.

### 7.8 Preference access recommendation

Because font profile is a personal readability preference, move or duplicate Appearance into a user-accessible surface such as Profile, or permit all authenticated users to reach an Appearance route/card. Do not broaden admin access to unrelated workspace settings.

This access change should be explicitly approved as part of implementation scope.

## 8. File-by-file execution plan for Luna

### Phase A — tests and token foundation

1. Read this brief and current git status; preserve all existing unrelated modified/untracked work.
2. Extend `frontend/tests/font-profile-contract.test.mjs` with coverage contracts for every stylesheet/surface listed here.
3. Define semantic role tokens for all three profiles in `styles.css`.
4. Keep Compact values pixel-equivalent to current intended UI before migrating selectors.

### Phase B — authenticated shared UI

1. Migrate sidebar, topbar, breadcrumb, statuses, buttons, page eyebrow/connection, headings, cards, filters, forms, metadata, empty/error states, and popovers.
2. Migrate Overview, Change Log, Activity, Doing, Learning Journal, Profile, Settings, and route-not-found.
3. Verify normal text changes size—not tracking only.

### Phase C — page-specific content

1. Migrate Workout and Spending.
2. Migrate Journaling comprehensively, including Markdown heading/list/code hierarchy, editor/preview parity, reason chooser, history, errors, loading, and responsive/focus modes.
3. Migrate every Learning Material surface. The dedicated lesson is a blocking acceptance target because it currently has zero size response.

### Phase D — public/auth scope

If the all-project scope is confirmed:

1. Migrate login/register/verify and auth feedback.
2. Migrate landing text using profile-aware display/body/control/meta tokens without flattening its editorial hierarchy.
3. Decide how a user changes the preference before login; retaining the last device selection is acceptable for the first pass.

### Phase E — responsive and integration verification

1. Test desktop and mobile breakpoints, both themes, expanded/collapsed sidebar, and long localized/user content.
2. Run production build and tests.
3. Rebuild/recreate Docker and verify served assets and HTTP health.
4. Add one dated Change Log entry only after implementation is actually complete.

## 9. Required tests

### 9.1 State behavior

Verify:

- Compact is the fallback for missing/invalid localStorage.
- Selecting each radio updates `data-font-profile` immediately.
- The key survives reload.
- No font-profile change calls `/api/settings` or any other API.
- Focus remains on the selected radio after rerender.
- Normal users can access the preference if the access recommendation is accepted.

### 9.2 Computed-style coverage

For each route/state below, select representative display/title/body/control/label/meta/code text and assert Compact, Standard, and Expanded computed sizes differ as designed:

- `/`
- `/login`, `/register`, `/verify-email`
- authenticated Overview `/`
- `/change-log`
- `/activity`
- `/doing` including add/edit/empty/delete
- `/learning` including add/edit/empty/delete
- `/learning/materials`
- `/learning/materials/english`
- `/learning/materials/english/grammar`
- one dedicated grammar lesson with practice/quiz feedback/mastery
- `/workout` including add/edit/empty/confirm
- `/journaling?view=archive` including expanded history/error/loading
- `/journaling?view=write` including Markdown editor/preview and edit reason
- `/spending` including form, row, empty, and confirm
- `/profile`
- `/settings`
- generic and learning not-found routes

Assertions must distinguish:

- font-size response;
- line-height response;
- deliberate tracking response;
- intentionally fixed icon/symbol geometry.

A tracking-only change does not count as font-size coverage.

### 9.3 Layout/accessibility

At minimum verify 1440px desktop and approximately 390px mobile:

- no clipped text, horizontal page overflow, or unusable ellipsis;
- cards, calendar cells, list rows, popovers, and controls accommodate Expanded;
- 44px touch targets remain intact where already required;
- headings remain hierarchical;
- form labels remain associated;
- radio group remains keyboard-accessible;
- screen-reader-only content stays hidden visually;
- reduced-motion, dark, and light behavior remain intact.

## 10. Acceptance criteria

Implementation is complete only when all are true:

1. Compact, Standard, and Expanded have documented semantic scales.
2. Compact retains the intended current density and hierarchy.
3. Every visual text role in the route/state list is mapped to a semantic typography token or explicitly documented as intentionally fixed.
4. Public landing and auth respond if all-project scope is approved.
5. Authenticated shell text responds; icon-only glyph sizes do not change accidentally.
6. Overview question/answer, Change Log records, Activity data, and all user-owned records respond by their semantic role.
7. Doing and Learning calendars/forms/entries/empty/popover states respond consistently.
8. Workout, Journaling, and Spending have complete page-specific coverage.
9. Journaling rendered Markdown headings/body/lists/code and editor/preview remain internally hierarchical across profiles.
10. Learning Material cards, topic catalogue, complete lesson body, practice, quiz, feedback, mastery, review, and not-found all respond. Dedicated lesson text must no longer be tracking-only.
11. Settings control labels and descriptions themselves respond consistently.
12. Reload persistence works and profile changes generate no backend request.
13. Invalid stored values fall back to Compact.
14. Expanded produces no clipping or horizontal overflow at desktop/mobile targets.
15. Static contract tests and representative computed-style tests pass.
16. `npm test`, TypeScript build, and Vite production build pass.
17. Docker is rebuilt/recreated, reports healthy, and served root/routes return HTTP 200.
18. Existing routes, themes, forms, search/filter, scroll preservation, journaling interactions, and learning interactions remain functional.

## 11. Important constraints

- Do not add a CMS, state-management library, typography dependency, or backend service.
- Do not store presentation size in lesson/content records.
- Preserve the localStorage key for continuity.
- Preserve the current route model and existing static content architecture.
- Do not overwrite unrelated repository changes; the working tree already contains extensive modified/untracked work.
- Do not solve coverage by globally scaling icons or by setting one root font size and hoping every fixed px declaration follows.
- Do not claim completion from regex tests alone; verify computed served UI.

## 12. Open decisions

1. **Scope:** Should the profile affect the public landing and auth screens?  
   **Recommendation:** yes, because the requested target is all project content and the root dataset already exists globally. Preserve landing hierarchy with dedicated display tokens.

2. **Who can change it?**  
   **Recommendation:** every authenticated user; keep workspace-admin settings separate.

3. **Persistence:** device-local or user-account synchronized?  
   **Recommendation for this task:** keep device-local. Treat backend synchronization as a later user-preferences project.

4. **Compact baseline:** exact current pixels or slight cleanup?  
   **Recommendation:** preserve current visual output first; clean up only where existing inconsistency is clearly a bug.

5. **Expanded limits:** should metadata continue growing above 11px?  
   **Recommendation:** begin with current 11px cap, then validate legibility with real layouts before increasing.

6. **Native browser UI:** should OS/native validation and select popups be considered acceptance targets?  
   **Recommendation:** verify the styled control itself; document native popup variation rather than trying to replace native controls.

## 13. Handoff summary

The current feature correctly stores and applies a Compact/Standard/Expanded value, but it is not a full typography system. It changes shared page headings and selected lifestyle/content selectors, while most project text remains fixed-size. The public/auth surfaces and dedicated grammar lesson are wholly unaffected in font size. The broad `.content` tracking rule makes many additional elements appear altered even though their size and line height remain fixed.

Luna should implement semantic typography roles across the existing five stylesheets, preserve Compact and the localStorage key, avoid scaling icons, add computed-style coverage tests, and verify all named routes and conditional states on the served Docker UI.
