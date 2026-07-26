# CourseCraft Web

The full web companion for CourseCraft. It is a student-first academic tracker with optional
advisor coaching and uses the same Supabase project as the Android app.

Before enabling sign-up, apply the SQL migrations in the Android repository's
`supabase/migrations/` directory. `0002_auth_profile_bootstrap.sql` creates every account profile
and creates a private space automatically for student accounts.

## Local development

Copy `.env.example` to `.env.local`, set the Supabase URL and anonymous key, then run:

```bash
npm install
npm run dev
```

## Deployment

GitHub Pages deploys from `working-branch`. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` as GitHub
Actions repository secrets before the production rollout. They are exposed to Vite only as the
public browser values `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; do not place a Supabase
service-role key in this repository or in GitHub Pages secrets.
