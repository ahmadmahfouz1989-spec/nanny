-- Posts are just text now -- no governorate or day picker in the composer,
-- so the columns backing them are dead. Drop them rather than leave unused
-- schema behind.

alter table public.posts drop column location_id;
alter table public.posts drop column days;
