---
date: 2026-02-10
workflow: feature-dev
task: Add User Settings Page
category: technical
tags: [next.js, forms, api-design, validation, settings]
---

# Learnings: User Settings Page

## Technical

### Shared Zod Schemas Between Client and Server
Defining validation schemas once in `lib/validations/` and importing them in both React Hook Form (client) and API routes (server) eliminates validation drift. This pattern should be the default for any form + API pair.

**Pattern:**
```ts
// lib/validations/settings.ts — single source of truth
export const profileSchema = z.object({ ... });

// Client: useForm({ resolver: zodResolver(profileSchema) })
// Server: profileSchema.parse(await req.json())
```

### Server/Client Component Boundary for Settings Pages
Using server components for layout and data fetching, with client components only for interactive forms, gave the best of both worlds: fast initial load (server-rendered nav + data), interactive where needed. The key insight: pass fetched data as props to client components rather than fetching client-side.

### Auto-save vs Explicit Save — When to Use Each
- **Explicit save (form + button):** For changes that are hard to undo or have consequences (email change, profile info)
- **Auto-save (on change):** For toggles and preferences that are instantly reversible and low-risk

This is a good heuristic for future settings-style UIs.

## Process

### Planner Task Sizing Was Accurate
The S/M/L sizing in tasks.md matched actual implementation time well. The parallel execution plan (Tasks 4/5/6 after 2/3) correctly identified the dependency graph. Having explicit file lists per task reduced context-switching.

### Verifier Caught Nothing — Good Sign
When the verifier finds zero issues, it means the planner spec was clear enough for the developer to implement correctly on the first pass. The structured acceptance criteria table in requirements.md was key.

## Quality

### Rate Limiter Needs Production Strategy
In-memory rate limiting works for development but won't survive deployments or multi-instance setups. Every API route that adds rate limiting should document the production strategy (Redis, Upstash, Cloudflare, etc.) in the ADR or README.

### Avatar Upload Security Gap
Client-side MIME type checking is insufficient. File magic byte validation should be a standard part of any file upload implementation. Add this to the project's security checklist.
