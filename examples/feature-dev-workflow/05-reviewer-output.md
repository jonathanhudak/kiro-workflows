# Code Review: User Settings Page

## Overall Assessment

Solid implementation. Clean separation of concerns, good use of server/client component boundaries, shared validation. A few improvements recommended below but nothing blocking.

## Findings

### SHOULD_FIX

**[SF-1] Rate limiter uses in-memory Map — not production-safe for multi-instance**
`lib/middleware/rate-limit.ts:8`
```ts
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
```
Works fine for single-server dev, but will not share state across instances in production. Add a TODO comment noting Redis replacement needed, or use `@upstash/ratelimit` which is already in the Next.js ecosystem.

**[SF-2] Avatar upload missing virus/content scanning**
`app/api/settings/profile/route.ts:45`
The file type check only validates the extension and MIME type from the client. A malicious file with a .jpg extension could still pass. Consider validating the file magic bytes or using a content scanning service.

### SUGGESTION

**[S-1] Consider `useOptimistic` for notification toggles**
`components/settings/notification-toggles.tsx:23`
React 19's `useOptimistic` hook would simplify the optimistic update + rollback pattern. Currently using manual state management which works but is more verbose.

**[S-2] Add `loading.tsx` for settings routes**
`app/settings/profile/`
Next.js streaming would show a skeleton while the server component fetches user data. Low effort, nice UX improvement.

**[S-3] Theme localStorage key should be a constant**
`components/settings/theme-selector.tsx:12` and `app/layout.tsx:28`
The string `"theme-preference"` appears in two files. Extract to a shared constant in `lib/constants.ts` to prevent drift.

### Positive Notes

- ✅ Zod schemas shared between client and server — great pattern
- ✅ Server components for layout, client only where needed
- ✅ Accessible markup with proper labels and ARIA
- ✅ Avatar crop using native canvas (no extra dependency)
- ✅ Rate limiter includes Retry-After header (RFC 6585 compliant)

## VERDICT

```
VERDICT: APPROVE with suggestions
BLOCKING: 0
SHOULD_FIX: 2
SUGGESTION: 3
```

No blocking issues. The SHOULD_FIX items are production hardening — fine to ship and address before scaling. Good work.
