-- When nobody covering a delivery's pickup district can take it, the order
-- goes to available riders this close to the pickup, across district lines.
-- 0 turns it off.
alter table public.errand_settings
  add column nearby_fallback_km numeric(5, 1) not null default 10
    check (nearby_fallback_km >= 0 and nearby_fallback_km <= 300);
