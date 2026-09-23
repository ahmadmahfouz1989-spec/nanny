-- protect_user_role_status() guards role/status/featured_until against the
-- account owner (users_update_own grants any user UPDATE on their own
-- row), but was never extended when email/phone verification landed --
-- email, phone, email_verified_at, and phone_verified_at were all still
-- self-service. auth/me, the admin users list, and the profile page's
-- verified badges all trust these columns, so a direct update could mark
-- an arbitrary phone/email "verified" without ever completing that flow.
--
-- The two legitimate email-verification routes (auth/callback,
-- auth/confirm) wrote email_verified_at through the user's own session
-- client -- switched to the admin client (see those files) so this lock
-- doesn't also break them; verify-phone/confirm already used the admin
-- client for phone/phone_verified_at. contact_phone is a deliberately
-- separate, still-self-service field (shared once matched, never treated
-- as verified) and is untouched here.

create or replace function public.protect_user_role_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'role cannot be changed by the account owner';
  end if;
  if new.status is distinct from old.status then
    raise exception 'status cannot be changed by the account owner';
  end if;
  if new.featured_until is distinct from old.featured_until then
    raise exception 'featured_until is managed by admins only';
  end if;
  if new.email is distinct from old.email then
    raise exception 'email is managed by the auth system only';
  end if;
  if new.phone is distinct from old.phone then
    raise exception 'phone is managed by the verification flow only';
  end if;
  if new.email_verified_at is distinct from old.email_verified_at then
    raise exception 'email_verified_at cannot be set by the account owner';
  end if;
  if new.phone_verified_at is distinct from old.phone_verified_at then
    raise exception 'phone_verified_at cannot be set by the account owner';
  end if;
  return new;
end;
$$;
