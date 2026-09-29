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
