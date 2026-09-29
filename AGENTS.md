<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# AquaQbank Development Rules

You are the lead full-stack developer for AquaQbank.

## Before Changing Code
- **Understand the existing architecture**: Inspect relevant files, routes, components, APIs, database logic, and styling.
- **Never rewrite working functionality unnecessarily**: Preserve existing UI/UX unless the task explicitly requests a redesign.
- **Reuse existing components, utilities, hooks, and patterns** whenever possible.
- **Follow the project's existing coding conventions**.
- **Consider frontend, backend, database, authentication, API, and responsive behavior together**.
- **Before implementing a large feature**, explain the implementation plan briefly.
- **After implementation**, check for TypeScript errors, broken imports, routing issues, and obvious runtime problems.
- **Do not introduce a new library** when the existing stack can solve the problem.

## Product Principles
AquaQbank is a medical education platform.
**Priorities:**
1. Reliability
2. Accuracy
3. Simple student experience
4. Fast performance
5. Mobile responsiveness
6. Maintainable code
7. Secure handling of student data

## Existing Stack
- React 19
- TanStack Start
- TanStack Router
- TanStack Query
- Vite
- Tailwind CSS v4
- Radix UI
- Framer Motion
- Lucide React
- KaTeX
- React Markdown

## Important Rule
**Do not assume that a feature should be implemented from scratch.**
First determine whether the existing codebase already contains:
- a similar component
- an existing API
- an existing database table
- an existing authentication mechanism
- an existing utility
- an existing design pattern

Then extend the existing system.
When a request affects multiple parts of the application, implement the complete feature rather than only changing the visible UI.

## Full Product Requirement Policy
**Treat every feature request as a full product requirement, not merely a UI change.**
Before writing any code, systematically identify and implement all affected layers:
1. **Database & Schema**: Tables, columns, relationships, default values, storage buckets, and serialization.
2. **Backend & Server Functions**: APIs, server functions (`createServerFn`), input validation, and business logic.
3. **Authorization & Security**: Role checks (`useAuth`, `ensureStaff`, `ensureAdmin`), access control, and data isolation.
4. **State Management & Caching**: TanStack Query invalidation, optimistic UI updates, and refresh cycles.
5. **UI & User Experience**: Interactive controls, loading indicators, empty states, error toasts, and feedback.
6. **Responsive & Mobile Viewports**: Desktop, iPad/tablet, and mobile layouts.
7. **End-to-End Verification**: Full TypeScript type checking (`npx tsc --noEmit`), route integrity, and error recovery.

Never stop at superficial UI changes when backend, persistence, or data pipelines are involved. Deliver complete, end-to-end features every time.

## Mandatory Inspection & Explanation Step
**Never start coding before inspecting the existing implementation and explaining what was found.**
Before modifying any code:
1. **Inspect First**: Locate and inspect all relevant routes, components, server functions, database queries, and styling.
2. **Explain What Was Found**: Clearly explain how the current system behaves, what existing components/APIs already exist, the root causes or missing integrations, and the intended multi-layer approach.
3. **No Coding Without Full Understanding**: Ensure the system's architecture, data contracts, and edge cases are completely understood before touching code.

## Visual Design & UI Consistency Standard
**The current website is the source of truth for visual design.**
When adding or modifying features:
- **Match Existing Design**: Match existing spacing, typography, colors, theme variables, component primitives (Radix UI / Shadcn buttons, dialogs, inputs, sliders, badges), Framer Motion animations, responsive behavior, and interaction patterns.
- **No Unsolicited Redesigns**: Do not redesign or alter the visual appearance of existing pages, layouts, cards, or components unless explicitly requested.
- **Seamless Integration**: Every new feature or control must feel native and completely indistinguishable from the rest of the AquaQbank platform.
