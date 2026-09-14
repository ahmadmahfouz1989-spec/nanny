-- Reply notifications already existed; likes didn't (deliberately, at the
-- time, to avoid noise) -- adding it back in per explicit request.

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'new_match','interest_received','interest_accepted','profile_approved',
  'profile_rejected','verification_updated','report_resolved','profile_pending_review',
  'rating_received','post_reply','post_like'
));
