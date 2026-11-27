import type { IconName } from '../components/ui/Icons';
import type { BusinessRole } from '../features/auth/types';
import { canViewStaff } from '../features/staff/permissions.ts';

export const ROUTES = {
  login: '/login',
  overview: '/',
  businesses: '/businesses',
  locations: '/locations',
  staff: '/staff',
  assistants: '/assistants',
  conversations: '/conversations',
  diagnostics: '/diagnostics',
} as const;

export type AppRoutePath = (typeof ROUTES)[keyof typeof ROUTES];

export interface NavItemConfig {
  path: Exclude<AppRoutePath, '/login'>;
  label: string;
  description: string;
  icon: IconName;
  implemented: boolean;
  section: 'workspace' | 'system';
}

export const DASHBOARD_NAV_ITEMS: readonly NavItemConfig[] = [
  {
    path: ROUTES.overview,
    label: 'Overview',
    description: 'Active workspace summary, role access, and platform module launchpad.',
    icon: 'dashboard',
    implemented: true,
    section: 'workspace',
  },
  {
    path: ROUTES.businesses,
    label: 'Business Profile',
    description: 'Company details, timezone, operating hours, and conversation retention.',
    icon: 'building',
    implemented: true,
    section: 'workspace',
  },
  {
    path: ROUTES.locations,
    label: 'Locations',
    description: 'Branch addresses, per-location timezones, hours, and active status.',
    icon: 'mapPin',
    implemented: true,
    section: 'workspace',
  },
  {
    path: ROUTES.staff,
    label: 'Staff & Access',
    description: 'Owner and operator role permissions and team membership directory.',
    icon: 'users',
    implemented: true,
    section: 'workspace',
  },
  {
    path: ROUTES.assistants,
    label: 'Assistants',
    description: 'Assistant personas, model guardrails, tool scopes, and version publishing.',
    icon: 'bot',
    implemented: true,
    section: 'workspace',
  },
  {
    path: ROUTES.conversations,
    label: 'Playground & Inbox',
    description: 'Staff test sessions, AI turns, operator notes, and conversation lifecycle.',
    icon: 'message',
    implemented: true,
    section: 'workspace',
  },
  {
    path: ROUTES.diagnostics,
    label: 'System Diagnostics',
    description: 'Live API health, database readiness, AI bridge status, and session tokens.',
    icon: 'activity',
    implemented: true,
    section: 'system',
  },
] as const;

export function getVisibleNavItems(role: BusinessRole | null | undefined): readonly NavItemConfig[] {
  return DASHBOARD_NAV_ITEMS.filter((item) => item.path !== ROUTES.staff || canViewStaff(role));
}
