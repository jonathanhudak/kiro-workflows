# Requirements: User Settings Page

## Functional Requirements

### FR-1: Profile Management
- **FR-1.1**: User can view current display name, email, and avatar
- **FR-1.2**: User can edit display name (1-50 chars, alphanumeric + spaces)
- **FR-1.3**: User can edit email (valid email format, unique check)
- **FR-1.4**: User can upload avatar (JPEG/PNG, max 2MB, cropped to 256x256)
- **FR-1.5**: Changes persist to database via PATCH /api/settings/profile

### FR-2: Notification Preferences
- **FR-2.1**: Three toggle switches: Marketing, Product Updates, Security Alerts
- **FR-2.2**: Security Alerts defaults to ON and shows warning when disabling
- **FR-2.3**: Changes auto-save on toggle (no submit button needed)
- **FR-2.4**: Persist via PATCH /api/settings/notifications

### FR-3: Theme Settings
- **FR-3.1**: Radio group: Light / Dark / System
- **FR-3.2**: Theme applies immediately on selection (no page reload)
- **FR-3.3**: Persist preference to database AND localStorage (for pre-auth flash prevention)
- **FR-3.4**: Persist via PATCH /api/settings/theme

### FR-4: UX Requirements
- **FR-4.1**: Success toast on save (auto-dismiss 3s)
- **FR-4.2**: Error toast on failure with retry option
- **FR-4.3**: Loading states on all async operations
- **FR-4.4**: Form validation inline (not just on submit)
- **FR-4.5**: Accessible: all inputs labeled, focus management, ARIA announcements for save status

## Non-Functional Requirements

- **NFR-1**: Page load < 200ms (server component with client islands)
- **NFR-2**: All API routes require authenticated session
- **NFR-3**: Rate limit settings API: 10 requests/minute per user
- **NFR-4**: Responsive: stacked layout on mobile (<768px), side-nav on desktop

## Assumptions

1. NextAuth session includes user ID — confirmed via existing middleware
2. Avatar storage uses existing S3 bucket configured in env
3. Toast component exists in the design system (ui/toast.tsx)
4. Theme provider already wraps the app (confirmed in layout.tsx)

## Open Questions

*None — all critical questions resolved via codebase inspection.*
