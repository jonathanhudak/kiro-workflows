# Tasks: User Settings Page

## Task Breakdown

### Task 1: Database schema and API foundation [S]
**Dependencies:** None
**Files:** prisma/schema.prisma, lib/validations/settings.ts
- Add UserSettings model to Prisma schema
- Create Zod validation schemas (profileSchema, notificationSchema, themeSchema)
- Run prisma migrate dev
- Verify migration applies cleanly

### Task 2: Settings API routes [M]
**Dependencies:** Task 1
**Files:** app/api/settings/profile/route.ts, app/api/settings/notifications/route.ts, app/api/settings/theme/route.ts
- Implement PATCH handlers for all three endpoints
- Add session authentication check (return 401 if no session)
- Validate request body against Zod schemas
- Upsert UserSettings record (create if not exists)
- Return updated settings in response
- Add rate limiting middleware (10 req/min)

### Task 3: Settings layout and navigation [S]
**Dependencies:** None (can parallel with Task 1-2)
**Files:** app/settings/layout.tsx, app/settings/page.tsx, components/settings/settings-nav.tsx
- Create SettingsLayout with responsive sidebar/tabs
- Server component — fetch user settings for initial data
- NavLinks with active state styling
- Redirect /settings → /settings/profile
- Add "Settings" link to user dropdown in header

### Task 4: Profile form [M]
**Dependencies:** Task 2, Task 3
**Files:** app/settings/profile/page.tsx, components/settings/profile-form.tsx, components/settings/avatar-upload.tsx
- ProfileForm with React Hook Form + Zod resolver
- Inline validation on blur
- AvatarUpload with drag-drop, preview, crop to 256x256
- Submit handler calls PATCH /api/settings/profile
- Success/error toast feedback
- Loading state on submit button

### Task 5: Notification toggles [S]
**Dependencies:** Task 2, Task 3
**Files:** app/settings/notifications/page.tsx, components/settings/notification-toggles.tsx
- Three toggle switches with labels and descriptions
- Auto-save on toggle change (debounced 500ms)
- Warning dialog when disabling Security Alerts
- Optimistic UI update with rollback on error

### Task 6: Theme selector [S]
**Dependencies:** Task 2, Task 3
**Files:** app/settings/theme/page.tsx, components/settings/theme-selector.tsx
- RadioGroup with visual previews of each theme
- Apply theme immediately via existing ThemeProvider
- Persist to API + localStorage simultaneously
- Show current system theme when "System" is selected

## Execution Order

```
Task 1 ──→ Task 2 ──→ Task 4
                   ├──→ Task 5
Task 3 ────────────├──→ Task 6
```

Tasks 4, 5, 6 can be parallelized after Tasks 2 and 3 complete.

## Estimated Total: 2-3 hours
