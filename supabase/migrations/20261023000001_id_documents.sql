-- ID documents: delivery & errands providers upload a photo of their ID
-- or driving licence, which only admins look at. The bucket is private
-- (no public URLs, no client storage policies at all): the server writes
-- with the service role and hands an admin a short-lived signed link.
-- Others only ever learn that a profile's ID was checked (the badge),
-- never the document.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('id-documents', 'id-documents', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

-- One document per profile; a new upload replaces it and needs review again.
-- No user_id column: the owner is the profile's, and a second path from
-- profiles to users would make PostgREST embeds of users ambiguous (see
-- the admin queue fix of 2026-10-23).
create table public.id_documents (
  profile_id uuid primary key references public.generic_profiles(id) on delete cascade,
  -- Object path in the id-documents bucket: "<user id>/<profile id>-<time>.<ext>".
  path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.id_documents enable row level security;

-- Owners see whether theirs is uploaded and checked; nobody else does.
create policy id_documents_select_own on public.id_documents
  for select using (
    exists (select 1 from public.generic_profiles gp where gp.id = profile_id and gp.user_id = auth.uid())
  );

grant select on public.id_documents to authenticated;
grant select, insert, update, delete on public.id_documents to service_role;
