ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_year_check;
ALTER TABLE public.courses ADD CONSTRAINT courses_year_check CHECK (year >= 0 AND year <= 20);
ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_category_check;