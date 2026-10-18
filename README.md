# Eat

Meal planner for Artur, Svetlozara and Evelina: a rolling plan with linked leftovers, a Lidl shopping list, receipts and takeaway spending, and an evening reminder.

Live at https://arturtoros.github.io/meal-planner/

## How it fits together

- **App**: Vite + React + TypeScript, installable on iPhone (Share › Add to Home Screen). Built and published to GitHub Pages on every push to `main`.
- **Data**: one `household` row in Supabase, shared by everyone and saved with a version check so two phones never overwrite each other.
- **Reading photos and links**: the `read` edge function sends receipts, recipe screenshots and recipe pages to Claude (`claude-opus-5-5`, with server-side fallback on). It also picks two new recipe ideas each week.
- **Reminder**: the `remind` edge function runs hourly from `pg_cron` and sends tomorrow's plan as a notification at the hour set in Settings (Sofia time).

## One-time setup

1. **GitHub Pages**: repo Settings › Pages › Source: **GitHub Actions**.
2. **Supabase token for deploys**: in Supabase, Account › Access Tokens › Generate. Add it in this repo under Settings › Secrets and variables › Actions as `SUPABASE_ACCESS_TOKEN`. The deploy then sets up the database (`supabase/setup.sql`) and the edge functions by itself.
3. **Claude key**: in Supabase, Edge Functions › Secrets, add `ANTHROPIC_API_KEY` (from console.anthropic.com). Never paste it anywhere else.
4. **Household login**: in Supabase, Authentication › Users › Add user, with one email and password for the household, and "Auto confirm" on. Everyone signs in with it once per phone.

Re-run the **Deploy** action after steps 2 and 3.

## Developing

```sh
npm install
npm run dev        # uses Supabase from .env.production unless you set VITE_SUPABASE_URL empty
npx vitest run     # planner tests
```

Run `npx vite build --mode offline` for a copy that keeps data in the browser only.
