# Design: User Settings Page

## Architecture

### Route Structure
```
app/settings/
├── page.tsx              # Server component — layout + data fetching
├── layout.tsx            # Settings nav sidebar
├── profile/
│   └── page.tsx          # Client component — profile form
├── notifications/
│   └── page.tsx          # Client component — notification toggles
└── theme/
    └── page.tsx          # Client component — theme selector
```

### API Routes
```
app/api/settings/
├── profile/route.ts      # PATCH — update display name, email, avatar
├── notifications/route.ts # PATCH — update notification preferences
└── theme/route.ts        # PATCH — update theme preference
```

### Component Hierarchy
```
SettingsLayout
├── SettingsNav (server)
│   ├── NavLink "Profile"
│   ├── NavLink "Notifications"
│   └── NavLink "Theme"
└── {children} (page content)
    ├── ProfileForm (client)
    │   ├── AvatarUpload
    │   ├── Input "Display Name"
    │   ├── Input "Email"
    │   └── Button "Save"
    ├── NotificationToggles (client)
    │   ├── Toggle "Marketing"
    │   ├── Toggle "Product Updates"
    │   └── Toggle "Security Alerts" (with warning)
    └── ThemeSelector (client)
        └── RadioGroup [Light, Dark, System]
```

## Data Model

### Prisma Schema Addition
```prisma
model UserSettings {
  id                   String  @id @default(cuid())
  userId               String  @unique
  user                 User    @relation(fields: [userId], references: [id])
  theme                String  @default("system") // "light" | "dark" | "system"
  notifyMarketing      Boolean @default(false)
  notifyProductUpdates Boolean @default(true)
  notifySecurityAlerts Boolean @default(true)
  updatedAt            DateTime @updatedAt
}
```

## Key Decisions

### ADR-1: Separate Routes vs Single Page
**Decision:** Separate routes with shared layout (tabs)
**Rationale:** Better for deep linking, browser back button, and code splitting. Profile form with avatar upload is heavy — don't load it when user just wants to change theme.

### ADR-2: Auto-save vs Explicit Save
**Decision:** Explicit save for profile (form), auto-save for notifications and theme
**Rationale:** Profile changes (especially email) should be deliberate. Toggles and theme are low-risk, instant feedback feels better.

### ADR-3: Validation Strategy
**Decision:** Zod schemas shared between client form and API route
**Rationale:** Single source of truth for validation rules. Client validates on blur + submit, server re-validates on every request.
