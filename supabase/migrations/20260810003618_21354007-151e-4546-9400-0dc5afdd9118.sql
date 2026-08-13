CREATE TABLE public.guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  published boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  course_id uuid,
  title_en text NOT NULL DEFAULT '',
  summary_en text NOT NULL DEFAULT '',
  body_en text NOT NULL DEFAULT '',
  title_ru text NOT NULL DEFAULT '',
  summary_ru text NOT NULL DEFAULT '',
  body_ru text NOT NULL DEFAULT '',
  title_hy text NOT NULL DEFAULT '',
  summary_hy text NOT NULL DEFAULT '',
  body_hy text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.guides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guides TO authenticated;
GRANT ALL ON public.guides TO service_role;

ALTER TABLE public.guides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read published guides"
  ON public.guides FOR SELECT
  USING (published = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert guides"
  ON public.guides FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update guides"
  ON public.guides FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete guides"
  ON public.guides FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX guides_published_position_idx ON public.guides (published, position);

CREATE TRIGGER update_guides_updated_at
  BEFORE UPDATE ON public.guides
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.guides (slug, published, position, title_en, summary_en, body_en, title_ru, summary_ru, body_ru, title_hy, summary_hy, body_hy)
VALUES (
  'how-aquaqbank-works',
  true,
  0,
  'How AquaQBank works for YSMU students',
  'What AquaQBank includes for Yerevan State Medical University students: question banks, video lectures and committee notes, organised by year and course.',
  E'## What AquaQBank is\n\nAquaQBank is a study platform built around Yerevan State Medical University. Instead of hunting for scattered files, everything is organised by the year and the course you are actually studying.\n\n## What is inside\n\n- **Question banks** — practice questions per course, split into midterm and final sets, with instant feedback while you answer.\n- **Video lectures** — lecture courses grouped by subject, with quizzes attached to the material.\n- **Committee notes** — shared PDFs and summaries collected per year and subject, with preview before download.\n- **Summaries and study tools** — the Study Hub collects the extra tools we add over time.\n\n## How access works\n\nAccess is sold per academic year or per semester, depending on the course. You create a free account, verify your email, then unlock the courses you need. Some material is free to preview before you decide.\n\n## Getting started\n\n1. Create an account and verify your email.\n2. Open the Universities page and pick Yerevan State Medical University.\n3. Choose your year, then open the course you are studying.\n4. Start with the question bank for the exam you are preparing for.',
  'Как работает AquaQBank для студентов ЕГМУ',
  'Что входит в AquaQBank для студентов Ереванского государственного медицинского университета: банки вопросов, видеолекции и материалы комитета по курсам и годам обучения.',
  E'## Что такое AquaQBank\n\nAquaQBank — учебная платформа, построенная вокруг Ереванского государственного медицинского университета. Все материалы упорядочены по году обучения и по предмету, который вы изучаете.\n\n## Что внутри\n\n- **Банки вопросов** — практические вопросы по каждому предмету, отдельно для промежуточного и итогового экзамена.\n- **Видеолекции** — курсы лекций по темам, с тестами по материалу.\n- **Материалы комитета** — общие PDF-файлы и конспекты по году и предмету, с предпросмотром перед скачиванием.\n- **Конспекты и учебные инструменты** — раздел Study Hub, куда мы постепенно добавляем новые инструменты.\n\n## Как устроен доступ\n\nДоступ продаётся на учебный год или на семестр — в зависимости от курса. Вы создаёте бесплатный аккаунт, подтверждаете почту и открываете нужные курсы. Часть материалов доступна для предпросмотра.\n\n## С чего начать\n\n1. Создайте аккаунт и подтвердите электронную почту.\n2. Откройте страницу университетов и выберите ЕГМУ.\n3. Выберите свой год обучения и нужный предмет.\n4. Начните с банка вопросов для того экзамена, к которому готовитесь.',
  'Ինչպես է աշխատում AquaQBank-ը ԵՊԲՀ ուսանողների համար',
  'Ինչ է ներառում AquaQBank-ը Երևանի պետական բժշկական համալսարանի ուսանողների համար՝ հարցաշարեր, տեսադասախոսություններ և կոմիտեի նյութեր՝ ըստ կուրսի և առարկայի։',
  E'## Ինչ է AquaQBank-ը\n\nAquaQBank-ը ուսումնական հարթակ է, որը կառուցված է Երևանի պետական բժշկական համալսարանի շուրջ։ Բոլոր նյութերը դասավորված են ըստ ուսումնական տարվա և առարկայի։\n\n## Ինչ կա ներսում\n\n- **Հարցաշարեր** — գործնական հարցեր յուրաքանչյուր առարկայի համար՝ առանձին միջանկյալ և եզրափակիչ քննության համար։\n- **Տեսադասախոսություններ** — դասընթացներ ըստ թեմաների՝ կցված թեստերով։\n- **Կոմիտեի նյութեր** — ընդհանուր PDF-ներ և ամփոփումներ ըստ կուրսի և առարկայի՝ ներբեռնումից առաջ նախադիտմամբ։\n- **Ամփոփումներ և ուսումնական գործիքներ** — Study Hub բաժինը, որտեղ ավելացնում ենք նոր գործիքներ։\n\n## Ինչպես է աշխատում հասանելիությունը\n\nՀասանելիությունը վաճառվում է ուսումնական տարով կամ կիսամյակով՝ կախված դասընթացից։ Ստեղծում եք անվճար հաշիվ, հաստատում եք էլ․ փոստը և բացում անհրաժեշտ դասընթացները։\n\n## Ինչպես սկսել\n\n1. Ստեղծեք հաշիվ և հաստատեք էլ․ փոստը։\n2. Բացեք համալսարանների էջը և ընտրեք ԵՊԲՀ-ն։\n3. Ընտրեք ձեր կուրսը և անհրաժեշտ առարկան։\n4. Սկսեք այն քննության հարցաշարից, որին պատրաստվում եք։'
);