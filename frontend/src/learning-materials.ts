import { api, ApiError, type LearningMaterialProgress, type LearningMaterialSummary } from './api';
import type { AppRoute } from './app-route';
import { fetchLearningMaterialDetail, fetchLearningMaterialSummaries, type GrammarLesson, type LessonItem, type LessonItemType } from './learning-content';

type LearningMaterialRoute = Extract<AppRoute, { kind: 'learning-subjects' | 'learning-categories' | 'grammar-topics' | 'grammar-lesson' | 'not-found' }>;
type RenderOptions = { onNavigate: (path: string) => void; rerender: () => void; onStatus?: (online: boolean, error: string) => void };
type AnswerState = { answer: string; submitted: boolean; correct: boolean };
type LoadState = { loading: boolean; error: string; materials: LearningMaterialSummary[]; key: string };
type DetailState = { loading: boolean; error: string };

const practiceAnswers = new Map<string, AnswerState>();
const quizAnswers = new Map<string, AnswerState>();
const detailCache = new Map<string, GrammarLesson>();
const detailStates = new Map<string, DetailState>();
const progressSaving = new Set<string>();
const progressErrors = new Map<string, string>();
let summaryState: LoadState = { loading: false, error: '', materials: [], key: '' };
let topicSearch = '';
let topicLevel = 'all';
let topicFamily = 'all';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]!));
}

function routeButton(path: string, label: string, className = 'learning-material-back') {
  return `<button type="button" class="${className}" data-learning-material-path="${escapeHtml(path)}">${escapeHtml(label)}</button>`;
}

function breadcrumb(parts: { label: string; path?: string }[]) {
  return `<nav class="learning-material-breadcrumb" aria-label="Learning material breadcrumb">${parts.map((part, index) => `${index ? '<span aria-hidden="true">/</span>' : ''}${part.path ? `<button type="button" data-learning-material-path="${escapeHtml(part.path)}">${escapeHtml(part.label)}</button>` : `<strong>${escapeHtml(part.label)}</strong>`}`).join('')}</nav>`;
}

function heading(eyebrow: string, title: string, subheading: string, connection = 'POSTGRESQL CATALOG') {
  return `<div class="page-heading learning-material-heading"><div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1><p class="subheading">${escapeHtml(subheading)}</p></div><div class="connection"><span class="status-dot"></span><span>${escapeHtml(connection)}</span></div></div>`;
}

function cacheKey(filters: { subjectId?: string; categoryId?: string; level?: string }) {
  return `${filters.subjectId ?? ''}|${filters.categoryId ?? ''}|${filters.level ?? ''}`;
}

function routeNeedsSummary(route: LearningMaterialRoute) {
  return route.kind === 'learning-subjects' || route.kind === 'learning-categories' || route.kind === 'grammar-topics';
}

export function ensureLearningMaterialData(route: LearningMaterialRoute, rerender: () => void) {
  if (route.kind === 'not-found') return;
  if (route.kind === 'grammar-lesson') {
    const state = detailStates.get(route.topicId);
    if (detailCache.has(route.topicId) || state?.loading) return;
    detailStates.set(route.topicId, { loading: true, error: '' });
    void fetchLearningMaterialDetail(route.topicId).then((lesson) => {
      detailCache.set(route.topicId, lesson);
      detailStates.set(route.topicId, { loading: false, error: '' });
      rerender();
    }).catch((error) => {
      detailStates.set(route.topicId, { loading: false, error: error instanceof Error ? error.message : 'Material belum dapat dimuat.' });
      rerender();
    });
    return;
  }
  const filters = route.kind === 'grammar-topics' ? { subjectId: route.subjectId, categoryId: route.categoryId } : route.kind === 'learning-categories' ? { subjectId: route.subjectId } : {};
  const key = cacheKey(filters);
  if (summaryState.key === key && (summaryState.loading || summaryState.materials.length || summaryState.error)) return;
  summaryState = { loading: true, error: '', materials: [], key };
  void fetchLearningMaterialSummaries(filters).then((materials) => {
    summaryState = { loading: false, error: '', materials, key };
    rerender();
  }).catch((error) => {
    summaryState = { loading: false, error: error instanceof Error ? error.message : 'Catalogue belum dapat dimuat.', materials: [], key };
    rerender();
  });
}

function loadingState(label = 'Memuat katalog dari PostgreSQL…') {
  return `<div class="learning-materials">${heading('LEARNING MATERIALS', 'Memuat material', 'Menyiapkan ringkasan materi tanpa memblokir Learning Journal.', 'LOADING')}<div class="learning-material-loading" role="status" aria-live="polite"><span class="learning-material-spinner" aria-hidden="true"></span><strong>${escapeHtml(label)}</strong><small>Progress learner akan dimuat bersama metadata yang relevan.</small></div></div>`;
}

function errorState(error: string, retryPath = '/learning/materials') {
  return `<div class="learning-materials">${heading('LEARNING MATERIALS', 'Catalogue belum tersedia', 'Terjadi masalah saat membaca material runtime dari PostgreSQL.', 'API ERROR')}<article class="learning-material-error-state" role="alert"><span class="material-kicker">RETRY SAFE</span><h2>${escapeHtml(error)}</h2><p>Learning Journal tetap terpisah dan tidak ikut terpengaruh. Coba muat ulang catalogue.</p>${routeButton(retryPath, 'Coba lagi', 'feature-button primary')}</article></div>`;
}

function emptyState(title: string, description: string) {
  return `<div class="learning-material-empty large"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></div>`;
}

function progressLabel(summary: LearningMaterialSummary) {
  if (summary.coverageMode === 'awareness') return '<span class="topic-status awareness">Awareness</span>';
  if (summary.progress?.status === 'mastered') return '<span class="topic-status mastered">Mastered</span>';
  if (summary.progress?.status === 'in_progress') return '<span class="topic-status progress">In progress</span>';
  if (summary.reviewDue) return '<span class="topic-status due">Review due</span>';
  return '<span class="topic-status available">Available</span>';
}

function renderSubjectList() {
  if (summaryState.loading) return loadingState();
  if (summaryState.error) return errorState(summaryState.error);
  const materials = summaryState.materials;
  const levels = new Set(materials.map((material) => material.level));
  const topics = new Set(materials.map((material) => material.topicId));
  return `<div class="learning-materials">${heading('LEARNING MATERIALS', 'Learning Material List', 'Catalogue English Grammar dikelola sebagai content terpublikasi dari PostgreSQL dengan level dan progress learner.')}${breadcrumb([{ label: 'Learning', path: '/learning' }, { label: 'Materials' }])}<div class="learning-material-grid"><button type="button" class="learning-material-card" data-learning-material-path="/learning/materials/english"><div class="learning-material-card-top"><div><span class="material-kicker">SUBJECT 01 · ${materials.length} PUBLISHED LESSONS</span><h2>English</h2><p>Grammar path with ${topics.size} topic families and ${levels.size} CEFR levels represented in the runtime catalogue.</p></div><span class="material-arrow" aria-hidden="true">↗</span></div><div class="material-meta"><span class="material-chip">1 category</span><span class="material-chip neutral">${levels.size} levels</span><span class="material-chip neutral">Learner progress saved</span></div></button></div></div>`;
}

function renderCategoryList(subjectId: string) {
  if (subjectId !== 'english') return renderNotFound(`/learning/materials/${subjectId}`);
  if (summaryState.loading) return loadingState();
  if (summaryState.error) return errorState(summaryState.error, `/learning/materials/${subjectId}`);
  const materials = summaryState.materials;
  const topics = new Set(materials.map((material) => material.topicId));
  const levels = [...new Set(materials.map((material) => material.level))].join(' → ');
  return `<div class="learning-materials">${heading('ENGLISH PATH', 'English', 'Pilih category untuk melihat topic family dan lesson yang sudah terpublikasi.')}${breadcrumb([{ label: 'Learning', path: '/learning' }, { label: 'Materials', path: '/learning/materials' }, { label: 'English' }])}<div class="learning-material-grid"><button type="button" class="learning-material-card" data-learning-material-path="/learning/materials/english/grammar"><div class="learning-material-card-top"><div><span class="material-kicker">CATEGORY 01 · ${materials.length} LESSONS</span><h2>Grammar</h2><p>${topics.size} topic families are represented in the current publication batch. Planned cells stay out of empty lesson pages until content is ready.</p></div><span class="material-arrow" aria-hidden="true">↗</span></div><div class="material-meta"><span class="material-chip">${topics.size} topics</span><span class="material-chip neutral">${escapeHtml(levels)}</span></div></button></div></div>`;
}

function renderTopicCard(material: LearningMaterialSummary) {
  const prerequisiteMarkup = material.prerequisites.length ? material.prerequisites.slice(0, 3).map((prerequisite) => `<span>${escapeHtml(prerequisite)}</span>`).join('') : '<span>None listed</span>';
  const progress = material.progress?.masteryScore !== undefined ? `<span>${material.progress.masteryScore}%</span>` : '';
  return `<article class="learning-topic-card ${material.progress?.status === 'mastered' ? 'mastered' : ''}"><div><div class="material-meta"><span class="material-chip">${escapeHtml(material.level)}</span><span>${material.estimatedMinutes} min</span><span>Sequence ${material.sequence}</span>${progress}</div><div class="topic-title-row"><h2>${escapeHtml(material.title)}</h2>${progressLabel(material)}</div><p>${escapeHtml(material.summary)}</p><div class="topic-prerequisites"><span>Prerequisites</span>${prerequisiteMarkup}</div><div class="topic-availability">${material.reviewDue ? 'Review is due for this material.' : material.progress?.status === 'mastered' ? 'Mastery snapshot saved for this learner.' : 'Published runtime content · prerequisite links are informative for now.'}</div></div>${routeButton(`/learning/materials/${encodeURIComponent(material.subjectId)}/${encodeURIComponent(material.categoryId)}/${encodeURIComponent(material.id)}`, 'Open lesson', 'topic-open')}</article>`;
}

function renderTopicList(subjectId: string, categoryId: string) {
  if (subjectId !== 'english' || categoryId !== 'grammar') return renderNotFound(`/learning/materials/${subjectId}/${categoryId}`);
  if (summaryState.loading) return loadingState();
  if (summaryState.error) return errorState(summaryState.error, `/learning/materials/${subjectId}/${categoryId}`);
  const materials = summaryState.materials.filter((material) => {
    const haystack = `${material.title} ${material.summary} ${material.level} ${material.topicTitle}`.toLowerCase();
    return haystack.includes(topicSearch.toLowerCase()) && (topicLevel === 'all' || material.level === topicLevel) && (topicFamily === 'all' || material.topicId === topicFamily);
  });
  const allTopics = [...new Map(summaryState.materials.map((material) => [material.topicId, material.topicTitle])).entries()];
  const levels = [...new Set(summaryState.materials.map((material) => material.level))];
  return `<div class="learning-materials">${heading('ENGLISH · GRAMMAR', 'Grammar topics', 'Filter published lessons by CEFR or topic family. Content is read from the database; planned cells remain hidden until published.')}${breadcrumb([{ label: 'Learning', path: '/learning' }, { label: 'Materials', path: '/learning/materials' }, { label: 'English', path: '/learning/materials/english' }, { label: 'Grammar' }])}<div class="learning-topic-toolbar"><label class="topic-filter-search">Search topics<input type="search" data-learning-topic-search placeholder="Try: conditionals" value="${escapeHtml(topicSearch)}" /></label><label>Level<select data-learning-topic-level><option value="all" ${topicLevel === 'all' ? 'selected' : ''}>All levels</option>${levels.map((level) => `<option value="${escapeHtml(level)}" ${topicLevel === level ? 'selected' : ''}>${escapeHtml(level)}</option>`).join('')}</select></label><label>Topic family<select data-learning-topic-family><option value="all" ${topicFamily === 'all' ? 'selected' : ''}>All families</option>${allTopics.map(([id, title]) => `<option value="${escapeHtml(id)}" ${topicFamily === id ? 'selected' : ''}>${escapeHtml(title)}</option>`).join('')}</select></label><span class="learning-topic-count">${materials.length} of ${summaryState.materials.length} published lessons</span></div><div class="learning-topic-list">${materials.length ? materials.map(renderTopicCard).join('') : emptyState('No published lessons match', 'Coba ubah filter atau kembali setelah batch konten berikutnya dipublikasikan.')}</div></div>`;
}

function itemKey(kind: 'practice' | 'quiz', lessonId: string, itemId: string) { return `${kind}:${lessonId}:${itemId}`; }
function normalizeAnswer(value: string) { return value.trim().toLowerCase().replace(/\s+/g, ' '); }
function responseState(kind: 'practice' | 'quiz', lessonId: string, itemId: string) { return (kind === 'practice' ? practiceAnswers : quizAnswers).get(itemKey(kind, lessonId, itemId)); }

function renderResponseControl(kind: 'practice' | 'quiz', lesson: GrammarLesson, item: LessonItem & Partial<{ objectiveIndex: number }>, number: number) {
  const state = responseState(kind, lesson.id, item.id);
  const typeLabel = item.type.replace('_', ' ');
  const answerField = item.type === 'multiple_choice'
    ? `<fieldset><legend>${escapeHtml(item.prompt)}</legend>${item.options!.map((option) => `<label class="choice"><input type="radio" name="answer" value="${escapeHtml(option)}" ${state?.answer === option ? 'checked' : ''} required /><span>${escapeHtml(option)}</span></label>`).join('')}</fieldset>`
    : item.type === 'rewrite'
      ? `<label for="${kind}-${escapeHtml(item.id)}">${escapeHtml(item.prompt)}<textarea id="${kind}-${escapeHtml(item.id)}" name="answer" rows="3" required>${state && !state.submitted ? escapeHtml(state.answer) : ''}</textarea></label>`
      : `<label for="${kind}-${escapeHtml(item.id)}">${escapeHtml(item.prompt)}<input id="${kind}-${escapeHtml(item.id)}" type="text" name="answer" value="${state && !state.submitted ? escapeHtml(state.answer) : ''}" required /></label>`;
  const feedback = state?.submitted ? `<div class="learning-feedback ${state.correct ? 'correct' : 'incorrect'}" role="status" tabindex="-1"><strong>${state.correct ? 'Correct' : 'Try again'}</strong><p>${escapeHtml(item.explanation)}</p><span class="learning-answer-reveal">Expected answer: ${escapeHtml(item.answer)}</span></div>` : '';
  return `<form class="learning-item-form" data-learning-${kind}-submit data-lesson-id="${escapeHtml(lesson.id)}" data-item-id="${escapeHtml(item.id)}"><div class="learning-item-header"><strong>${kind === 'quiz' ? `Check ${number}` : `Practice ${number}`}</strong><span>${escapeHtml(typeLabel)}</span></div>${answerField}<button type="submit" class="learning-item-submit">${state?.submitted ? 'Check again' : 'Check answer'}</button>${feedback}</form>`;
}

function quizSummary(lesson: GrammarLesson) {
  const submitted = lesson.quiz.map((item) => responseState('quiz', lesson.id, item.id)).filter((state): state is AnswerState => Boolean(state?.submitted));
  const correct = submitted.filter((state) => state.correct).length;
  const score = submitted.length ? Math.round((correct / lesson.quiz.length) * 100) : lesson.progress?.masteryScore ?? null;
  const covered = new Set(lesson.quiz.filter((item) => responseState('quiz', lesson.id, item.id)?.correct).map((item) => item.objectiveIndex));
  const allRequiredCovered = lesson.mastery.requiredObjectiveIndexes.every((index) => covered.has(index) || lesson.progress?.objectiveState[String(index)] === true);
  const mastered = lesson.progress?.status === 'mastered' || (submitted.length === lesson.quiz.length && (score ?? 0) >= lesson.mastery.minimumScorePercent && allRequiredCovered);
  return { submitted: submitted.length, score, covered, mastered, allRequiredCovered };
}

function renderMastery(lesson: GrammarLesson) {
  const summary = quizSummary(lesson);
  const score = summary.score === null ? '—' : `${summary.score}%`;
  const persisted = lesson.progress?.status === 'mastered' ? `Saved to PostgreSQL${lesson.progress.nextReviewAt ? ` · next review ${new Date(lesson.progress.nextReviewAt).toLocaleDateString('id-ID')}` : ''}.` : lesson.progress ? `Progress saved after ${lesson.progress.attemptCount} check${lesson.progress.attemptCount === 1 ? '' : 's'}.` : 'Submit the checks to save a validated progress snapshot.';
  const description = summary.mastered ? `Mastery threshold reached. ${persisted}` : summary.submitted === lesson.quiz.length ? `Belum mencapai rule ${lesson.mastery.minimumScorePercent}% dengan semua objective terwakili. ${persisted}` : `Jawab semua check untuk melihat mastery rule objective-aware. ${persisted}`;
  const saving = progressSaving.has(lesson.id) ? '<span class="learning-progress-saving">Saving…</span>' : '';
  const error = progressErrors.get(lesson.id);
  return `<aside class="mastery-panel ${summary.mastered ? 'saved' : ''}" aria-live="polite"><div class="mastery-score"><span>Score</span><strong>${score}</strong></div><div><h3>${summary.mastered ? 'Mastery saved' : 'Mastery check'}</h3><p>${escapeHtml(description)} ${summary.submitted}/${lesson.quiz.length} items checked. ${saving}</p>${error ? `<small class="learning-progress-error">${escapeHtml(error)}</small>` : ''}<div class="mastery-objectives">${lesson.mastery.requiredObjectiveIndexes.map((index) => `<span class="${summary.covered.has(index) || lesson.progress?.objectiveState[String(index)] ? 'covered' : ''}">Objective ${index + 1} ${summary.covered.has(index) || lesson.progress?.objectiveState[String(index)] ? '✓' : '·'}</span>`).join('')}</div></div></aside>`;
}

function renderLesson(lesson: GrammarLesson) {
  const status = lesson.progress?.status === 'mastered' ? '<span class="material-chip success">Mastered</span>' : lesson.progress?.status === 'in_progress' ? '<span class="material-chip">In progress</span>' : '';
  return `<div class="learning-materials lesson-shell">${breadcrumb([{ label: 'Learning', path: '/learning' }, { label: 'Materials', path: '/learning/materials' }, { label: lesson.subjectTitle, path: '/learning/materials/english' }, { label: lesson.categoryTitle, path: '/learning/materials/english/grammar' }, { label: lesson.title }])}<section class="lesson-hero"><div><div class="material-meta"><span class="material-chip">${escapeHtml(lesson.level)}</span><span>Topic ${lesson.sequence}</span><span>Content v${lesson.contentVersion}</span>${status}</div><h1>${escapeHtml(lesson.title)}</h1><p>${escapeHtml(lesson.summary)}</p></div><div class="lesson-stats"><div class="lesson-stat"><span>Time</span><strong>${lesson.estimatedMinutes}m</strong></div><div class="lesson-stat"><span>Checks</span><strong>${lesson.quiz.length}</strong></div><div class="lesson-stat"><span>Review</span><strong>${lesson.review.suggestedReviewAfterDays.length}</strong></div></div></section><section class="lesson-section" aria-labelledby="concept-heading"><div class="lesson-section-heading"><div><p class="eyebrow">MEANING FIRST</p><h2 id="concept-heading">Concept</h2></div><p>Start with the viewpoint</p></div><div class="concept-grid"><article class="concept-card"><strong>Core idea</strong><p>${escapeHtml(lesson.concept.summary)}</p></article><article class="concept-card"><strong>Contrast</strong><p>${escapeHtml(lesson.concept.contrast)}</p></article></div></section><section class="lesson-section" aria-labelledby="rules-heading"><div class="lesson-section-heading"><div><p class="eyebrow">FORM · PATTERN · USE</p><h2 id="rules-heading">Rules and patterns</h2></div></div><div class="lesson-explanation-grid">${lesson.rules.map((rule) => `<article class="explanation-card"><h3>${escapeHtml(rule.label)}</h3>${rule.pattern ? `<code>${escapeHtml(rule.pattern)}</code>` : ''}<p>${escapeHtml(rule.explanation)}</p></article>`).join('')}</div></section><section class="lesson-section" aria-labelledby="explanation-heading"><div class="lesson-section-heading"><div><p class="eyebrow">FORM · MEANING · USE</p><h2 id="explanation-heading">Explanation</h2></div></div><div class="lesson-explanation-grid">${lesson.explanation.map((part) => `<article class="explanation-card"><h3>${escapeHtml(part.heading)}</h3><p>${escapeHtml(part.body)}</p></article>`).join('')}</div></section><section class="lesson-section" aria-labelledby="examples-heading"><div class="lesson-section-heading"><div><p class="eyebrow">SEE IT IN CONTEXT</p><h2 id="examples-heading">Examples</h2></div><p>${lesson.examples.length} varied examples</p></div><div class="lesson-examples-grid">${lesson.examples.map((example) => `<article class="lesson-example"><p>${escapeHtml(example.sentence)}</p><span>${escapeHtml(example.note)}</span><div>${example.tags.map((tag) => `<small>${escapeHtml(tag)}</small>`).join('')}</div></article>`).join('')}</div></section><section class="lesson-section" aria-labelledby="mistakes-heading"><div class="lesson-section-heading"><div><p class="eyebrow">WATCH THE CONTRAST</p><h2 id="mistakes-heading">Common mistakes</h2></div></div><div class="learning-mistakes-grid">${lesson.commonMistakes.map((mistake) => `<article class="learning-mistake"><del>${escapeHtml(mistake.incorrect)}</del><strong>${escapeHtml(mistake.correct)}</strong><p>${escapeHtml(mistake.explanation)}</p></article>`).join('')}</div></section><section class="lesson-section" aria-labelledby="practice-heading"><div class="lesson-section-heading"><div><p class="eyebrow">CONTROLLED PRACTICE</p><h2 id="practice-heading">Practice</h2></div></div><div class="learning-items-grid">${lesson.practice.map((item, index) => renderResponseControl('practice', lesson, item, index + 1)).join('')}</div></section><section class="lesson-section" aria-labelledby="quiz-heading"><div class="lesson-section-heading"><div><p class="eyebrow">CHECK UNDERSTANDING</p><h2 id="quiz-heading">Mastery check</h2></div></div><div class="learning-items-grid">${lesson.quiz.map((item, index) => renderResponseControl('quiz', lesson, item, index + 1)).join('')}</div>${renderMastery(lesson)}</section><section class="lesson-section" aria-labelledby="review-heading"><div class="lesson-section-heading"><div><p class="eyebrow">RETURN LATER</p><h2 id="review-heading">Review</h2></div><p>Suggested days: ${lesson.review.suggestedReviewAfterDays.join(' · ')}</p></div><div class="review-grid"><div><h3>Key takeaways</h3><ul>${lesson.review.keyTakeaways.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div><div><h3>Retrieval prompts</h3><ul>${lesson.review.reviewPrompts.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div></div></section></div>`;
}

function renderNotFound(path: string) {
  return `<div class="learning-materials">${heading('LEARNING MATERIALS', 'Material tidak ditemukan', 'Route ini tidak cocok dengan material published yang tersedia di PostgreSQL.', 'NOT FOUND')}${breadcrumb([{ label: 'Learning', path: '/learning' }, { label: 'Materials', path: '/learning/materials' }, { label: 'Not found' }])}<article class="learning-material-not-found" role="alert"><span class="material-kicker">404 · DATABASE CATALOGUE</span><h1>Route tidak tersedia</h1><p>Alamat <code>${escapeHtml(path)}</code> belum memiliki lesson published. Planned cells tidak membuka halaman kosong.</p><div>${routeButton('/learning/materials', 'Kembali ke Learning Material List')} ${routeButton('/learning', 'Buka Learning Journal')}</div></article></div>`;
}

export function renderLearningMaterials(route: LearningMaterialRoute) {
  if (route.kind === 'not-found') return renderNotFound(route.path);
  if (route.kind === 'learning-subjects') return renderSubjectList();
  if (route.kind === 'learning-categories') return renderCategoryList(route.subjectId);
  if (route.kind === 'grammar-topics') return renderTopicList(route.subjectId, route.categoryId);
  const state = detailStates.get(route.topicId);
  if (state?.loading || !detailCache.has(route.topicId)) return loadingState('Memuat lesson detail dari PostgreSQL…');
  if (state?.error) return errorState(state.error, `/learning/materials/${route.subjectId}/${route.categoryId}`);
  return renderLesson(detailCache.get(route.topicId)!);
}

async function persistProgress(lesson: GrammarLesson, options: RenderOptions) {
  if (progressSaving.has(lesson.id)) return;
  const submitted = lesson.quiz.map((item) => responseState('quiz', lesson.id, item.id)).filter((state): state is AnswerState => Boolean(state?.submitted));
  if (!submitted.length) return;
  const correct = submitted.filter((state) => state.correct).length;
  const score = Math.round((correct / lesson.quiz.length) * 100);
  const objectiveState: Record<string, boolean> = {};
  lesson.quiz.forEach((item) => {
    const state = responseState('quiz', lesson.id, item.id);
    if (state?.submitted) objectiveState[String(item.objectiveIndex)] = state.correct;
  });
  const mastered = submitted.length === lesson.quiz.length && score >= lesson.mastery.minimumScorePercent && lesson.mastery.requiredObjectiveIndexes.every((index) => objectiveState[String(index)] === true);
  const reviewedAt = new Date();
  const reviewDays = mastered ? lesson.review.suggestedReviewAfterDays[0] ?? 1 : 1;
  const nextReview = new Date(reviewedAt.getTime() + reviewDays * 24 * 60 * 60 * 1000);
  progressSaving.add(lesson.id);
  progressErrors.delete(lesson.id);
  options.rerender();
  try {
    const progress = await api.learningMaterialProgress(lesson.id, { materialId: lesson.id, contentVersion: lesson.contentVersion, status: mastered ? 'mastered' : 'in_progress', masteryScore: score, objectiveState, attemptCount: (lesson.progress?.attemptCount ?? 0) + 1, lastReviewedAt: reviewedAt.toISOString(), nextReviewAt: nextReview.toISOString() });
    detailCache.set(lesson.id, { ...lesson, progress });
    summaryState = { ...summaryState, materials: summaryState.materials.map((material) => material.id === progress.materialId ? { ...material, progress, reviewDue: false } : material) };
    options.onStatus?.(true, '');
  } catch (error) {
    progressErrors.set(lesson.id, error instanceof ApiError && error.status === 409 ? 'Content berubah. Muat ulang lesson sebelum menyimpan progress.' : error instanceof Error ? error.message : 'Progress belum dapat disimpan.');
    options.onStatus?.(false, progressErrors.get(lesson.id)!);
  } finally {
    progressSaving.delete(lesson.id);
    options.rerender();
  }
}

function submitAnswer(kind: 'practice' | 'quiz', form: HTMLFormElement, options: RenderOptions) {
  const lesson = detailCache.get(form.dataset.lessonId ?? '');
  const item = lesson && (kind === 'practice' ? lesson.practice : lesson.quiz).find((candidate) => candidate.id === form.dataset.itemId);
  if (!lesson || !item) return;
  const answer = String(new FormData(form).get('answer') ?? '');
  const correct = normalizeAnswer(answer) === normalizeAnswer(item.answer);
  (kind === 'practice' ? practiceAnswers : quizAnswers).set(itemKey(kind, lesson.id, item.id), { answer, submitted: true, correct });
  options.rerender();
  if (kind === 'quiz') void persistProgress(lesson, options);
  requestAnimationFrame(() => [...document.querySelectorAll<HTMLFormElement>(`[data-learning-${kind}-submit]`)].find((candidate) => candidate.dataset.itemId === item.id)?.querySelector<HTMLElement>('[role="status"]')?.focus());
}

export function bindLearningMaterialsEvents(options: RenderOptions) {
  document.querySelectorAll<HTMLButtonElement>('[data-learning-material-path]').forEach((button) => button.addEventListener('click', () => options.onNavigate(button.dataset.learningMaterialPath ?? '/learning/materials')));
  document.querySelector<HTMLInputElement>('[data-learning-topic-search]')?.addEventListener('input', (event) => { topicSearch = (event.target as HTMLInputElement).value; options.rerender(); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-learning-topic-search]')?.focus()); });
  document.querySelector<HTMLSelectElement>('[data-learning-topic-level]')?.addEventListener('change', (event) => { topicLevel = (event.target as HTMLSelectElement).value; options.rerender(); });
  document.querySelector<HTMLSelectElement>('[data-learning-topic-family]')?.addEventListener('change', (event) => { topicFamily = (event.target as HTMLSelectElement).value; options.rerender(); });
  document.querySelectorAll<HTMLFormElement>('[data-learning-practice-submit]').forEach((form) => form.addEventListener('submit', (event) => { event.preventDefault(); submitAnswer('practice', form, options); }));
  document.querySelectorAll<HTMLFormElement>('[data-learning-quiz-submit]').forEach((form) => form.addEventListener('submit', (event) => { event.preventDefault(); submitAnswer('quiz', form, options); }));
}
