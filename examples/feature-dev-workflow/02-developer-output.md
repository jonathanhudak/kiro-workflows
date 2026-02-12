# Developer Output: User Settings Page

## Summary

Implemented the user settings page across 6 tasks. All acceptance criteria from the planner spec are met.

## Changes

### Task 1: Database schema and API foundation
- **prisma/schema.prisma**: Added `UserSettings` model with theme, notification preferences, and user relation
- **lib/validations/settings.ts**: Created 3 Zod schemas (`profileSchema`, `notificationSchema`, `themeSchema`) shared between client and server
- Migration `20260210_add_user_settings` applied successfully

### Task 2: Settings API routes
- **app/api/settings/profile/route.ts**: PATCH handler with session auth, Zod validation, avatar upload to S3, upsert logic
- **app/api/settings/notifications/route.ts**: PATCH handler with auto-save support, validates boolean fields
- **app/api/settings/theme/route.ts**: PATCH handler validates theme enum ("light"|"dark"|"system")
- **lib/middleware/rate-limit.ts**: Token bucket rate limiter (10 req/min per user), returns 429 with Retry-After header

### Task 3: Settings layout and navigation
- **app/settings/layout.tsx**: Server component, fetches user settings, passes as props. Responsive: sidebar on desktop, horizontal tabs on mobile
- **app/settings/page.tsx**: Redirects to /settings/profile via `redirect()`
- **components/settings/settings-nav.tsx**: NavLinks with `usePathname()` for active state. Accessible with `aria-current="page"`
- **components/header/user-dropdown.tsx**: Added "Settings" link with gear icon

### Task 4: Profile form
- **app/settings/profile/page.tsx**: Client component wrapping ProfileForm
- **components/settings/profile-form.tsx**: React Hook Form with zodResolver, inline validation on blur, loading state on submit, success/error toasts
- **components/settings/avatar-upload.tsx**: Drag-drop zone, file type/size validation, client-side crop to 256x256 using canvas API, preview before upload

### Task 5: Notification toggles
- **app/settings/notifications/page.tsx**: Client component
- **components/settings/notification-toggles.tsx**: Three toggles with auto-save (500ms debounce), optimistic UI, confirmation dialog for security alerts disable

### Task 6: Theme selector
- **app/settings/theme/page.tsx**: Client component
- **components/settings/theme-selector.tsx**: RadioGroup with mini-preview cards, immediate application via `useTheme()`, dual persistence (API + localStorage)

## Commits

```
feat: add UserSettings schema and validation (Task 1)
feat: add settings API routes with auth and rate limiting (Task 2)
feat: add settings layout and navigation (Task 3)
feat: add profile form with avatar upload (Task 4)
feat: add notification toggles with auto-save (Task 5)
feat: add theme selector with instant preview (Task 6)
```

## Files Changed

| Action | File |
|--------|------|
| Added | prisma/migrations/20260210_add_user_settings/ |
| Modified | prisma/schema.prisma |
| Added | lib/validations/settings.ts |
| Added | lib/middleware/rate-limit.ts |
| Added | app/api/settings/profile/route.ts |
| Added | app/api/settings/notifications/route.ts |
| Added | app/api/settings/theme/route.ts |
| Added | app/settings/layout.tsx |
| Added | app/settings/page.tsx |
| Added | app/settings/profile/page.tsx |
| Added | app/settings/notifications/page.tsx |
| Added | app/settings/theme/page.tsx |
| Added | components/settings/settings-nav.tsx |
| Added | components/settings/profile-form.tsx |
| Added | components/settings/avatar-upload.tsx |
| Added | components/settings/notification-toggles.tsx |
| Added | components/settings/theme-selector.tsx |
| Modified | components/header/user-dropdown.tsx |

## Notes

- Avatar crop uses native canvas API (no external library) to keep bundle size down
- Rate limiter uses in-memory Map — good for single-server, swap to Redis for multi-instance
- Theme localStorage key is `theme-preference` — matches existing ThemeProvider convention
- All new components have `"use client"` directive only where needed (forms/interactivity)
