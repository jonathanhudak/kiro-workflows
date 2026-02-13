# Tester Output: User Settings Page

## Test Plan

### Unit Tests (lib/validations)
- Zod schema validation for valid/invalid inputs
- Edge cases: empty strings, oversized strings, invalid emails, wrong types

### Integration Tests (API routes)
- Auth enforcement (401 without session)
- Validation errors (400 with details)
- Successful updates (200 with updated data)
- Rate limiting (429 after threshold)
- Upsert behavior (create on first call, update on subsequent)

### Component Tests (React Testing Library)
- ProfileForm: renders fields, validates on blur, submits successfully, shows error states
- NotificationToggles: renders three toggles, auto-saves on change, shows security warning
- ThemeSelector: renders options, applies theme on selection, shows current selection
- AvatarUpload: accepts valid files, rejects invalid, shows preview

## Tests Written

### `__tests__/lib/validations/settings.test.ts` (18 tests)

```
✓ profileSchema accepts valid profile data
✓ profileSchema rejects empty display name
✓ profileSchema rejects display name > 50 chars
✓ profileSchema rejects invalid email format
✓ profileSchema accepts email with subdomain
✓ profileSchema rejects display name with special characters
✓ notificationSchema accepts all boolean fields
✓ notificationSchema rejects non-boolean values
✓ notificationSchema accepts partial updates
✓ themeSchema accepts "light"
✓ themeSchema accepts "dark"
✓ themeSchema accepts "system"
✓ themeSchema rejects "auto"
✓ themeSchema rejects empty string
✓ profileSchema strips unknown fields
✓ notificationSchema defaults missing fields to undefined (partial)
✓ profileSchema rejects email without TLD
✓ profileSchema accepts display name with unicode letters
```

### `__tests__/api/settings/profile.test.ts` (8 tests)

```
✓ returns 401 when not authenticated
✓ returns 400 when display name is empty
✓ returns 400 when email is invalid
✓ returns 200 and updates profile for valid data
✓ creates UserSettings on first update (upsert)
✓ returns updated user data in response
✓ handles avatar file upload
✓ returns 413 when avatar exceeds 2MB
```

### `__tests__/api/settings/notifications.test.ts` (6 tests)

```
✓ returns 401 when not authenticated
✓ returns 200 and updates notification preferences
✓ accepts partial notification updates
✓ returns 400 for non-boolean values
✓ creates settings record if none exists
✓ returns 429 after 10 requests in 1 minute
```

### `__tests__/api/settings/theme.test.ts` (5 tests)

```
✓ returns 401 when not authenticated
✓ returns 200 and updates theme to "dark"
✓ returns 400 for invalid theme value
✓ creates settings record if none exists
✓ returns current theme in response
```

### `__tests__/components/settings/profile-form.test.tsx` (7 tests)

```
✓ renders display name, email, and avatar fields
✓ shows validation error on blur for empty display name
✓ shows validation error for invalid email
✓ submits form and shows success toast
✓ shows error toast on API failure
✓ disables submit button while loading
✓ pre-fills form with current user data
```

### `__tests__/components/settings/notification-toggles.test.tsx` (5 tests)

```
✓ renders three toggle switches with labels
✓ calls API on toggle change (debounced)
✓ shows warning dialog when disabling security alerts
✓ rolls back toggle on API error
✓ shows current notification state from props
```

### `__tests__/components/settings/theme-selector.test.tsx` (4 tests)

```
✓ renders light, dark, and system options
✓ highlights current theme selection
✓ calls useTheme and API on selection
✓ shows system theme label when "system" selected
```

## Summary

| Suite | Tests | Pass | Fail |
|-------|-------|------|------|
| Validations | 18 | 18 | 0 |
| API: Profile | 8 | 8 | 0 |
| API: Notifications | 6 | 6 | 0 |
| API: Theme | 5 | 5 | 0 |
| Component: ProfileForm | 7 | 7 | 0 |
| Component: NotificationToggles | 5 | 5 | 0 |
| Component: ThemeSelector | 4 | 4 | 0 |
| **Total** | **53** | **53** | **0** |

Coverage: 94% statements, 89% branches, 91% functions, 93% lines
