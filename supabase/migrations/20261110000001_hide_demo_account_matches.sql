-- The App Store reviewer's demo account (appreview@oui-know.com) no longer
-- shows up for anyone else: the app leaves it out of browse, search, new
-- matches and rider requests (src/lib/hidden-accounts.ts). This removes
-- the match cards it already has with real people, keeping any where a
-- conversation was started so no one's messages disappear.
delete from public.generic_matches m
using public.generic_profiles gp, public.users u
where u.email = 'appreview@oui-know.com'
  and gp.user_id = u.id
  and (m.provider_profile_id = gp.id or m.seeker_profile_id = gp.id)
  and not exists (select 1 from public.generic_messages msg where msg.match_id = m.id);
