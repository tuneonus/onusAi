const rawDashboardUrl = import.meta.env.VITE_DASHBOARD_URL?.trim()
const dashboardBaseUrl = rawDashboardUrl ? rawDashboardUrl.replace(/\/+$/, '') : ''

/**
 * Centralized branding and integration configuration for the public website.
 * Set VITE_DASHBOARD_URL in Vercel or .env to route Sign In and Get Started
 * directly to the hosted OnusSync dashboard.
 */
export const BRANDING = {
  name: 'OnusSync',
  tagline: 'Connect. Automate. Grow.',
  productType: 'AI-Powered Business Automation & Customer Engagement Platform',
  contactEmail: 'onussync@gmail.com',
  dashboard: {
    isExternalConfigured: Boolean(dashboardBaseUrl),
    signInHref: dashboardBaseUrl ? `${dashboardBaseUrl}/login` : '#get-started',
    getStartedHref: dashboardBaseUrl ? `${dashboardBaseUrl}/register` : '#get-started',
  },
} as const

