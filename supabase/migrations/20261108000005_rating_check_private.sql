-- completed_order_between is for the rating policy (signed-in users) only.
-- Supabase grants anon execute on new functions by default; take it back.
revoke execute on function public.completed_order_between(uuid, uuid, uuid) from anon;
