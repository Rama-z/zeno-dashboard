import { api, type LearningMaterialContent, type LearningMaterialDetail, type LearningMaterialLessonItem, type LearningMaterialMastery, type LearningMaterialReview, type LearningMaterialRule } from './api';

export type LessonItemType = 'multiple_choice' | 'fill_blank' | 'rewrite';
export type LessonItem = LearningMaterialLessonItem;
export type LessonExplanation = { heading: string; body: string };
export type LessonExample = { sentence: string; note: string; tags: string[] };
export type GrammarLesson = LearningMaterialDetail & LearningMaterialContent & {
  subject: string;
  category: string;
  rules: LearningMaterialRule[];
  mastery: LearningMaterialMastery;
  review: LearningMaterialReview;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Learning material invalid: ${label} must be an object`);
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Learning material invalid: ${label} must be a non-empty string`);
  return value;
}

function stringArray(value: unknown, label: string, allowEmpty = false): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`Learning material invalid: ${label} must be an array of strings`);
  }
  return value as string[];
}

function numberValue(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || !Number.isInteger(value)) throw new Error(`Learning material invalid: ${label}`);
  return value;
}

function validateItem(value: unknown, label: string, quiz: boolean): LearningMaterialLessonItem & Partial<{ objectiveIndex: number }> {
  const item = record(value, label);
  const type = requiredString(item.type, `${label}.type`) as LessonItemType;
  if (!(['multiple_choice', 'fill_blank', 'rewrite'] as LessonItemType[]).includes(type)) throw new Error(`Learning material invalid: ${label}.type`);
  const result: LearningMaterialLessonItem & Partial<{ objectiveIndex: number }> = {
    id: requiredString(item.id, `${label}.id`),
    type,
    prompt: requiredString(item.prompt, `${label}.prompt`),
    answer: requiredString(item.answer, `${label}.answer`),
    explanation: requiredString(item.explanation, `${label}.explanation`),
  };
  if (type === 'multiple_choice') {
    if (!Array.isArray(item.options) || item.options.length < 2 || item.options.some((option) => typeof option !== 'string' || !option.trim())) throw new Error(`Learning material invalid: ${label}.options`);
    result.options = item.options as string[];
    if (!result.options.includes(result.answer)) throw new Error(`Learning material invalid: ${label}.answer`);
  }
  if (quiz) result.objectiveIndex = numberValue(item.objectiveIndex, `${label}.objectiveIndex`);
  return result;
}

export function validateLearningMaterialContent(value: unknown, label = 'content'): LearningMaterialContent {
  const content = record(value, label);
  const objectives = stringArray(content.objectives, `${label}.objectives`);
  const concept = record(content.concept, `${label}.concept`);
  const rules = Array.isArray(content.rules) ? content.rules.map((value, index) => {
    const rule = record(value, `${label}.rules[${index}]`);
    return { label: requiredString(rule.label, `${label}.rules[${index}].label`), ...(rule.pattern ? { pattern: requiredString(rule.pattern, `${label}.rules[${index}].pattern`) } : {}), explanation: requiredString(rule.explanation, `${label}.rules[${index}].explanation`) };
  }) : [];
  if (!rules.length) throw new Error(`Learning material invalid: ${label}.rules`);
  const explanation = Array.isArray(content.explanation) ? content.explanation.map((value, index) => {
    const part = record(value, `${label}.explanation[${index}]`);
    return { heading: requiredString(part.heading, `${label}.explanation[${index}].heading`), body: requiredString(part.body, `${label}.explanation[${index}].body`) };
  }) : [];
  const examples = Array.isArray(content.examples) ? content.examples.map((value, index) => {
    const example = record(value, `${label}.examples[${index}]`);
    return { sentence: requiredString(example.sentence, `${label}.examples[${index}].sentence`), note: requiredString(example.note, `${label}.examples[${index}].note`), tags: stringArray(example.tags, `${label}.examples[${index}].tags`) };
  }) : [];
  if (examples.length < 5) throw new Error(`Learning material invalid: ${label}.examples needs five examples`);
  const commonMistakes = Array.isArray(content.commonMistakes) ? content.commonMistakes.map((value, index) => {
    const mistake = record(value, `${label}.commonMistakes[${index}]`);
    return { incorrect: requiredString(mistake.incorrect, `${label}.commonMistakes[${index}].incorrect`), correct: requiredString(mistake.correct, `${label}.commonMistakes[${index}].correct`), explanation: requiredString(mistake.explanation, `${label}.commonMistakes[${index}].explanation`) };
  }) : [];
  if (!commonMistakes.length) throw new Error(`Learning material invalid: ${label}.commonMistakes`);
  const practice = Array.isArray(content.practice) ? content.practice.map((value, index) => validateItem(value, `${label}.practice[${index}]`, false)) : [];
  const quiz = Array.isArray(content.quiz) ? content.quiz.map((value, index) => validateItem(value, `${label}.quiz[${index}]`, true) as LearningMaterialContent['quiz'][number]) : [];
  if (!explanation.length || !practice.length || !quiz.length) throw new Error(`Learning material invalid: ${label} needs explanation, practice, and quiz`);
  const itemIds = new Set<string>();
  [...practice, ...quiz].forEach((item) => { if (itemIds.has(item.id)) throw new Error(`Learning material invalid: duplicate exercise ${item.id}`); itemIds.add(item.id); });
  quiz.forEach((item) => { if (item.objectiveIndex >= objectives.length) throw new Error(`Learning material invalid: objective index for ${item.id}`); });
  return {
    objectives,
    concept: { summary: requiredString(concept.summary, `${label}.concept.summary`), contrast: requiredString(concept.contrast, `${label}.concept.contrast`) },
    rules,
    explanation,
    examples,
    commonMistakes,
    practice: practice as LearningMaterialContent['practice'],
    quiz,
  };
}

function validateMastery(value: unknown): LearningMaterialMastery {
  const mastery = record(value, 'mastery');
  if (!Array.isArray(mastery.requiredObjectiveIndexes) || mastery.requiredObjectiveIndexes.length === 0) throw new Error('Learning material invalid: mastery.requiredObjectiveIndexes');
  const required = mastery.requiredObjectiveIndexes.map((index, position) => numberValue(index, `mastery.requiredObjectiveIndexes[${position}]`));
  const minimumScorePercent = numberValue(mastery.minimumScorePercent, 'mastery.minimumScorePercent');
  if (minimumScorePercent > 100) throw new Error('Learning material invalid: mastery threshold');
  return { minimumScorePercent, requiredObjectiveIndexes: required };
}

function validateReview(value: unknown): LearningMaterialReview {
  const review = record(value, 'review');
  if (!Array.isArray(review.suggestedReviewAfterDays) || review.suggestedReviewAfterDays.length === 0) throw new Error('Learning material invalid: review.suggestedReviewAfterDays');
  return {
    keyTakeaways: stringArray(review.keyTakeaways, 'review.keyTakeaways'),
    suggestedReviewAfterDays: review.suggestedReviewAfterDays.map((days, index) => numberValue(days, `review.suggestedReviewAfterDays[${index}]`, 1)),
    reviewPrompts: stringArray(review.reviewPrompts, 'review.reviewPrompts'),
  };
}

export function normalizeLearningMaterialDetail(detail: LearningMaterialDetail): GrammarLesson {
  const content = validateLearningMaterialContent(detail.content);
  const mastery = validateMastery(detail.mastery);
  const review = validateReview(detail.review);
  mastery.requiredObjectiveIndexes.forEach((index) => { if (index >= content.objectives.length) throw new Error(`Learning material invalid: mastery objective ${index}`); });
  return {
    ...detail,
    ...content,
    mastery,
    review,
    subject: detail.subjectId,
    category: detail.categoryId,
  };
}

export async function fetchLearningMaterialSummaries(filters: { subjectId?: string; categoryId?: string; level?: string } = {}) {
  return (await api.learningMaterials(filters)).materials;
}

export async function fetchLearningMaterialDetail(id: string) {
  return normalizeLearningMaterialDetail(await api.learningMaterial(id));
}

export function clearLearningMaterialClientCaches() {
  // The renderer owns its route/detail cache; this hook documents the invalidation boundary for future auth changes.
}
