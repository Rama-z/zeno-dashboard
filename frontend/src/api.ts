export type ApiLog = {
  id: number;
  title: string;
  question: string;
  answer: string;
  excerpt: string;
  status: 'success' | 'info';
};

export type OverviewResponse = {
  totalEntries: number;
  visibleEntries: number;
  verifiedOutcomes: number;
  coverage: number;
  entries: ApiLog[];
  generatedAt: string;
  sourceFile: string;
};

export type ActivityEvent = {
  id: string;
  userId?: string;
  actorName: string;
  actorEmail: string;
  actorRole: 'user' | 'admin';
  action: string;
  entityType: string;
  entityId?: string;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  emailVerifiedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type SettingsResponse = {
  workspaceName: string;
  sourceFile: string;
};

export type LearningEntryResponse = {
  id: string;
  ownerUserId?: string;
  date: string;
  title: string;
  note: string;
  category: string;
  completed: boolean;
  createdAt: string;
};

export type DoingEntryResponse = {
  id: string;
  ownerUserId?: string;
  date: string;
  title: string;
  note: string;
  category: string;
  completed: boolean;
  createdAt: string;
};

export type WorkoutEntryResponse = {
  id: string;
  ownerUserId?: string;
  date: string;
  exercise: string;
  category: string;
  sets: number;
  reps: number;
  durationMinutes: number;
  note: string;
  completed: boolean;
  createdAt: string;
};

export type JournalEntryResponse = {
  id: string;
  ownerUserId?: string;
  date: string;
  title: string;
  content: string;
  mood: string;
  tags: string;
  createdAt: string;
  updatedAt: string;
};

export type SpendingEntryResponse = {
  id: string;
  ownerUserId?: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  paymentMethod: string;
  note: string;
  createdAt: string;
};

export type ChangeLogEntryResponse = {
  id: string;
  occurredAt: string;
  title: string;
  description: string;
  category: 'Frontend' | 'Backend' | 'DevOps' | 'Hermes' | 'General';
  createdAt: string;
};

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const csrfToken = document.cookie.split('; ').find((value) => value.startsWith('zeno_csrf='))?.split('=').slice(1).join('=') ?? '';
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(method !== 'GET' && method !== 'HEAD' && csrfToken ? { 'X-CSRF-Token': decodeURIComponent(csrfToken) } : {}), ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (response.status === 401) window.dispatchEvent(new CustomEvent('zeno:unauthorized'));
    throw new ApiError(body.error ?? `API request failed (${response.status})`, response.status);
  }
  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string; service: string; version: string }>('/api/health'),
  register: (entry: { email: string; password: string; displayName: string }) => request<{ message: string }>('/api/auth/register', {
    method: 'POST', body: JSON.stringify(entry),
  }),
  verifyEmail: (token: string) => request<{ message: string; user: AuthUser }>('/api/auth/verify-email', {
    method: 'POST', body: JSON.stringify({ token }),
  }),
  login: (email: string, password: string) => request<{ user: AuthUser }>('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password }),
  }),
  logout: () => request<{ message: string }>('/api/auth/logout', { method: 'POST' }),
  me: () => request<{ user: AuthUser }>('/api/auth/me'),
  updateProfile: (displayName: string) => request<{ user: AuthUser }>('/api/profile', {
    method: 'PUT', body: JSON.stringify({ displayName }),
  }),
  overview: () => request<OverviewResponse>('/api/overview'),
  activity: () => request<{ events: ActivityEvent[] }>('/api/activity'),
  settings: () => request<SettingsResponse>('/api/settings'),
  updateSettings: (workspaceName: string) => request<SettingsResponse>('/api/settings', {
    method: 'PUT', body: JSON.stringify({ workspaceName }),
  }),
  learning: (date = '') => request<{ date: string | null; entries: LearningEntryResponse[] }>(`/api/learning${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  createLearning: (entry: { date: string; title: string; note: string; category: string; completed?: boolean }) => request<LearningEntryResponse>('/api/learning', {
    method: 'POST', body: JSON.stringify(entry),
  }),
  updateLearning: (id: string, entry: { date: string; title: string; note: string; category: string; completed: boolean }) => request<LearningEntryResponse>(`/api/learning/${encodeURIComponent(id)}`, {
    method: 'PUT', body: JSON.stringify(entry),
  }),
  deleteLearning: (id: string, date: string) => request<{ deleted: string; date: string }>(`/api/learning/${encodeURIComponent(id)}?date=${encodeURIComponent(date)}`, {
    method: 'DELETE',
  }),
  doing: (date = '') => request<{ date: string | null; entries: DoingEntryResponse[] }>(`/api/doing${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  createDoing: (entry: Omit<DoingEntryResponse, 'id' | 'createdAt'>) => request<DoingEntryResponse>('/api/doing', {
    method: 'POST', body: JSON.stringify(entry),
  }),
  updateDoing: (id: string, entry: Omit<DoingEntryResponse, 'id' | 'createdAt'>) => request<DoingEntryResponse>(`/api/doing/${encodeURIComponent(id)}`, {
    method: 'PUT', body: JSON.stringify(entry),
  }),
  deleteDoing: (id: string, date: string) => request<{ deleted: string; date: string }>(`/api/doing/${encodeURIComponent(id)}?date=${encodeURIComponent(date)}`, {
    method: 'DELETE',
  }),
  workouts: (date = '') => request<{ date: string | null; entries: WorkoutEntryResponse[] }>(`/api/workouts${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  createWorkout: (entry: Omit<WorkoutEntryResponse, 'id' | 'createdAt'>) => request<WorkoutEntryResponse>('/api/workouts', {
    method: 'POST', body: JSON.stringify(entry),
  }),
  updateWorkout: (id: string, entry: Omit<WorkoutEntryResponse, 'id' | 'createdAt'>) => request<WorkoutEntryResponse>(`/api/workouts/${encodeURIComponent(id)}`, {
    method: 'PUT', body: JSON.stringify(entry),
  }),
  deleteWorkout: (id: string, date: string) => request<{ deleted: string; date: string }>(`/api/workouts/${encodeURIComponent(id)}?date=${encodeURIComponent(date)}`, {
    method: 'DELETE',
  }),
  journals: (date = '') => request<{ date: string | null; entries: JournalEntryResponse[] }>(`/api/journals${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  createJournal: (entry: Omit<JournalEntryResponse, 'id' | 'createdAt' | 'updatedAt'>) => request<JournalEntryResponse>('/api/journals', {
    method: 'POST', body: JSON.stringify(entry),
  }),
  deleteJournal: (id: string) => request<{ deleted: string }>(`/api/journals/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }),
  spending: (date = '') => request<{ date: string | null; entries: SpendingEntryResponse[] }>(`/api/spending${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  createSpending: (entry: Omit<SpendingEntryResponse, 'id' | 'createdAt'>) => request<SpendingEntryResponse>('/api/spending', {
    method: 'POST', body: JSON.stringify(entry),
  }),
  deleteSpending: (id: string) => request<{ deleted: string }>(`/api/spending/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }),
  changeLogs: () => request<{ entries: ChangeLogEntryResponse[] }>('/api/change-logs'),
  createChangeLog: (entry: { id?: string; occurredAt: string; title: string; description: string; category: ChangeLogEntryResponse['category'] }) => request<ChangeLogEntryResponse>('/api/change-logs', {
    method: 'POST', body: JSON.stringify(entry),
  }),
};
