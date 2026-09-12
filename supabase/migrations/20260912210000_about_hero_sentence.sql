-- Add about page hero sentence fields to site_settings
ALTER TABLE public.site_settings
ADD COLUMN IF NOT EXISTS about_sentence_en text DEFAULT 'Medical Question Bank & Clinical Cases — Empowering the next generation of physicians.',
ADD COLUMN IF NOT EXISTS about_sentence_ar text DEFAULT 'بنك الأسئلة والحالات السريرية الطبية — نحو تمكين جيل الأطباء القادم.';
