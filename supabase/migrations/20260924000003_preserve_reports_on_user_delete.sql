-- Deleting a user (DELETE /api/admin/users/[id]) used to have to delete
-- every report made by or about them -- and null out any report they had
-- resolved as an admin -- *before* calling auth.admin.deleteUser, because
-- these foreign keys had no ON DELETE action and would otherwise block the
-- cascade from auth.users. If the auth deletion then failed (e.g. the user
-- still owned Storage objects), the moderation history was already gone
-- while the account itself was untouched.
--
-- With ON DELETE SET NULL the database does this itself, atomically, as
-- part of the same delete that removes the user -- and a report survives
-- as a record (reason, details, status, resolution notes) with the deleted
-- party shown as "—" in the admin queue, instead of disappearing. The
-- other admin-attribution columns get the same treatment so deleting a
-- former admin never trips over a verification or grant they once made.

alter table public.reports alter column reporter_user_id drop not null;
alter table public.reports alter column reported_user_id drop not null;

alter table public.reports drop constraint if exists reports_reporter_user_id_fkey;
alter table public.reports add constraint reports_reporter_user_id_fkey
  foreign key (reporter_user_id) references public.users(id) on delete set null;

alter table public.reports drop constraint if exists reports_reported_user_id_fkey;
alter table public.reports add constraint reports_reported_user_id_fkey
  foreign key (reported_user_id) references public.users(id) on delete set null;

alter table public.reports drop constraint if exists reports_resolved_by_admin_id_fkey;
alter table public.reports add constraint reports_resolved_by_admin_id_fkey
  foreign key (resolved_by_admin_id) references public.users(id) on delete set null;

alter table public."references" drop constraint if exists references_verified_by_admin_id_fkey;
alter table public."references" add constraint references_verified_by_admin_id_fkey
  foreign key (verified_by_admin_id) references public.users(id) on delete set null;

alter table public.verification drop constraint if exists verification_verified_by_admin_id_fkey;
alter table public.verification add constraint verification_verified_by_admin_id_fkey
  foreign key (verified_by_admin_id) references public.users(id) on delete set null;

-- featured_grants was subscription_grants until 20260912000001; the
-- rename kept the constraint's original name.
alter table public.featured_grants drop constraint if exists subscription_grants_granted_by_fkey;
alter table public.featured_grants add constraint subscription_grants_granted_by_fkey
  foreign key (granted_by) references public.users(id) on delete set null;

-- Nullable now only so a deletion can clear them -- a new report must
-- still name both parties. (reporter_user_id is already pinned to
-- auth.uid() below, which can never be null for a signed-in caller.)
-- Also carries the active-account check from 20260924000002.
drop policy reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert with check (
    auth.uid() = reporter_user_id
    and public.current_user_is_active()
    and reported_user_id is not null
    and (
      (match_id is null and match_source is null)
      or (
        match_id is not null and match_source is not null
        and public.report_match_participants_valid(match_id, match_source, reporter_user_id, reported_user_id)
      )
    )
  );
