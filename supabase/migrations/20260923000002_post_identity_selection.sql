-- Lets a poster choose which of their profiles a feed post is attributed
-- to (nanny/parent, or one of several generic-category profiles), rather
-- than always displaying whichever the account's global users.role
-- happens to be, or an arbitrary generic_profiles row when it isn't set.
-- Mirrors the favorites polymorphic-target pattern (three separate
-- nullable FKs, one per target table -- a single "type + id" pair can't
-- get a real FK since a FK always points at one fixed table) with one
-- deliberate divergence: `on delete set null`, not `cascade`. Admin
-- profile rejection genuinely hard-deletes the profile row while the
-- account stays active (see moderation/route.ts) -- cascading would
-- silently delete someone's past posts the moment that happened. A post
-- losing its attributed identity just falls back to the existing
-- legacy (users.role-based) display, which already has a well-defined
-- fallback.

alter table public.posts
  add column posted_as_parent_profile_id uuid references public.parent_profiles(id) on delete set null,
  add column posted_as_nanny_profile_id uuid references public.nanny_profiles(id) on delete set null,
  add column posted_as_generic_profile_id uuid references public.generic_profiles(id) on delete set null;

-- Zero-or-one, not exactly-one: a post is allowed to carry no chosen
-- identity at all (every pre-existing row, and every post from an
-- account with no eligible profile, both need this to stay possible).
alter table public.posts
  add constraint posts_posted_as_at_most_one
  check (num_nonnulls(posted_as_parent_profile_id, posted_as_nanny_profile_id, posted_as_generic_profile_id) <= 1);

-- Backs both GET /api/posts?mine=1 (already .eq(user_id).order(created_at
-- desc)) and the new "what did I last post as" lookup.
drop index public.posts_user_idx;
create index posts_user_idx on public.posts(user_id, created_at desc);

-- Self-ownership + not-a-draft. Safe as a plain nested exists(): nothing
-- in parent_profiles/nanny_profiles/generic_profiles' own SELECT policies
-- queries back into posts, so there's no recursion cycle (same reasoning
-- already used for favorites_insert_own in 20260923000001_saved_profiles.sql)
-- -- no security-definer helper needed here.
drop policy posts_insert on public.posts;

create policy posts_insert on public.posts
  for insert with check (
    user_id = auth.uid()
    and (
      (posted_as_parent_profile_id is null and posted_as_nanny_profile_id is null and posted_as_generic_profile_id is null)
      or (posted_as_parent_profile_id is not null and exists (
        select 1 from public.parent_profiles p
        where p.id = posted_as_parent_profile_id and p.user_id = auth.uid() and p.status <> 'draft'
      ))
      or (posted_as_nanny_profile_id is not null and exists (
        select 1 from public.nanny_profiles n
        where n.id = posted_as_nanny_profile_id and n.user_id = auth.uid() and n.status <> 'draft'
      ))
      or (posted_as_generic_profile_id is not null and exists (
        select 1 from public.generic_profiles g
        where g.id = posted_as_generic_profile_id and g.user_id = auth.uid() and g.status <> 'draft'
      ))
    )
  );

-- Extends the existing posts_protect_mutation trigger (previously only
-- guarded user_id/kind, see 20260913000001_posts.sql) -- a published
-- post's attributed identity is exactly as fixed as those already are,
-- with one exception: a column is allowed to go to null (but never to a
-- *different* non-null value, and never from null to non-null). That's
-- deliberately wide enough to let the posted_as_* FKs' own `on delete set
-- null` action through -- it's a plain UPDATE as far as this trigger can
-- see, no different from posts_update's own auth.uid()-gated UPDATE, so a
-- check tight enough to block a forged identity swap would otherwise also
-- block the FK cascade itself and make admin profile rejection fail
-- outright for any profile with a post attributed to it. The accepted
-- side effect: a post's own author could likewise null out their post's
-- attribution via a raw update -- harmless, since it only ever falls back
-- to the existing legacy display, never lets anyone claim an identity.
create or replace function public.protect_post_mutation()
returns trigger
language plpgsql
as $$
begin
  if new.user_id <> old.user_id
    or new.kind <> old.kind
    or (new.posted_as_parent_profile_id is not null and new.posted_as_parent_profile_id is distinct from old.posted_as_parent_profile_id)
    or (new.posted_as_nanny_profile_id is not null and new.posted_as_nanny_profile_id is distinct from old.posted_as_nanny_profile_id)
    or (new.posted_as_generic_profile_id is not null and new.posted_as_generic_profile_id is distinct from old.posted_as_generic_profile_id)
  then
    raise exception 'user_id, kind, and posted_as_* cannot be changed to a different identity after a post is created';
  end if;
  return new;
end;
$$;
