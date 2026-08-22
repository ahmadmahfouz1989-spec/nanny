-- Drop Tagalog and Amharic from the language options offered in profile onboarding.

delete from public.nanny_profile_languages
using public.languages
where nanny_profile_languages.language_id = languages.id
  and languages.code in ('tl', 'am');

delete from public.parent_profile_languages
using public.languages
where parent_profile_languages.language_id = languages.id
  and languages.code in ('tl', 'am');

delete from public.languages where code in ('tl', 'am');
