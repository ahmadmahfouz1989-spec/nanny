-- A provider's profile page can be opened by anyone with the link (no
-- account needed), so it can be shared on WhatsApp, Instagram, Facebook...
-- Approved, active provider profiles only; never a seeker's. The public
-- page is rendered on the server with the service role and shows a fixed,
-- safe set of fields (no phone, no exact place). The owner can switch it
-- off; then the link asks visitors to sign in, as before.
alter table public.generic_profiles add column public_page boolean not null default true;
