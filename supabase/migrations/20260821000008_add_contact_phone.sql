-- Self-reported contact phone number, collected in profile onboarding for
-- display purposes once a match goes mutual — distinct from auth's `phone`
-- column (login identity, not currently collected since phone signup was
-- removed), so no uniqueness/verification constraints apply here.

alter table public.users add column contact_phone text;
