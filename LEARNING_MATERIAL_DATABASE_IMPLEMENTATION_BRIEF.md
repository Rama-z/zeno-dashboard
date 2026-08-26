# Zeno English Learning Materials — Database Expansion Brief for Luna

**Repository:** `/home/capriconous/Documents/monitoring`  
**Purpose:** implementation handoff for expanding English Grammar A1–C1 and moving runtime material content to PostgreSQL  
**Status:** analysis/brief only; this task did not modify application code  
**Read first:** this file, then inspect the current working tree before editing—there are unrelated modified and untracked files.

## 1. Target outcome

Preserve the current Learning Material List and its four useful lessons, establish the complete 20-family A1–C1 curriculum structure, publish a substantial first content batch, and make PostgreSQL—not frontend JSON imports—the runtime source for subjects, categories, topics, lessons, examples, exercises, and learner progress.

Do not replace the Learning Journal at `/learning`. It remains a user-owned date-based journal. The catalogue remains under `/learning/materials/...`.

This brief supersedes the storage boundary in the older `LEARNING_MATERIAL_IMPLEMENTATION_BRIEF.md`, which correctly described the first static prototype but explicitly deferred database material content. Reuse that document’s route and UI context only where it still matches the live repository; use this brief for the database phase.

## 2. Observed repository facts

### 2.1 Current frontend and routes

- The frontend is Vite + strict TypeScript with template-string rendering and direct DOM bindings; there is no React/Vue/router dependency.
- `frontend/src/app-route.ts:16-85` already resolves:
  - `/learning/materials`
  - `/learning/materials/:subjectId`
  - `/learning/materials/:subjectId/:categoryId`
  - `/learning/materials/:subjectId/:categoryId/:topicId`
- `frontend/src/learning-materials.ts` renders subject, category, lesson list, lesson detail, practice, quiz feedback, mastery summary, review, loading-independent static not-found states, and filters.
- The last route segment is named `topicId`, but it currently resolves directly to one `GrammarLesson`; there is no separate runtime topic-family entity.
- `frontend/src/learning-content.ts` imports one manifest and four JSON lesson files explicitly, validates them synchronously, and exports in-memory maps.
- `frontend/src/main.ts:115-122,350-374,451` keeps `/learning` as the Learning Journal and renders Learning Materials only for nested routes.
- Current material interaction state is module memory:
  - `practiceAnswers` and `quizAnswers` are `Map`s in `frontend/src/learning-materials.ts:8-9`;
  - exact normalized strings are compared client-side at `learning-materials.ts:61-63,121-129`;
  - mastery is calculated client-side at `learning-materials.ts:81-95`;
  - reload loses answers and mastery.
- Prerequisites are informational only; the UI says so in `learning-materials.ts:42-54`.
- The current notice explicitly says material content is static and progress/mastery is not saved: `learning-materials.ts:29-31`.

### 2.2 Current content model

`frontend/src/learning-content.ts:7-49` defines:

- exercise types: `multiple_choice`, `fill_blank`, `rewrite`;
- stable lesson ID, subject, category, locale, title, CEFR level, sequence, duration;
- `prerequisites[]`, `revisits[]`, and `objectives[]`;
- concept summary/contrast;
- explanation sections;
- examples;
- practice and objective-indexed quiz items;
- mastery threshold and required objectives;
- review takeaways, intervals, and prompts;
- schema/content versions.

Missing as explicit fields:

- a 20-family grammar topic ID separate from lesson ID;
- a first-class rule/pattern list;
- common-mistake pairs;
- example-variation metadata;
- publication state;
- database timestamps;
- persisted learner progress.

### 2.3 Current lesson inventory

| Stable ID | Level | Seq | Objectives | Examples | Practice | Quiz | Useful role |
|---|---:|---:|---:|---:|---:|---:|---|
| `present-simple-vs-continuous` | A2 | 17 | 3 | 4 | 3 | 4 | supplementary present-tense contrast |
| `present-perfect-vs-past-simple` | B1 | 21 | 3 | 4 | 3 | 4 | target Tenses/B1 content |
| `conditionals-zero-first-second` | B1 | 26 | 4 | 4 | 3 | 4 | target Conditionals/B1 content |
| `emphasis-cleft-inversion-auxiliaries` | C1 | 41 | 4 | 4 | 3 | 4 | primarily Word order/C1; partially supports negative inversion/emphasis |

Aggregate facts:

- 4 lessons: A2 ×1, B1 ×2, C1 ×1; A1 and B2 are absent.
- 98 estimated minutes, 14 objectives, 12 explanation sections, 16 examples, 12 practice items, and 16 quiz items.
- Review metadata contains 14 takeaways and 8 retrieval prompts.
- The lessons contain 11 prerequisite references (10 unique) and 10 revisit references (9 unique); most targets are planned curriculum IDs rather than implemented lessons.
- No duplicate lesson IDs or duplicate exercise IDs were found.
- Every lesson has only four examples, so none meets the new minimum of five.
- Current examples are valid useful seeds, but some are paired around the same subject/context (for example, the A2 lesson repeats Maya and the shop). Add variation rather than discarding them.
- All lessons use schema `1.0`, content version `1`, an 80% threshold, objective coverage, and review days `[1,7,21]`.
- The four lessons do not include explicit `rules` or `commonMistakes` arrays; relevant information is embedded in explanations/feedback.

### 2.4 Existing curriculum planning artifact

`CURRICULUM.md` contains a useful 42-step A1–C1 path with stable IDs, prerequisites, objectives, and revisit planning. Preserve it as an ordering/prerequisite input; do not treat its 42 broad units as complete coverage of the new 20×5 matrix.

Current JSON references many planned IDs from that document that are not implemented yet. One reference is also inconsistent: `emphasis-cleft-inversion-auxiliaries.revisits` contains `core-tense-review`, which is neither implemented nor present in `CURRICULUM.md`. The likely intended existing ID is `advanced-integration-review`; Luna must confirm and correct the link during import, then increment that lesson’s `contentVersion`.

### 2.5 Current database and backend

- `learning_entries` is the Learning Journal table, not curriculum content: `backend/internal/store/schema.sql:75-93`.
- It stores owner/date/title/note/category/completed only.
- `model.LearningEntry` mirrors that journal shape: `backend/internal/model/model.go:62-71`.
- `/api/learning` CRUD is owner-scoped in the API layer: `backend/internal/api/api.go:738-880`.
- `frontend/src/api.ts:49-58,201-210` exposes journal CRUD only.
- There is no subject/category/topic/lesson table, no material-content endpoint, no material-progress table, and no mastery/review persistence.
- The API `Store` interface is centralized in `backend/internal/api/api.go:40-76`; fake stores in API tests must be updated when methods are added.
- `backend/internal/store/postgres.go:17-55` embeds and executes the entire idempotent `schema.sql` under a PostgreSQL advisory lock at startup. `schema_migrations` currently records versions, but the file itself is executed as one whole schema script.
- The API is Go `net/http`, has cookie authentication, CSRF checks for writes, activity auditing, OpenAPI, and PostgreSQL store tests.

### 2.6 Current tests

`frontend/tests/learning-materials-contract.test.mjs` is a source/JSON contract test. It hard-codes exactly four lessons and verifies only minimum presence. It does not test API loading, PostgreSQL data, progress persistence, five-example diversity, complete curriculum coverage, dangling relationships, or computed interaction after reload.

Current audit baseline: frontend tests pass 15/15 and `/usr/local/go/bin/go test ./...` passes. PostgreSQL integration tests were skipped because `TEST_DATABASE_URL` was not set, so those unit results are not evidence that the proposed DB catalogue works. Plain `go` is not on this environment’s PATH; use the repository-configured absolute Go binary.

## 3. Gaps against the requested curriculum

Current direct coverage is limited to:

- **Tenses:** A2 supplemental contrast; B1 present-perfect/past-simple contrast.
- **Conditionals:** B1 zero/first/second.
- **Word order:** C1 emphasis/inversion, with partial overlap into Negation/C1.

Everything else is absent as a complete database-backed unit. In particular:

- no A1 foundation catalogue;
- no B2 lessons;
- no complete progression for Modals, Passive, Questions, Negation, Clauses, Articles, Countability, Determiners, Pronouns, Gerunds, Infinitives, Participles, Reported speech, Relative clauses, Conjunctions, Prepositions, or Comparison;
- no complete vertical A1→C1 path for any topic family;
- no persisted progress, mastery, attempts, or review dates;
- no runtime database source;
- no explicit relationship from a grammar family to one or more level-specific lessons.

## 4. Research findings

The CEFR Companion Volume provides proficiency descriptors and an action-oriented framework; it does not prescribe a fixed English grammar syllabus.[5]

Cambridge’s discussion of English Grammar Profile criterial features likewise says level features should guide readiness, not become strict course-content rules.[8]

British Council groups grammar into A1–A2, B1–B2, and C1 bands and uses a test → explanation → test lesson cycle.[2][3][4]

Its general guidance also recommends short, repeated grammar practice rather than one-time completion.[1]

Advanced catalogues deliberately revisit familiar grammar with more sophisticated uses: British Council’s C1 list returns to passives and present forms, then adds ellipsis, advanced linking, probability, and participle clauses.[4]

BBC’s intermediate grammar catalogue similarly includes present-perfect continuous, past perfect, conditionals, reported speech, relative clauses, passives, and intensifiers.[7]

Cambridge exposes activities in broad Basic A1–A2, Independent B1–B2, and Proficient C1–C2 bands.[6]

Therefore Zeno should keep exact A1/A2/B1/B2/C1 labels for filtering and sequencing, while allowing familiar forms to recur as new lessons with new meanings and demands.

All new explanations and examples must be original. External sources validate sequencing, terminology, and grammatical correctness; they are not text to copy.

## 5. Canonical curriculum structure

Use **20 topic families** under `English → Grammar`. Each applicable level cell must have at least one lesson; split a cell into multiple lessons when it would exceed four objectives or roughly 30 minutes.

| Topic family | A1 | A2 | B1 | B2 | C1 |
|---|---|---|---|---|---|
| Tenses | present simple, `be` | past simple, future basic | present perfect, past continuous | past perfect, future continuous/perfect | tense choice for nuance/discourse |
| Modals | `can`, `can't` | `should`, `must`, `have to` | `might`, `could`, basic deduction | `must/might/should have` | nuanced modality and hedging |
| Passive | contextual awareness only | `is made` | common passive forms | passive across tenses/modals | impersonal and sophisticated passive |
| Conditionals | basic `if` | simple real conditions | zero, first, second | third conditional | mixed conditionals and inversion |
| Word order | basic SVO | adverb placement | complex sentences | emphatic structures | marked word order and inversion |
| Questions | `Do you …?` | past/future questions | indirect questions | embedded/complex questions | rhetorical/nuanced questions |
| Negation | `not`, `don't` | `never`, `nothing` | negative constructions | prefixes/complex negation | inversion after negative expressions |
| Clauses | `and/but` | `because/when/if` | subordinate clauses | complex clause combinations | reduced and embedded clauses |
| Articles | basic `a/an/the` | common rules | zero-article distinctions | abstract/general reference | stylistic/idiomatic article use |
| Countability | singular/plural | `much/many` | tricky uncountables | abstract/count shifts | nuanced countability |
| Determiners | `this/that/some` | `any/many/few` | `either/neither/both` | complex quantification | subtle reference/quantification |
| Pronouns | `I/you/he` | object/possessive | reflexive/indefinite | reference across complex text | sophisticated cohesion/reference |
| Gerund | `like doing` | common patterns | broader verb + gerund | meaning changes | complex gerund constructions |
| Infinitive | `want to go` | purpose `to do` | verb + infinitive | perfect/passive infinitives | nuanced infinitive structures |
| Participles | adjective use | `boring/bored` | basic participle phrases | participle clauses | compressed sophisticated structures |
| Reported speech | basic `say/tell` | simple reporting | tense backshift | reporting verbs/patterns | nuanced stance/reporting |
| Relative clauses | basic `who/which` | defining clauses | defining/non-defining | reduced relatives | complex embedded relatives |
| Conjunctions | `and/but/or` | `because/so` | `although/unless` | `whereas/despite/provided that` | sophisticated discourse linking |
| Prepositions | basic place/time | movement/common patterns | dependent prepositions | complex/idiomatic combinations | subtle idiomatic selection |
| Comparison | `bigger/best` | `more/less`, `as … as` | comparative structures | complex comparison | rhetorical/nuanced comparison |

**Coverage count:** 100 matrix cells, of which 99 are teachable units if Passive/A1 remains contextual awareness rather than a standalone assessed lesson. Store all 100 curriculum cells as metadata, but set Passive/A1 to `coverage_mode = awareness` and do not require mastery unless product direction explicitly changes.

### Authoring clarifications

- Treat each matrix cell as a lesson group, not necessarily one page. Split broad cells before authoring; B1 zero/first/second conditionals and B2 perfect/passive infinitives are clear split candidates.
- Define A2 “future basic” as at least `will` and `be going to`; decide explicitly whether present continuous for arrangements belongs there.
- Keep A1 Clauses focused on sentence structure and A1 Conjunctions focused on linking meaning, even though both mention `and/but`.
- Treat A1 `say/tell` as a reporting/verb-pattern precursor, not full backshifted reported speech.
- Label B2 `despite` accurately as a preposition/linker, not a conjunction, while preserving its role in contrast/concession.
- Convert broad labels such as “complex”, “nuanced”, and “sophisticated” into observable outcomes: hedge a claim, maintain reference through a paragraph, rewrite for information focus, or choose a structure for register.
- If Passive/A1 becomes a published awareness micro-unit, it still requires five varied recognition examples; otherwise keep it unpublished metadata only.

## 6. Recommended database model

Use the smallest maintainable hybrid model: one global catalogue table plus one owner-scoped progress table. Keep identity/filter/order/version fields relational and keep evolving lesson structure, prerequisite/revisit IDs, exercises, and review policy in JSONB. This represents subject → category → topic family → lesson without creating lookup tables for the current one-subject/one-category product slice.

### 6.1 Tables

#### `learning_materials`

- `id VARCHAR(120) PRIMARY KEY` — preserve all current lesson IDs
- projected taxonomy: `subject_id`, `subject_title`, `category_id`, `category_title`, `topic_id`, `topic_title`
- `locale`
- `cefr_level VARCHAR(2)` with `CHECK IN ('A1','A2','B1','B2','C1')`
- `coverage_mode VARCHAR(20)` with `CHECK IN ('lesson','awareness','planned')`
- `title`, `summary`, `sequence`, `position_within_topic`, `estimated_minutes`
- `schema_version`, `content_version`
- `content JSONB NOT NULL` — objectives, concept, rules, explanation, examples, mistakes, practice, quiz, prerequisites, and revisits
- `mastery JSONB`
- `review JSONB`
- `published`, timestamps
- uniqueness on `(subject_id, category_id, sequence)` and `(topic_id, cefr_level, position_within_topic)`
- published catalogue index on `(subject_id, category_id, cefr_level, sequence)`

The seed validator must ensure projected taxonomy/version fields agree with JSON content. A future multi-subject CMS may normalize taxonomy later; do not pay that complexity cost now.

#### `learning_topic_progress`

- `owner_user_id UUID` FK to users
- `material_id VARCHAR(120)` FK to `learning_materials`
- `status` in `('in_progress','mastered')`
- `mastery_score` nullable, 0–100
- `objective_state JSONB NOT NULL DEFAULT '{}'::jsonb`
- `attempt_count`
- `content_version`
- `last_reviewed_at`, `next_review_at`, `created_at`, `updated_at`
- primary key `(owner_user_id, material_id)`
- index `(owner_user_id, next_review_at)`

Do not persist `locked`, `available`, or `review_due`; derive them from prerequisite IDs, progress absence/status, and `next_review_at`. Do not add an answer-attempt/event table in the first iteration unless answer-level analytics is explicitly required. Never store raw learner answers in progress.

### 6.2 Lesson `content` contract

Each published taught lesson must contain:

```json
{
  "objectives": ["..."],
  "concept": {"summary": "...", "contrast": "..."},
  "rules": [
    {"label": "...", "pattern": "...", "explanation": "..."}
  ],
  "explanation": [
    {"heading": "...", "body": "..."}
  ],
  "examples": [
    {
      "sentence": "...",
      "note": "...",
      "tags": ["affirmative", "everyday", "third-person"]
    }
  ],
  "commonMistakes": [
    {"incorrect": "...", "correct": "...", "explanation": "..."}
  ],
  "practice": [
    {"id": "...", "type": "multiple_choice|fill_blank|rewrite", "prompt": "...", "answer": "...", "explanation": "...", "options": []}
  ],
  "quiz": [
    {"id": "...", "type": "...", "objectiveIndex": 0, "prompt": "...", "answer": "...", "explanation": "..."}
  ]
}
```

Keep `mastery` and `review` outside `content` so the backend can query/update policy without rewriting the whole lesson body.

### 6.3 Validation rules

The seed validator must reject:

- duplicate subject/category/topic/lesson/item IDs;
- unsupported CEFR levels or exercise types;
- missing/empty objectives, rules, explanations, practice, quiz, mastery, or review;
- published taught lessons with fewer than five examples;
- self-links or links to unknown lesson IDs;
- duplicate sequence/position within the same scope;
- quiz objective indexes outside the objective array;
- mastery-required indexes outside the objective array;
- multiple-choice answers absent from options;
- examples that are exact duplicates after normalization;
- published rows with `planned` coverage;
- incomplete matrix coverage metadata.

Do diversity validation with explicit example tags and content tests; do not pretend that sentence-string uniqueness alone proves variety.

## 7. Preserve and migrate existing content

1. Keep the four existing lesson IDs and route URLs unchanged.
2. Import their useful concept, explanation, practice, quiz, mastery, and review data.
3. Add at least one genuinely different example to each; preferably add two where the current four form same-context pairs.
4. Add explicit `rules`, `commonMistakes`, and example tags.
5. Increment each imported lesson to `contentVersion: 2` because its schema/content changes.
6. Assign primary topic families:
   - both tense contrasts → `tenses`;
   - conditionals lesson → `conditionals`;
   - emphasis lesson → `word-order`.
7. Correct or explicitly resolve the dangling `core-tense-review` link before seeding content.
8. Preserve all valid planned IDs from `CURRICULUM.md` when they become lessons. Do not rename IDs merely to force a new naming convention.
9. New IDs should use stable semantic slugs, normally `<family>-<level>-<focus>`, while existing IDs remain exceptions.
10. Never delete or overwrite `learning_entries`; it is a separate user journal.
11. Migration/upsert must never delete `learning_topic_progress`.

There is no persisted material progress today, so this is the last low-risk point to normalize references without an alias table. Once DB progress ships, IDs are immutable.

## 8. Seed and batching strategy

### 8.1 Canonical seed source

Store version-controlled seed documents under the backend, for example:

```text
backend/internal/learningseed/
├── catalog.json
└── english/grammar/lessons/*.json
```

Use `go:embed`, a Go validator, and one transactional seeder. Runtime reads must come from PostgreSQL; seed JSON is deployment input, not frontend runtime content.

Recommended execution:

- add `backend/cmd/seed-learning/main.go`;
- add `make seed-learning` using the existing `DATABASE_URL` convention;
- run explicitly during deployment after schema initialization;
- upsert by stable ID/content version;
- validate projected subject/category/topic fields and all JSON prerequisite/revisit IDs before the upsert;
- do not delete unknown DB rows;
- do not overwrite an equal/newer DB `content_version` without an explicit force flag;
- fail the transaction on validation or dangling relationships.

Do not place hundreds of lines of lesson JSON literals directly in `schema.sql`, and do not reseed destructively on every API startup.

### 8.2 Complete curriculum skeleton

Seed immediately:

- English subject;
- Grammar category;
- all 20 topic families;
- metadata for all 100 matrix cells;
- Passive/A1 as awareness-only;
- `planned` lesson metadata for unpublished cells;
- all prerequisites/revisit links that point to real seeded IDs;
- the four upgraded current lessons as published.

Planned records must not expose empty lesson pages. The catalogue may show them as “Planned” only if product direction approves; otherwise API list responses should exclude unpublished rows.

### 8.3 Full-content batches

Author level-first so the learner path genuinely progresses A1 → A2 → B1 → B2 → C1. For each level, use four reviewable sub-batches:

| Sub-batch | Families |
|---|---|
| Sentence mechanics | Tenses, Word order, Questions, Negation, Modals |
| Noun phrase | Articles, Countability, Determiners, Pronouns, Comparison |
| Expansion and logic | Prepositions, Conjunctions, Clauses, Relative clauses, Conditionals |
| Verb structures and voice | Gerund, Infinitive, Participles, Passive, Reported speech |

The first implementation should complete A1 (19 productive groups plus the approved Passive awareness policy) and preserve/upgrade the four existing A2/B1/C1 lessons. That expands the catalogue substantially without publishing advanced levels whose foundations are still missing. Then complete A2, B1, B2, and C1 in order. Run a 20-family coverage report and an integrated level assessment after each level.

When a cell is split into independently taught subtopics, every subtopic—not merely the parent cell—must meet the five-example and exercise requirements. B1 zero/first/second conditionals is an explicit split candidate. Across 100 cells, the absolute cell-level floor is 500 examples; real output will be higher after necessary splits.

## 9. Example and exercise authoring requirements

For **every published taught lesson**:

- at least five meaningfully different examples;
- variation across subject/person where relevant;
- affirmative, negative, and question forms where the grammar allows them;
- varied time/context rather than noun substitution only;
- formal/informal or spoken/written contrast at B2/C1 where relevant;
- everyday and contextualized uses;
- notes explaining meaning or register, not merely repeating the rule;
- at least one common-mistake correction when learners commonly confuse the form;
- practice before mastery check;
- quiz items mapped to every required objective;
- feedback explaining why an answer is correct;
- a review takeaway and retrieval prompts.

Minimum five examples is a floor, not a target for broad cells. Split lessons instead of making one page excessively long.

Do not copy source lesson prose. Use source terminology and progression only to validate original content.

## 10. API contract

Keep the current `/api/learning` journal endpoints unchanged. Add a separate namespace:

- `GET /api/learning-materials?subjectId=&categoryId=&level=`
  - relational summary fields for published lessons;
  - subject/category/topic labels, CEFR, sequence, duration, prerequisite IDs;
  - current authenticated user’s progress summary and derived review-due flag.
- `GET /api/learning-materials/{id}`
  - full structured content, mastery/review policy, prerequisite/revisit IDs, and current-user progress.
- `PUT /api/learning-materials/{id}/progress`
  - body: `contentVersion`, `status`, `masteryScore`, objective state, review timestamps/stage as applicable;
  - handler assigns `owner_user_id` from the authenticated actor, validates ranges/version, and upserts one progress snapshot.

All three endpoints require the same authenticated session as the dashboard. The write uses existing CSRF, error, and activity-audit conventions. Enforce progress ownership directly in SQL; do not load every user’s progress and filter in memory, and do not implicitly give admins a cross-user mutation path.

Content mutation does not need an HTTP/CMS endpoint. Keep formative answers hidden in the UI until submission as today. Client-side exact grading may remain in this minimal slice; persist only the validated result snapshot. A server-scored attempt endpoint is a later extension if tamper resistance or answer analytics becomes a real requirement.

## 11. Frontend changes

### Preserve

- existing `/learning` Learning Journal CRUD/calendar/localStorage fallback;
- `hermes-monitor-learning-v1` key;
- route-specific URLs, browser Back/Forward, sidebar active state, focus behavior, and Zeno themes;
- the current four lesson URLs.

### Replace/refactor

- `frontend/src/learning-content.ts`
  - remove direct lesson JSON imports;
  - retain/adapt DTO types and response validation;
  - add catalogue/lesson cache and loading/error state.
- `frontend/src/api.ts`
  - add material summary/detail and progress DTOs/calls.
- `frontend/src/learning-materials.ts`
  - render API loading/error/empty states;
  - remove hard-coded “1 category”, “4 prototype lessons”, A2→C1, and prototype/not-saved copy;
  - group/filter lesson summaries by CEFR and topic family;
  - show planned items only if approved;
  - display prerequisite, mastered, in-progress, and review-due states;
  - preserve current practice/mastery feedback, then persist validated progress snapshots;
  - keep answer text hidden before submission.
- `frontend/src/app-route.ts`
  - preserve route shapes; the existing final `topicId` may continue to carry a lesson ID for URL compatibility;
  - rename internal variables only if it does not change routes.
- `frontend/src/main.ts`
  - trigger catalogue loading when entering material routes without blocking the Learning Journal;
  - do not add the material catalogue to the unrelated `syncBackend()` journal migration path.
- `frontend/src/learning-materials.css`
  - add planned/progress/review/loading/error states using existing tokens and the project’s font-profile requirements.

Do not fetch every full lesson on the catalogue page. Fetch summaries once, then full content per lesson and cache by `id + contentVersion`.

## 12. Required backend changes by file

- `backend/internal/store/schema.sql`
  - add `learning_materials` and `learning_topic_progress`, checks, FK, and indexes idempotently;
  - record schema version 17 after successful definitions, while documenting that the current runner executes the whole file rather than gating by version.
- `backend/internal/model/model.go`
  - add material summary/detail and progress request-response models;
  - use `json.RawMessage` or typed structs consistently for JSONB scan/marshal.
- `backend/internal/store/postgres.go`
  - catalogue list/detail queries;
  - transactional seed upserts;
  - owner-scoped progress read/upsert;
  - no changes to Learning Journal semantics.
- `backend/internal/api/api.go`
  - extend `Store` interface;
  - register list, detail, and progress handlers;
  - validate IDs, filters, content version, score/objective state, and ownership;
  - audit mastery/review state transitions without logging answers.
- `backend/internal/api/openapi.yaml`
  - document all new routes and schemas; clearly distinguish Learning Journal from Learning Materials.
- `backend/internal/store/postgres_test.go`
  - schema/seed/query/progress round trips, idempotent reseed, and no progress deletion.
- `backend/internal/api/api_test.go`
  - fake-store methods and list/detail/404/CSRF/validation/actor-ownership tests.
- `backend/internal/learningseed/**` and `backend/cmd/seed-learning/main.go`
  - embedded source, validator, transactional command.
- `backend/Makefile` and backend documentation
  - seed command and safe operational sequence.

## 13. Compatibility with the learning model

### Structured Learning Path

- topic/family and lesson ordering are projected relational fields and queryable;
- prerequisites/revisits are stable, validated JSON lesson-ID references;
- availability/locked state is derived from progress;
- current 42-step planning can be preserved as sequence/prerequisite input while the 99-cell coverage fills its gaps.

### Mastery-Based Learning

- mastery remains objective-aware;
- backend, not page views, persists mastery;
- `content_version` records which content the score applies to;
- recognition, controlled production, and at least one rewrite/independent-use item should be represented where auto-scoring permits;
- free-form answers that cannot be graded reliably should not silently count as correct.

### Spaced and Cyclical Learning

- `revisit` links and lesson review intervals preserve the current `[1,7,21]` model as defaults;
- `last_reviewed_at`/`next_review_at` make review queues possible;
- later lessons can revisit earlier forms without duplicating the earlier lesson record;
- no adaptive recommendation engine is required in this implementation.

## 14. Verification and tests

### Static/seed validation

- exactly 1 English subject, 1 Grammar category, and 20 topic families;
- complete metadata coverage for 100 cells and 99 taught cells under the recommended Passive/A1 policy;
- all five CEFR levels represented;
- every published taught lesson has ≥5 examples and all required sections;
- no duplicate IDs, dangling links, self-links, invalid objective references, or manifest/DB count mismatch;
- four current IDs exist unchanged with content version 2+;
- `core-tense-review` is resolved;
- seed is deterministic and idempotent.

### Backend

- schema bootstrap works on empty and already-initialized databases;
- seed transaction rolls back on invalid content;
- equal-version reseed is a no-op; newer-version seed updates content without deleting progress;
- catalogue list excludes unpublished lessons by default;
- lesson detail returns the correct structured content;
- progress is owner-scoped;
- progress writes enforce content version, score range, objective-state shape, and actor ownership;
- review updates dates without erasing mastery history;
- CSRF/auth and malformed input tests pass;
- OpenAPI validation/build passes;
- `/usr/local/go/bin/go test ./...` passes in this environment.

### Frontend

- replace the hard-coded four-lesson contract test with API/fixture-driven tests;
- routes/deep links/back/forward continue to work;
- catalogue loading/error/empty states are usable;
- filters cover A1, A2, B1, B2, C1 and topic families;
- existing four lesson URLs still open;
- answer/feedback/mastery flow survives rerender and reload through backend state;
- quiz answers are not displayed before submit;
- Learning Journal CRUD/calendar/scroll behavior is unchanged;
- dark/light and Compact/Standard/Expanded typography remain legible;
- `npm test` and `npm run build` pass.

### Served integration

- seed a clean PostgreSQL database;
- compare DB counts with validator output programmatically;
- log in as two users and prove progress isolation;
- complete one representative mastery check, persist its progress snapshot, reload, and verify state;
- advance one review and verify `nextReviewAt`;
- rebuild/recreate the frontend container;
- confirm container health and HTTP 200 for catalogue and representative nested lesson routes;
- only then add a dated Change Log record.

## 15. Acceptance criteria

1. Runtime Learning Materials content is read from PostgreSQL; frontend lesson JSON is no longer the runtime source.
2. `/api/learning` and `learning_entries` retain existing Learning Journal behavior.
3. English → Grammar contains all 20 topic families and the complete A1–C1 matrix metadata.
4. Passive/A1 is explicitly awareness-only or changed by an approved product decision.
5. The four existing lesson IDs, useful content, routes, mastery policy, and review policy are preserved and upgraded.
6. Every published taught lesson has at least five varied, original examples.
7. Every published lesson has objectives, rules, explanation, practice, objective-aligned quiz, feedback, review, and common mistakes where relevant.
8. No duplicate or dangling content identifiers exist.
9. The first content delivery completes A1 across all 20 families under the approved Passive policy, while later levels remain valid unpublished metadata until completed in A2→B1→B2→C1 order.
10. Material list, detail, and progress endpoints are documented and tested.
11. Learner mastery/progress persists per owner and survives reload.
12. Prerequisites, mastery, and due review can be represented without an adaptive engine.
13. Seed execution is transactional, repeatable, non-destructive, and content-version aware.
14. Unpublished/planned lessons never open as empty lesson pages.
15. Current Learning Journal, routes, accessibility, themes, typography profiles, and scroll behavior regressions are absent.
16. Frontend tests/build, backend tests, DB integration tests, Docker health, and served-route checks pass.

## 16. Open decisions

1. **Passive/A1:** contextual awareness only (recommended) or a standalone non-mastery lesson?
2. **Instruction language:** English-only, Indonesian explanation, or bilingual content? Preserve current `locale` capability; do not mix languages inconsistently.
3. **Planned visibility:** hide unpublished rows (recommended initially) or show disabled “Planned” cards?
4. **Prerequisite UX:** informative, soft warning, or hard lock? Recommended: derive locks but allow an explicit “study anyway” path until usage data exists.
5. **Free-form grading:** exact accepted-answer lists, manual self-check, or future semantic grading? Do not introduce an LLM grader in this scope.
6. **Content update policy:** recommended default is retain mastery but mark review due when `contentVersion` increases materially.
7. **Admin editing:** seed-only DB content (recommended now) or a future admin CMS/API? Do not build a CMS in this implementation.
8. **First merge size:** recommended scope is schema/API/seeder + complete metadata + imported four lessons + full A1. If review capacity is limited, split infrastructure/import and the four A1 sub-batches into consecutive PRs without exposing empty planned pages.

## Sources

[1] https://learnenglish.britishcouncil.org/free-resources/grammar — Grammar | LearnEnglish
[2] https://learnenglish.britishcouncil.org/free-resources/grammar/a1-a2 — A1-A2 grammar | LearnEnglish
[3] https://learnenglish.britishcouncil.org/free-resources/grammar/b1-b2 — B1-B2 grammar | LearnEnglish
[4] https://learnenglish.britishcouncil.org/free-resources/grammar/c1 — C1 grammar | LearnEnglish
[5] https://rm.coe.int/common-european-framework-of-reference-for-languages-learning-teaching/16809ea0d4 — CEFR Companion Volume
[6] https://www.cambridgeenglish.org/learning-english/activities-for-learners — Activities for Learners | Cambridge English
[7] https://www.bbc.co.uk/learningenglish/english/intermediate-grammar — BBC Medium Grammar
[8] https://www.cambridge.org/elt/blog/2021/06/23/using-cefr-criterial-features-for-grammar-instruction — CEFR Criterial Features for Grammar Instruction
