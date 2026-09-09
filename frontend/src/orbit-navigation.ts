export type OrbitRole = 'admin' | 'user';
export type OrbitPermission = 'all' | 'admin';

export type OrbitDestination = {
  id: string;
  label: string;
  icon: string;
  route: string;
  activeLabel?: string;
  match?: 'exact' | 'prefix';
  permission?: OrbitPermission;
};

export type OrbitNavigationItem = OrbitDestination & {
  children?: OrbitDestination[];
};

export type ActiveOrbitLocation = {
  item: OrbitNavigationItem;
  destination: OrbitDestination;
  label: string;
};

export type OrbitSegmentGeometry = {
  angle: number;
  labelX: number;
  labelY: number;
  points: Array<{ x: number; y: number }>;
  path: string;
  clip: string;
  innerWidth: number;
  outerWidth: number;
};

export type OrbitTriggerDock = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
type Rect = { left: number; right: number; top: number; bottom: number };
type Viewport = { width: number; height: number };
type Size = { width: number; height: number };

export function chooseOrbitTriggerDock(viewport: Viewport, trigger: Size, avoidRects: Rect[]): OrbitTriggerDock {
  const sideInset = 24;
  const bottomInset = viewport.width <= 560 ? 16 : 24;
  const topInset = 76;
  const docks: Array<[OrbitTriggerDock, Rect]> = [
    ['bottom-right', { left: viewport.width - sideInset - trigger.width, right: viewport.width - sideInset, top: viewport.height - bottomInset - trigger.height, bottom: viewport.height - bottomInset }],
    ['bottom-left', { left: sideInset, right: sideInset + trigger.width, top: viewport.height - bottomInset - trigger.height, bottom: viewport.height - bottomInset }],
    ['top-right', { left: viewport.width - sideInset - trigger.width, right: viewport.width - sideInset, top: topInset, bottom: topInset + trigger.height }],
    ['top-left', { left: sideInset, right: sideInset + trigger.width, top: topInset, bottom: topInset + trigger.height }],
  ];
  const overlaps = (candidate: Rect, target: Rect) => candidate.left < target.right + 8
    && candidate.right > target.left - 8
    && candidate.top < target.bottom + 8
    && candidate.bottom > target.top - 8;
  return docks.find(([, candidate]) => avoidRects.every((target) => !overlaps(candidate, target)))?.[0] ?? 'top-left';
}

export const orbitNavigation: OrbitNavigationItem[] = [
  { id: 'overview', label: 'Overview', icon: 'squares-four', route: '/', activeLabel: 'Session log' },
  { id: 'activity', label: 'Activity', icon: 'pulse', route: '/activity', activeLabel: 'Audit trail' },
  { id: 'change-log', label: 'Change Log', icon: 'notebook', route: '/change-log', activeLabel: 'Updates' },
  { id: 'doing', label: 'Doing', icon: 'check-square', route: '/doing', activeLabel: 'Planner' },
  {
    id: 'learning', label: 'Learning', icon: 'calendar-dots', route: '/learning', children: [
      { id: 'learning-journal', label: 'Journal', icon: 'calendar-check', route: '/learning' },
      { id: 'learning-materials', label: 'Materials', icon: 'books', route: '/learning/materials', match: 'prefix' },
    ],
  },
  {
    id: 'workout', label: 'Workout', icon: 'barbell', route: '/workout', children: [
      { id: 'workout-planner', label: 'Planner', icon: 'calendar-plus', route: '/workout' },
      { id: 'workout-materials', label: 'Materials', icon: 'list-checks', route: '/workout/materials', match: 'prefix' },
    ],
  },
  {
    id: 'lifestyle', label: 'Lifestyle', icon: 'heartbeat', route: '/journaling', children: [
      { id: 'journaling', label: 'Journaling', icon: 'note-pencil', route: '/journaling' },
      { id: 'spending', label: 'Spending', icon: 'wallet', route: '/spending' },
    ],
  },
  {
    id: 'account', label: 'Account', icon: 'user-circle', route: '/profile', children: [
      { id: 'profile', label: 'Profile', icon: 'identification-card', route: '/profile' },
      { id: 'settings', label: 'Settings', icon: 'sliders-horizontal', route: '/settings', permission: 'admin' },
    ],
  },
];

function isAllowed(permission: OrbitPermission | undefined, role: OrbitRole) {
  return permission !== 'admin' || role === 'admin';
}

function matchesPath(pathname: string, destination: OrbitDestination) {
  const path = (pathname.split('?')[0] || '/').replace(/\/+$/, '') || '/';
  const route = destination.route.replace(/\/+$/, '') || '/';
  return destination.match === 'prefix' ? path === route || path.startsWith(`${route}/`) : path === route;
}

export function visibleOrbitNavigation(role: OrbitRole): OrbitNavigationItem[] {
  return orbitNavigation.flatMap((item) => {
    if (!isAllowed(item.permission, role)) return [];
    const children = item.children?.filter((child) => isAllowed(child.permission, role));
    if (item.children && !children?.length) return [];
    return [{ ...item, children }];
  });
}

export function activeOrbitLocation(pathname: string, role: OrbitRole): ActiveOrbitLocation {
  const items = visibleOrbitNavigation(role);
  for (const item of items) {
    const destinations = item.children ? [...item.children].sort((a, b) => b.route.length - a.route.length) : [item];
    const destination = destinations.find((candidate) => matchesPath(pathname, candidate));
    if (destination) {
      return { item, destination, label: `${item.label} (${destination.activeLabel ?? destination.label})` };
    }
  }
  const fallback = items[0];
  return { item: fallback, destination: fallback, label: `${fallback.label} (${fallback.activeLabel ?? fallback.label})` };
}

export function orbitSegmentGeometry(index: number, count: number): OrbitSegmentGeometry {
  const n = Math.min(8, Math.max(1, count));
  const angle = n === 1 ? 0 : n === 2 ? (index === 0 ? 180 : 0) : (n === 4 ? -45 : -90) + index * 360 / n;
  const radians = angle * Math.PI / 180;
  // Offset both edges of each angular slot by 1.2 units (7.8px gap at 327px).
  // Small counts use compact trapezoids, never stretch into half-disc blobs.
  const half = Math.min(40, 180 / n) * Math.PI / 180;
  const inner = 12;
  const outer = n <= 2 ? 42 : 49 * Math.cos(half);
  const innerHalf = n <= 2 ? 9 : inner * Math.tan(half) - 1.3;
  const outerHalf = n <= 2 ? 15 : outer * Math.tan(half) - 1.3;
  const rotate = (x: number, y: number) => ({x: 50 + x * Math.cos(radians) - y * Math.sin(radians), y: 50 + x * Math.sin(radians) + y * Math.cos(radians)});
  const vertices = [[inner,-innerHalf],[outer,-outerHalf],[outer,outerHalf],[inner,innerHalf]].map(([x,y]) => rotate(x,y));
  const points: Array<{x:number;y:number}> = [];
  const fmt = (p: {x:number;y:number}) => `${p.x.toFixed(5)} ${p.y.toFixed(5)}`;
  let path = '';
  vertices.forEach((v,i) => {
    const prev=vertices[(i+3)%4], next=vertices[(i+1)%4];
    const toward=(p:typeof v) => {const d=Math.hypot(p.x-v.x,p.y-v.y);const t=Math.min(3.2,d/4)/d;return {x:v.x+(p.x-v.x)*t,y:v.y+(p.y-v.y)*t};};
    const a=toward(prev), b=toward(next);
    path += `${i ? 'L' : 'M'} ${fmt(a)} Q ${fmt(v)} ${fmt(b)} `;
    // Sample the same quadratic for the responsive native-button clip/hit area.
    for(let step=0;step<=8;step++) {const t=step/8;points.push({x:(1-t)**2*a.x+2*(1-t)*t*v.x+t*t*b.x,y:(1-t)**2*a.y+2*(1-t)*t*v.y+t*t*b.y});}
  });
  const label = rotate(n <= 2 ? 27 : n <= 4 ? 25 : n === 5 ? 28 : 33,0);
  return {angle,labelX:label.x,labelY:n<=2?50:label.y,points,path:path+'Z',clip:`polygon(${points.map(p=>`${p.x.toFixed(5)}% ${p.y.toFixed(5)}%`).join(',')})`,innerWidth:innerHalf*2,outerWidth:outerHalf*2};
}

export function paginateOrbitItems<T>(items: T[], page: number, pageSize: number) {
  const size = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const currentPage = Math.min(Math.max(0, page), pageCount - 1);
  return {
    items: items.slice(currentPage * size, (currentPage + 1) * size),
    currentPage,
    pageCount,
  };
}
