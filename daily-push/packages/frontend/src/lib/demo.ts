// Public demo login, shown on Landing and Login when both are configured
// (VITE_DEMO_EMAIL / VITE_DEMO_PASSWORD on Vercel). The data behind it is
// rebuilt once a day, so it is safe to share.
export const DEMO_EMAIL = (import.meta.env.VITE_DEMO_EMAIL as string | undefined)?.trim() ?? '';
export const DEMO_PASSWORD = (import.meta.env.VITE_DEMO_PASSWORD as string | undefined) ?? '';
export const HAS_DEMO = Boolean(DEMO_EMAIL && DEMO_PASSWORD);
