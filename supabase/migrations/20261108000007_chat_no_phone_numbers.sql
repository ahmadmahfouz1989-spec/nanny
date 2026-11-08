-- Phone numbers stay out of chat. The app checks every message first, with
-- the full rules (spelled-out numbers, numbers split over two messages --
-- see src/lib/content-filter.ts); this is the backstop for a message
-- written straight to the table: a Lebanese mobile or landline number,
-- with or without +961 / 00961 / a leading 0, in Western or Arabic digits,
-- with spaces, dots, dashes or slashes in between. Thousands written with
-- commas ("3,500,000 LBP") are prices, not numbers, and are left alone.

create or replace function public.message_has_lebanese_phone(p_body text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  t text;
  run text;
begin
  if p_body is null then
    return false;
  end if;
  t := translate(p_body, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  -- Prices with comma thousands.
  t := regexp_replace(t, '[0-9]{1,3}(,[0-9]{3})+', ' x ', 'g');
  for run in select m[1] from regexp_matches(t, '(\+?[0-9](?:[ .\-/()]{0,3}[0-9]){6,})', 'g') as m loop
    run := regexp_replace(run, '[^0-9]', '', 'g');
    if run ~ '^(00961|961)?0?(3[0-9]{6}|7[0-9][0-9]{6}|81[0-9]{6}|[1-9][0-9]{6})$' then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

create or replace function public.block_phone_in_messages()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and public.message_has_lebanese_phone(new.body) then
    raise exception 'phone_number: phone numbers can''t be shared in chat';
  end if;
  return new;
end;
$$;

drop trigger if exists generic_messages_no_phone on public.generic_messages;
create trigger generic_messages_no_phone
  before insert on public.generic_messages
  for each row execute function public.block_phone_in_messages();
