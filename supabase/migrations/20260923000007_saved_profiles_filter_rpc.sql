-- resolveEligibility (src/lib/saved-profiles.ts) resolved a category/role
-- filter by first reading every generic_profiles row in that category
-- across the WHOLE platform (unpaginated, capped at PostgREST's 1000-row
-- max_rows), then passing that id list into an IN filter on favorites.
-- That list's size tracks the category's total directory size, not the
-- viewer's own shortlist -- once a category passes 1000 profiles, a
-- user's own saved profile outside that arbitrary first-1000 slice starts
-- silently disappearing from its own category's filtered view (while
-- still showing under "All", which takes a different, unfiltered path).
--
-- PostgREST can't express "OR across three FK columns, but one of them
-- also needs a filtered join to its own category/role" in one request, so
-- this replaces that shape with a single query, done here in SQL: favorites
-- joined to generic_profiles/categories directly, filtered and paginated
-- server-side, scoped to exactly the viewer's own rows regardless of how
-- large any category's total directory is.
create or replace function public.list_saved_favorites(
  p_user_id uuid,
  p_category text,
  p_role text,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid,
  p_limit int
)
returns table (
  id uuid,
  created_at timestamptz,
  parent_profile_id uuid,
  nanny_profile_id uuid,
  generic_profile_id uuid
)
language sql
stable
security invoker
set search_path = public
as $$
  select f.id, f.created_at, f.parent_profile_id, f.nanny_profile_id, f.generic_profile_id
  from public.favorites f
  left join public.generic_profiles gp on gp.id = f.generic_profile_id
  left join public.categories c on c.id = gp.category_id
  where f.user_id = p_user_id
    and (
      (p_category is null and p_role is null)
      or (
        p_category = 'nanny'
        and (
          (p_role is null and (f.parent_profile_id is not null or f.nanny_profile_id is not null))
          or (p_role = 'seeking' and f.parent_profile_id is not null)
          or (p_role = 'offering' and f.nanny_profile_id is not null)
        )
      )
      or (
        p_category in ('nursing', 'tutoring')
        and gp.id is not null
        and c.slug = p_category
        and (
          p_role is null
          or (p_role = 'seeking' and gp.role = 'seeker')
          or (p_role = 'offering' and gp.role = 'provider')
        )
      )
      or (
        p_category is null
        and p_role is not null
        and (
          (p_role = 'seeking' and (f.parent_profile_id is not null or (gp.id is not null and gp.role = 'seeker')))
          or (p_role = 'offering' and (f.nanny_profile_id is not null or (gp.id is not null and gp.role = 'provider')))
        )
      )
    )
    and (
      p_cursor_created_at is null
      or f.created_at < p_cursor_created_at
      or (f.created_at = p_cursor_created_at and f.id < p_cursor_id)
    )
  order by f.created_at desc, f.id desc
  limit p_limit;
$$;

grant execute on function public.list_saved_favorites to authenticated;
