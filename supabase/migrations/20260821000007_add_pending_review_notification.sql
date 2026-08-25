-- Add a notification type for admins when a profile is newly submitted
-- (or edited) and lands back in the moderation queue.

alter table public.notifications drop constraint notifications_type_check;

alter table public.notifications add constraint notifications_type_check check (type in (
  'new_match','interest_received','interest_accepted','profile_approved',
  'profile_rejected','verification_updated','report_resolved','profile_pending_review'
));
