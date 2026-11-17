-- Calls that ring like a phone call on the iOS and Android apps (from
-- iOS 1.5 / Android 1.4): an iPhone install also registers a PushKit
-- token (voip_token) for CallKit's incoming-call screen, and an Android
-- install says its app can show a full-screen incoming call
-- (rings_calls). Older installs keep getting an ordinary notification.

alter table public.native_push_tokens
  add column voip_token text unique,
  add column rings_calls boolean not null default false;
