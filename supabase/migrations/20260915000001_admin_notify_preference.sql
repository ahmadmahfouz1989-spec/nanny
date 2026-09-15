-- Per-admin opt-out for the "new profile pending review" notification
-- EMAIL specifically -- the in-app notification-bell entry still goes to
-- every admin regardless; this only silences the automated email send.

alter table public.users add column notify_new_profiles boolean not null default true;

update public.users set notify_new_profiles = false where email = 'ahmadmahfouz1989@gmail.com';
