import manifestJson from './content/workout/mobility/index.json';
import hipSwitchJson from './content/workout/mobility/movements/90-90-hip-switch.json';
import ankleMobilizationJson from './content/workout/mobility/movements/knee-to-wall-ankle-mobilization.json';
import hipFlexorJson from './content/workout/mobility/movements/half-kneeling-hip-flexor-mobilization.json';
import openBookJson from './content/workout/mobility/movements/open-book-thoracic-rotation.json';
import shoulderCarsJson from './content/workout/mobility/movements/shoulder-cars.json';
import deepSquatJson from './content/workout/mobility/movements/deep-squat-pry.json';

export type WorkoutMaterialDifficulty = 'Beginner' | 'Intermediate' | 'Advanced';
export type WorkoutMaterialRecommendation = {
  text: string;
  sets?: number;
  reps?: number;
  durationMinutes?: number;
};
export type WorkoutMaterial = {
  schemaVersion: string;
  contentVersion: number;
  id: string;
  category: 'mobility';
  name: string;
  shortDescription: string;
  equipment: string[];
  bodyAreas: string[];
  primaryTarget: string;
  difficulty?: WorkoutMaterialDifficulty;
  recommendation: WorkoutMaterialRecommendation;
  steps: string[];
  cues: string[];
  safetyNotes?: string[];
};
export type WorkoutMaterialManifestEntry = { id: string; name: string; file: string };
export type WorkoutMaterialManifest = {
  schemaVersion: string;
  contentVersion: number;
  category: { id: 'mobility'; title: string; description: string };
  movements: WorkoutMaterialManifestEntry[];
};
export type WorkoutMaterialCategory = WorkoutMaterialManifest['category'] & { materials: WorkoutMaterial[] };

const supportedDifficulties: WorkoutMaterialDifficulty[] = ['Beginner', 'Intermediate', 'Advanced'];

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Workout content invalid: ${label} must be an object`);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Workout content invalid: ${label} must be a non-empty string`);
  return value;
}

function stringArray(value: unknown, label: string, allowEmpty = false): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`Workout content invalid: ${label} must be an array of strings`);
  }
  return value as string[];
}

function numberValue(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || !Number.isInteger(value)) {
    throw new Error(`Workout content invalid: ${label} must be a non-negative integer`);
  }
  return value;
}

function optionalNumber(value: unknown, label: string) {
  return value === undefined ? undefined : numberValue(value, label);
}

function validateRecommendation(value: unknown, label: string): WorkoutMaterialRecommendation {
  const recommendation = record(value, label);
  const result: WorkoutMaterialRecommendation = { text: stringValue(recommendation.text, `${label}.text`) };
  const sets = optionalNumber(recommendation.sets, `${label}.sets`);
  const reps = optionalNumber(recommendation.reps, `${label}.reps`);
  const durationMinutes = optionalNumber(recommendation.durationMinutes, `${label}.durationMinutes`);
  if (sets !== undefined) result.sets = sets;
  if (reps !== undefined) result.reps = reps;
  if (durationMinutes !== undefined) result.durationMinutes = durationMinutes;
  return result;
}

function validateMaterial(value: unknown, label: string): WorkoutMaterial {
  const entry = record(value, label);
  const difficulty = entry.difficulty === undefined ? undefined : stringValue(entry.difficulty, `${label}.difficulty`) as WorkoutMaterialDifficulty;
  if (difficulty !== undefined && !supportedDifficulties.includes(difficulty)) throw new Error(`Workout content invalid: ${label}.difficulty is unsupported`);
  const material: WorkoutMaterial = {
    schemaVersion: stringValue(entry.schemaVersion, `${label}.schemaVersion`),
    contentVersion: numberValue(entry.contentVersion, `${label}.contentVersion`, 1),
    id: stringValue(entry.id, `${label}.id`),
    category: stringValue(entry.category, `${label}.category`) as WorkoutMaterial['category'],
    name: stringValue(entry.name, `${label}.name`),
    shortDescription: stringValue(entry.shortDescription, `${label}.shortDescription`),
    equipment: stringArray(entry.equipment, `${label}.equipment`, true),
    bodyAreas: stringArray(entry.bodyAreas, `${label}.bodyAreas`),
    primaryTarget: stringValue(entry.primaryTarget, `${label}.primaryTarget`),
    recommendation: validateRecommendation(entry.recommendation, `${label}.recommendation`),
    steps: stringArray(entry.steps, `${label}.steps`),
    cues: stringArray(entry.cues, `${label}.cues`),
  };
  if (difficulty !== undefined) material.difficulty = difficulty;
  if (entry.safetyNotes !== undefined) material.safetyNotes = stringArray(entry.safetyNotes, `${label}.safetyNotes`, true);
  if (material.category !== 'mobility') throw new Error(`Workout content invalid: ${label}.category must be mobility`);
  return material;
}

export function validateWorkoutContent(manifestInput: unknown, materialsInput: unknown[]): { manifest: WorkoutMaterialManifest; materials: WorkoutMaterial[] } {
  const rawManifest = record(manifestInput, 'manifest');
  const rawCategory = record(rawManifest.category, 'manifest.category');
  const manifest: WorkoutMaterialManifest = {
    schemaVersion: stringValue(rawManifest.schemaVersion, 'manifest.schemaVersion'),
    contentVersion: numberValue(rawManifest.contentVersion, 'manifest.contentVersion', 1),
    category: {
      id: stringValue(rawCategory.id, 'manifest.category.id') as 'mobility',
      title: stringValue(rawCategory.title, 'manifest.category.title'),
      description: stringValue(rawCategory.description, 'manifest.category.description'),
    },
    movements: [],
  };
  if (manifest.category.id !== 'mobility') throw new Error('Workout content invalid: only mobility is supported');
  if (!Array.isArray(rawManifest.movements) || rawManifest.movements.length === 0) throw new Error('Workout content invalid: manifest.movements is empty');
  const manifestIds = new Set<string>();
  manifest.movements = rawManifest.movements.map((value, index) => {
    const entry = record(value, `manifest.movements[${index}]`);
    const movement = {
      id: stringValue(entry.id, `manifest.movements[${index}].id`),
      name: stringValue(entry.name, `manifest.movements[${index}].name`),
      file: stringValue(entry.file, `manifest.movements[${index}].file`),
    };
    if (manifestIds.has(movement.id)) throw new Error(`Workout content invalid: duplicate movement id ${movement.id}`);
    manifestIds.add(movement.id);
    return movement;
  });
  if (materialsInput.length !== manifest.movements.length) throw new Error('Workout content invalid: manifest/file count mismatch');
  const materialIds = new Set<string>();
  const materials = materialsInput.map((value, index) => {
    const material = validateMaterial(value, `movement[${index}]`);
    const manifestEntry = manifest.movements[index];
    if (materialIds.has(material.id)) throw new Error(`Workout content invalid: duplicate movement id ${material.id}`);
    if (material.id !== manifestEntry.id || material.name !== manifestEntry.name) throw new Error(`Workout content invalid: manifest/file mismatch for ${manifestEntry.id}`);
    materialIds.add(material.id);
    return material;
  });
  return { manifest, materials };
}

const materialImports: Record<string, unknown> = {
  './movements/90-90-hip-switch.json': hipSwitchJson,
  './movements/knee-to-wall-ankle-mobilization.json': ankleMobilizationJson,
  './movements/half-kneeling-hip-flexor-mobilization.json': hipFlexorJson,
  './movements/open-book-thoracic-rotation.json': openBookJson,
  './movements/shoulder-cars.json': shoulderCarsJson,
  './movements/deep-squat-pry.json': deepSquatJson,
};

const validated = validateWorkoutContent(manifestJson, (manifestJson.movements as WorkoutMaterialManifestEntry[]).map((entry) => {
  const material = materialImports[entry.file];
  if (!material) throw new Error(`Workout content invalid: no imported movement for ${entry.file}`);
  return material;
}));

export const workoutMaterialManifest = validated.manifest;
export const mobilityMaterials = validated.materials.sort((a, b) => workoutMaterialManifest.movements.findIndex((entry) => entry.id === a.id) - workoutMaterialManifest.movements.findIndex((entry) => entry.id === b.id));
export const workoutMaterialCategories: WorkoutMaterialCategory[] = [{ ...workoutMaterialManifest.category, materials: mobilityMaterials }];
export const workoutMaterialMap = new Map(mobilityMaterials.map((material) => [material.id, material]));

export function getWorkoutMaterial(categoryId: string, movementId: string) {
  return categoryId === workoutMaterialManifest.category.id ? workoutMaterialMap.get(movementId) : undefined;
}

export function getWorkoutMaterialCategory(categoryId: string) {
  return workoutMaterialCategories.find((category) => category.id === categoryId);
}
