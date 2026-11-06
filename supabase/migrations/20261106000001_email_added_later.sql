-- A WhatsApp account adding an email: Supabase Auth saves the new email and
-- marks it confirmed in two separate updates, so the sync has to run on the
-- second one too. Only an address users doesn't have yet is written, so email
-- sign-ups confirming their address behave exactly as before. Phones are left
-- alone: /api/auth/phone-verified relies on phone_verified_at being empty on
-- a new WhatsApp sign-up.
create or replace function public.sync_auth_identity_to_users()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.phone is distinct from old.phone and new.phone is not null and new.phone_confirmed_at is not null then
    update public.users set phone = new.phone, phone_verified_at = new.phone_confirmed_at where id = new.id;
  end if;
  if new.email is not null and new.email_confirmed_at is not null then
    update public.users set email = new.email, email_verified_at = new.email_confirmed_at
      where id = new.id and email is distinct from new.email;
  end if;
  return new;
exception when others then
  raise warning 'sync_auth_identity_to_users: % for user %', sqlerrm, new.id;
  return new;
end;
$$;

drop trigger on_auth_user_identity_changed on auth.users;
create trigger on_auth_user_identity_changed
  after update on auth.users
  for each row
  when (
    old.phone is distinct from new.phone
    or old.email is distinct from new.email
    or old.email_confirmed_at is distinct from new.email_confirmed_at
  )
  execute function public.sync_auth_identity_to_users();
