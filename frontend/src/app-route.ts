export type Page = 'overview' | 'activity' | 'settings' | 'profile' | 'changelog' | 'doing' | 'learning' | 'workout' | 'journaling' | 'spending';

export const pagePaths: Record<Page, string> = {
  overview: '/',
  activity: '/activity',
  changelog: '/change-log',
  doing: '/doing',
  learning: '/learning',
  workout: '/workout',
  journaling: '/journaling',
  spending: '/spending',
  profile: '/profile',
  settings: '/settings',
};

export type AppRoute =
  | { kind: 'page'; page: Page }
  | { kind: 'learning-subjects' }
  | { kind: 'learning-categories'; subjectId: string }
  | { kind: 'grammar-topics'; subjectId: string; categoryId: string }
  | { kind: 'grammar-lesson'; subjectId: string; categoryId: string; topicId: string }
  | { kind: 'workout-material-categories' }
  | { kind: 'workout-material-list'; categoryId: string }
  | { kind: 'workout-material-detail'; categoryId: string; movementId: string }
  | { kind: 'not-found'; path: string; parentPage: Page };

export type LearningMaterialRoute = Extract<AppRoute, { kind: 'learning-subjects' | 'learning-categories' | 'grammar-topics' | 'grammar-lesson' | 'not-found' }>;
export type WorkoutMaterialRoute = Extract<AppRoute, { kind: 'workout-material-categories' | 'workout-material-list' | 'workout-material-detail' | 'not-found' }>;

function normalizePath(pathname: string) {
  const path = pathname.split('?')[0] || '/';
  if (path === '/') return path;
  return path.replace(/\/+$/, '') || '/';
}

function notFound(path: string): AppRoute {
  const parentPage = path === '/learning' || path.startsWith('/learning/') ? 'learning' : path === '/workout' || path.startsWith('/workout/') ? 'workout' : 'overview';
  return { kind: 'not-found', path, parentPage };
}

export function resolveAppRoute(pathname: string): AppRoute {
  const path = normalizePath(pathname);
  const page = (Object.entries(pagePaths).find(([, routePath]) => routePath === path)?.[0] as Page | undefined);
  if (page) return { kind: 'page', page };

  const segments = path.split('/').filter(Boolean);
  if (segments[0] === 'workout' && segments[1] === 'materials') {
    if (segments.length === 2) return { kind: 'workout-material-categories' };
    if (segments.length === 3) return { kind: 'workout-material-list', categoryId: segments[2] };
    if (segments.length === 4) return { kind: 'workout-material-detail', categoryId: segments[2], movementId: segments[3] };
    return notFound(path);
  }
  if (segments[0] !== 'learning' || segments[1] !== 'materials') return notFound(path);
  if (segments.length === 2) return { kind: 'learning-subjects' };
  if (segments.length === 3) return { kind: 'learning-categories', subjectId: segments[2] };
  if (segments.length === 4) return { kind: 'grammar-topics', subjectId: segments[2], categoryId: segments[3] };
  if (segments.length === 5) return { kind: 'grammar-lesson', subjectId: segments[2], categoryId: segments[3], topicId: segments[4] };
  return notFound(path);
}

export function pageForRoute(route: AppRoute): Page {
  if (route.kind === 'page') return route.page;
  if (route.kind === 'not-found') return route.parentPage;
  if (route.kind === 'workout-material-categories' || route.kind === 'workout-material-list' || route.kind === 'workout-material-detail') return 'workout';
  return 'learning';
}

export function isLearningRoute(route: AppRoute): route is LearningMaterialRoute {
  return pageForRoute(route) === 'learning';
}

export function isLearningMaterialRoute(route: AppRoute): route is LearningMaterialRoute {
  return route.kind === 'learning-subjects' || route.kind === 'learning-categories' || route.kind === 'grammar-topics' || route.kind === 'grammar-lesson' || (route.kind === 'not-found' && route.parentPage === 'learning');
}

export function isWorkoutMaterialsRoute(route: AppRoute): route is WorkoutMaterialRoute {
  return route.kind === 'workout-material-categories' || route.kind === 'workout-material-list' || route.kind === 'workout-material-detail' || (route.kind === 'not-found' && route.parentPage === 'workout');
}

export function appRoutePath(route: Exclude<AppRoute, { kind: 'not-found' }>) {
  if (route.kind === 'page') return pagePaths[route.page];
  if (route.kind === 'learning-subjects') return '/learning/materials';
  if (route.kind === 'learning-categories') return `/learning/materials/${encodeURIComponent(route.subjectId)}`;
  if (route.kind === 'grammar-topics') return `/learning/materials/${encodeURIComponent(route.subjectId)}/${encodeURIComponent(route.categoryId)}`;
  if (route.kind === 'grammar-lesson') return `/learning/materials/${encodeURIComponent(route.subjectId)}/${encodeURIComponent(route.categoryId)}/${encodeURIComponent(route.topicId)}`;
  if (route.kind === 'workout-material-categories') return '/workout/materials';
  if (route.kind === 'workout-material-list') return `/workout/materials/${encodeURIComponent(route.categoryId)}`;
  return `/workout/materials/${encodeURIComponent(route.categoryId)}/${encodeURIComponent(route.movementId)}`;
}
