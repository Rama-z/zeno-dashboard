# Learning Material List — Implementation Brief for Luna

**Purpose:** Implement the first UI slice after the research/content-foundation phase.  
**Read first:** `CURRICULUM.md` and the four JSON lesson files under `frontend/src/content/learning/english/grammar/lessons/`.  
**Scope boundary:** Do not build a CMS, full adaptive engine, or complete grammar catalogue.

## 1. Observed repository facts

These statements describe the repository as inspected; they are not design proposals.

### Frontend

- The frontend is Vite 6 + strict TypeScript, rendered with template strings and DOM event binding rather than React/Vue (`frontend/package.json`, `frontend/src/main.ts`).
- `frontend/src/main.ts` owns the authenticated shell, the current flat `Page` union, the exact `pagePaths` map, `history.pushState`, and `popstate` handling.
- The existing `/learning` page is a **Learning Journal**: a date-based calendar with user-authored entries, CRUD, completion state, localStorage fallback, and API sync. It is not a curriculum catalogue.
- The existing Learning Journal uses the stable localStorage key `hermes-monitor-learning-v1`; do not rename it during this feature.
- The shell already has shared page-heading, card/surface, navigation, theme, and accessibility patterns. Preserve the Zeno dark/light tokens and current responsive shell.
- Styles are loaded through existing CSS/TypeScript modules (`app-styles.ts`, `styles.css`, feature-specific files such as `lifestyle.ts`/`.css` and `doing.ts`). A dedicated `learning-materials.ts` plus `learning-materials.css` would match the feature-module direction better than adding more curriculum code to `main.ts`.
- `tsconfig.json` enables `resolveJsonModule`, so typed static JSON imports require no dependency.
- There is no Markdown/MDX parser dependency. `main.ts` has a small ad-hoc `renderMarkdown` helper for journal/session text, but it is not a safe general content pipeline.
- Nginx uses `try_files $uri $uri/ /index.html`, so direct requests to nested client routes can reach the SPA (`frontend/nginx.conf`). The client route parser still needs to understand those paths.
- The build already converts one repository Markdown file into static TypeScript through `frontend/scripts/generate-log.mjs`; build-time/static content is therefore an established architectural idea, although lesson JSON can be imported directly without a generator.

### Backend and data

- The backend is a Go 1.23 `net/http` API with PostgreSQL (`backend/internal/api`, `backend/internal/store`, `backend/internal/model`).
- `learning_entries` stores journal records: owner, date, title, note, category, completed, and creation time. It does not model a curriculum topic, mastery, attempts, or review scheduling.
- Learning journal endpoints are `/api/learning` and enforce authenticated ownership in the API layer. Admins can see all records; normal users are filtered to their own records.
- Activity auditing and owner-scoped patterns already exist and should be reused if progress persistence is introduced.
- There is no current learning-material content table and no current mastery/progress table.

## 2. Research findings that affect implementation

- CEFR is best used here as a learner-facing level and outcome framework, not as an official one-to-one English grammar syllabus.
- Authoritative resources repeatedly group material into broad A1–A2, B1–B2, and C-level bands; the product can expose narrower topic labels while keeping the broader path flexible.
- Grammar develops cyclically. Earlier forms return with new meanings or stricter control: present forms return for aspect/state distinctions, passives return in advanced patterns, and conditionals return as third/mixed/inverted forms.
- A useful lesson cycle is diagnostic/check → explanation/examples → practice → check again → later review.
- Mastery should be based on objective-aligned checks, not page views or a simple “completed” checkbox.
- Frequent short review is preferable to duplicating lesson content. Review events should point back to stable topic IDs.

See `CURRICULUM.md` for the full synthesized path, prerequisites, objectives, revisit links, and research sources.

## 3. Recommendation: product and route hierarchy

Keep `/learning` as the existing journal. Add the exact button label **Learning Material List** in the Learning page heading/action area.

Recommended routes:

```text
/learning
└── /learning/materials
    └── /learning/materials/english
        └── /learning/materials/english/grammar
            └── /learning/materials/english/grammar/:topicId
```

Expected page roles:

- `/learning`: existing journal plus the new entry button; no journal regression.
- `/learning/materials`: subject list; initially one card, **English**.
- `/learning/materials/english`: category list; initially one card, **Grammar**.
- `/learning/materials/english/grammar`: ordered/filterable topic list. In the first slice, show only the four prototype lessons and identify the catalogue as a prototype.
- `/learning/materials/english/grammar/:topicId`: dedicated lesson page rendering the selected static lesson.

### Routing implementation

Do not add a router package. The current application is small and already owns History API navigation.

Recommended minimal refactor:

1. Keep the current top-level `Page` identifiers for shell navigation.
2. Add a small route resolver that returns a discriminated route object, for example:

```ts
type AppRoute =
  | { kind: 'page'; page: Page }
  | { kind: 'learning-subjects' }
  | { kind: 'learning-categories'; subjectId: string }
  | { kind: 'grammar-topics'; subjectId: 'english' }
  | { kind: 'grammar-lesson'; subjectId: 'english'; topicId: string }
  | { kind: 'not-found'; path: string };
```

3. Derive sidebar active state from the route so every `/learning/...` child keeps **Learning** active.
4. Use one navigation helper for `pushState`, route resolution, render, focus, and scroll reset.
5. Reuse the resolver in startup and `popstate`. Unknown subject/category/topic IDs should render an in-app not-found state, not silently redirect to Overview.

This avoids stretching the exact `Record<Page, string>` lookup into a fragile dynamic-route map.

## 4. Recommendation: content loading and file structure

The prototype content already exists here:

```text
frontend/src/content/learning/english/grammar/
├── index.json
└── lessons/
    ├── present-simple-vs-continuous.json
    ├── present-perfect-vs-past-simple.json
    ├── conditionals-zero-first-second.json
    └── emphasis-cleft-inversion-auxiliaries.json
```

Recommended implementation files:

```text
frontend/src/
├── learning-materials.ts       # route-specific render and event binding
├── learning-materials.css      # feature styles using existing Zeno tokens
├── learning-content.ts         # types, validation, and an explicit lesson registry
└── content/learning/...        # static source of truth
```

### Loading approach

- Import `index.json` and the four lesson JSON files in `learning-content.ts`.
- Export a typed `Map<string, GrammarLesson>` or equivalent registry keyed by stable topic ID.
- Validate at module initialization in development/build tests: duplicate ID, self-prerequisite, missing objectives, missing quiz, invalid objective index, and manifest/file mismatch.
- Do not `fetch()` repository JSON at runtime unless there is a concrete need. Direct imports give build-time hashing and remove a loading/error state for this small catalogue.
- Do not add MDX, a Markdown parser, a CMS, or a remote content API in the first slice.
- If hundreds of lesson files are added later, the explicit registry can move to Vite's native `import.meta.glob`; that is not necessary for four files.

The JSON shape intentionally contains separate `concept`, `explanation`, `examples`, `practice`, `quiz`, `mastery`, and `review` fields so the UI does not need to parse authoring markup.

## 5. Recommendation: static content vs learner state

Keep the separation:

```text
Curriculum and lesson content
→ repository JSON/Markdown, version-controlled and deployed with the frontend

Learner state
→ authenticated backend + PostgreSQL
```

Do **not** repurpose `learning_entries`; it is a journal and has different semantics.

A future minimal table may be called `learning_topic_progress` and contain:

```text
id
owner_user_id
subject_id
category_id
topic_id
status
mastery_score
attempt_count
content_version
last_reviewed_at
next_review_at
created_at
updated_at
UNIQUE (owner_user_id, topic_id)
```

Keep `topic_id` as a stable repository ID. Do not store full explanations, examples, questions, or answers in PostgreSQL. `content_version` allows a later policy for whether a materially changed lesson needs a new mastery check.

A separate attempt/event table is not justified until the product needs answer-level analytics or audit history. If progress endpoints are introduced, follow existing owner filtering, admin visibility, CSRF, API error, and activity-audit patterns.

## 6. Mapping the three learning models

### Structured Learning Path

- `sequence` provides the default order.
- `prerequisites[]` forms a simple directed graph.
- The topic list can show locked/available/mastered states later.
- The first UI may show prerequisites without enforcing locks until progress persistence exists.

### Mastery-Based Learning

- `objectives[]` defines what the learner must demonstrate.
- Each quiz item has `objectiveIndex`.
- `mastery.minimumScorePercent` and `requiredObjectiveIndexes` support a transparent first mastery rule.
- The first meaningful gate should cover recognition, controlled accuracy, and an independent-use response; the percentage alone is not sufficient evidence of mastery.
- Persist the result only when a real backend progress endpoint exists; never display “saved” when it is browser-only.

### Spaced and Cyclical Learning

- `revisits[]` links the lesson to previously learned concepts.
- `review.suggestedReviewAfterDays` provides simple defaults (currently 1, 7, 21 days).
- Add path-relative retrieval after roughly one lesson, three lessons, the end of the current CEFR stage, and the next stage; this keeps review cyclical even when calendar pacing varies.
- A future scheduler writes `last_reviewed_at` and `next_review_at` to learner state.
- Later advanced topics can generate review items from earlier topics without duplicating lesson records.

## 7. Representative lessons created

1. **Present Simple vs Present Continuous** (`A2`)  
   Validates a two-form contrast, temporary-vs-routine meaning, fill-blank, choice, rewrite, and cyclical review.
2. **Present Perfect vs Past Simple** (`B1`)  
   Validates timeline/aspect explanation, finished-vs-unfinished time, and meaning-based feedback.
3. **Zero, First, and Second Conditionals** (`B1`)  
   Validates a related family of forms, progressive complexity, four objectives, and viewpoint changes.
4. **Emphasis with Clefts, Inversion, and Auxiliaries** (`C1`)  
   Validates advanced transformations, prerequisite display, register notes, and a denser lesson page.

These are intentionally spread across levels and interaction needs. They are not intended to imply that the product path begins at A2.

## 8. Important constraints

- Preserve all existing Learning Journal CRUD, calendar behavior, ownership, localStorage fallback, popover behavior, and scroll preservation.
- Keep route-specific URLs and browser back/forward behavior.
- Reuse Zeno's existing theme tokens, cards, icon system, and accessible focus patterns.
- Escape any lesson text inserted into HTML. Static repository content is trusted for authorship, but renderers should still default to safe text handling.
- Do not expose quiz answers in the visible lesson before the learner submits an item. The answers will exist in the bundled client JSON; this feature is formative learning, not a secure examination.
- Do not migrate all 42 curriculum topics into JSON or PostgreSQL during the first implementation.
- Do not add a CMS, service, router library, state manager, Markdown/MDX toolchain, or heavy dependency.
- Keep content IDs stable once progress references them.
- The current branch contains other in-progress frontend/backend changes; Luna should inspect `git status` before editing and avoid resetting unrelated work.

## 9. Open decisions

These require product direction or real usage data; do not guess them into a large architecture.

1. **Instruction language:** English-only prototype, Indonesian explanations, or a future locale field with translated content?
2. **Initial access policy:** show all prototype lessons, visually lock unmet prerequisites, or hard-block navigation?
3. **Progress timing:** ship the first UI as read-only/static, or include the minimal `learning_topic_progress` endpoint in the same iteration?
4. **Mastery rule:** is 80% with all objectives represented acceptable, and how many retries should be immediate?
5. **Review UX:** dedicated “Review due” queue, review cards inside the topic list, or integration with the existing Learning calendar?
6. **Content-change policy:** when `contentVersion` increases, retain mastery, mark review due, or require remastery only for major versions?
7. **Topic catalogue visibility:** show only implemented lessons or also show the broader curriculum as “planned/coming later”?

Recommended defaults for the first UI slice: English-only content, show all four examples, display prerequisite information without hard locks, keep progress in memory only with an explicit “prototype/not saved” label, and defer database work until the lesson interaction is validated.

## 10. Acceptance criteria for the first implementation

### Navigation and routing

- [ ] The existing `/learning` page includes a visible button labelled exactly **Learning Material List**.
- [ ] The button opens `/learning/materials` without a full page reload.
- [ ] Subject, category, topic-list, and lesson routes follow the hierarchy in this brief.
- [ ] Deep links, refresh, browser Back, and browser Forward work for every route.
- [ ] The Learning sidebar item remains active on all `/learning/...` routes.
- [ ] Unknown subject/category/topic IDs render a useful in-app not-found state.

### Content experience

- [ ] `/learning/materials` shows English as the only subject.
- [ ] `/learning/materials/english` shows Grammar as the only category.
- [ ] The Grammar list is loaded from `index.json`, not duplicated in rendering code.
- [ ] All four representative lessons open by their stable IDs.
- [ ] A lesson page renders Concept, Explanation, Examples, Practice, Quiz/Check Understanding, and Review/Key Takeaways.
- [ ] Multiple-choice, fill-blank, and rewrite examples have a usable response/reveal-feedback interaction.
- [ ] Mastery calculation is objective-aware and clearly labelled as persisted or prototype-only.
- [ ] Quiz answers are not visible before submission/reveal.

### Architecture and regression safety

- [ ] Curriculum/lesson content remains static repository content; no lesson-content database table is added.
- [ ] Existing Learning Journal CRUD and calendar behavior still pass manual and automated checks.
- [ ] No new framework, router, CMS, state manager, or Markdown/MDX dependency is added.
- [ ] Content types/validation reject duplicate IDs, self-prerequisites, invalid objective references, and manifest/file mismatches.
- [ ] New UI uses existing Zeno dark/light tokens and is keyboard/focus accessible.
- [ ] Frontend tests pass and `npm run build` succeeds.
- [ ] The production frontend container is rebuilt/recreated, reports healthy, and representative nested routes return the SPA over HTTP.
- [ ] The completed implementation is recorded in Zeno's Change Log with an accurate timestamp.
