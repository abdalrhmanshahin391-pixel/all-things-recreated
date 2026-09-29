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

## 6-Phase Development Workflow
For every non-trivial feature request, **DO NOT start coding immediately**. Follow this mandatory workflow:

### PHASE 1 — UNDERSTAND
First inspect the existing codebase and determine:
- What parts of the application are affected
- Existing components that can be reused
- Existing APIs/server functions
- Existing database tables/schema
- Existing authentication/authorization
- Existing UI patterns
- Potential dependencies or side effects
*Do not modify files during this phase.*

### PHASE 2 — CLARIFY
If important requirements are ambiguous, ask questions BEFORE creating the implementation plan.
**Question Style Guidelines:**
- **Batch Concisely**: Prefer 2–5 concise questions grouped together rather than asking one question at a time.
- **Multiple-Choice**: Use for decisions with predictable options. Provide clear options, include "Other" when appropriate, and explain briefly why the decision matters when it is not obvious.
- **Open-Ended**: Use when the user needs to describe a custom requirement.
- **Product-Level Framing**: Do not overwhelm the user with technical questions. Translate technical decisions into product-level choices whenever possible.
- **Only Essential Questions**: Do not ask questions whose answers can be determined reliably by inspecting the existing codebase. Ask only questions that could materially change the implementation.


### PHASE 3 — PROPOSE
After all important requirements are clear, create an implementation plan.
The plan must include:
- Feature summary
- User flow
- Files/components that will change
- Backend/API changes
- Database changes
- Authentication/permissions
- UI changes
- Edge cases
- Testing plan
- Risks or potential breaking changes

*Clearly distinguish:*
- Existing code that will be reused
- Existing code that will be modified
- New code that will be created

### PHASE 4 — WAIT FOR APPROVAL
Do NOT implement the plan yet.
End the message with:
`Plan ready. Should I proceed with implementation?`
Only begin implementation after the user approves.

### PHASE 5 — IMPLEMENT
After approval:
- Implement the approved plan
- Do not make unrelated changes
- Reuse existing architecture
- Preserve existing UI
- Keep changes minimal and maintainable
- If implementation requires a significant deviation from the approved plan, stop and explain the deviation before continuing.

### PHASE 6 — VERIFY
After implementation:
- Check TypeScript errors (`npx tsc --noEmit`)
- Check imports
- Check routes
- Check API/server functions
- Check database interactions
- Check authentication/authorization
- Check responsive behavior
- Check obvious runtime issues
- Fix issues caused by your implementation.

Then provide a concise implementation summary.

