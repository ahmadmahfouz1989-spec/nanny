-- Let users clear (delete) their own notifications.

create policy notifications_delete_own on public.notifications
  for delete using (auth.uid() = user_id);

grant delete on public.notifications to authenticated;
