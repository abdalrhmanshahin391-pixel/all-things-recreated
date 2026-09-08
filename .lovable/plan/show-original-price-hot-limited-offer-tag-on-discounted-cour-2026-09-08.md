# Show original price + HOT/LIMITED OFFER tag on discounted courses

## Problem
Discounts are saved correctly in CoursesHub, but students never see them properly:
- The main **/courses** page drops the discount fields entirely when building each `CourseCard`, so only the discounted price shows — no strikethrough, no tag.
- **My Courses** passes the discount fields but not the badge fields.
- The **course detail page** ignores the discount — both Unlock buttons just show the current price.
- **Lectures** shows a tiny "was $X" line with no tag.
- Even where the strikethrough does appear, there's no eye-catching **HOT OFFER / LIMITED OFFER** tag — just small text.

## What changes

### 1. `src/components/common/CourseCard.tsx`
- When a discount is live (`offerLive`) and no manual badge is set, auto-place a **HOT OFFER** corner badge (or **LIMITED OFFER** when `discount_ends_at` is set) using the existing `CourseBadge` component. Manual badges still win.
- Keep the existing struck-through was-price + "now X · ends DATE" line; it already works once the fields arrive.

### 2. `src/routes/courses.index.tsx` (main Courses page)
- Pass the missing fields to `CourseCard`: `badge`, `badge_color`, `badge_expires_at`, `compare_at_price`, `discount_active`, `discount_ends_at`. The data is already selected (`select("*")`); it's just not forwarded.

### 3. `src/routes/my.courses.tsx` (My Courses)
- Add the badge fields (`badge`, `badge_color`, `badge_expires_at`) to the course select and the `CourseCard` props so the corner badge shows here too. Discount fields are already passed.

### 4. `src/routes/courses.$courseId.index.tsx` (course detail page)
- Add `compare_at_price`, `discount_active`, `discount_ends_at`, `badge`, `badge_color`, `badge_expires_at`, `currency` to the `Course` type (data is already fetched via `select("*")`).
- On the two Unlock buttons and the header area, show `~~was-price~~` struck through next to the current price, plus a small **HOT OFFER / LIMITED OFFER** tag, when the discount is live. Checkout keeps charging the current price.

### 5. `src/routes/lectures.index.tsx` (Lectures page)
- Upgrade the `LectureCard` price block to show the struck-through was-price, the current price, and a **HOT OFFER / LIMITED OFFER** tag when `offerLive` is true — matching the question-bank card look. Use the same helper logic as CourseCard.

## No database changes
All columns (`compare_at_price`, `discount_active`, `discount_ends_at`, badge fields) already exist and are saved by CoursesHub. This is purely a display fix.

## Verification
- `bunx tsgo --noEmit` and a build check.
- Visual check on /courses and a course detail page with a discounted course to confirm the struck-through original price and HOT/LIMITED OFFER tag appear.
