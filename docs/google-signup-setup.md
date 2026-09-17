# Enabling "Continue with Google"

The app code (the button on `/login` and `/signup`, in
`src/components/google-auth-button.tsx`) is already built and calls
`supabase.auth.signInWithOAuth({ provider: "google" })`. Two manual steps
are needed before it works — both require your own Google/Supabase account
access, so they can't be automated from here.

Supabase Auth automatically links a Google sign-in to an existing
email/password account when the emails match and the existing account's
email is verified — no extra "merge accounts" logic needed on our side.

## 1. Create a Google OAuth client

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (create a project first if you don't have one — no billing account needed for this).
2. **OAuth consent screen**: set it up as "External", add the app name/logo, and add your own email as a test user while it's in "Testing" mode (fine for now; only needs Google's review if you exceed 100 users or request sensitive scopes, which we don't).
3. **Credentials → Create Credentials → OAuth client ID** → Application type: "Web application".
4. **Authorized redirect URIs** — add exactly this (Supabase's own callback, not ours):
   ```
   https://bgrylcdkknunlpsxqhtc.supabase.co/auth/v1/callback
   ```
5. Save, and copy the **Client ID** and **Client Secret**.

## 2. Enable the provider in Supabase

1. Supabase Dashboard → your project → **Authentication → Sign In / Providers → Google**.
2. Toggle it on, paste in the Client ID and Client Secret from step 1.
3. Save.

That's it — no migration or redeploy needed, this takes effect immediately.

## Testing locally (optional)

The local dev stack (`supabase start`) has its own `[auth.external.google]`
block in `supabase/config.toml`, disabled by default. To test locally:

1. Create a **separate** Google OAuth client (same steps as above), with
   redirect URI `http://127.0.0.1:54321/auth/v1/callback` instead.
2. Set `enabled = true` and `client_id = "<your client id>"` in
   `supabase/config.toml`'s `[auth.external.google]` block.
3. Export the secret as an env var before starting Supabase:
   `export SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=<your client secret>`
4. `supabase stop && supabase start` to pick up the config change.

Don't commit real client IDs/secrets — keep the local ones as env vars or
revert `config.toml` to `enabled = false` before committing.
