# CourseCraft Web

The full web companion for CourseCraft. It is a student-first academic tracker with optional
advisor coaching and uses the same Supabase project as the Android app.

## Local development

Copy `.env.example` to `.env.local`, set the Supabase URL and anonymous key, then run:

```bash
npm install
npm run dev
```

## Deployment

GitHub Pages deploys from `working-branch`. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` as GitHub
Actions repository secrets before the production rollout.
