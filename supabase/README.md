# Supabase setup

The app uses Supabase email/password authentication and owner-only row-level security. It uses a private Storage bucket for wardrobe images.

1. Enable the **Email** provider in Supabase Authentication. Configure your site URL and email confirmation behavior.
2. Run **schema.sql** in the project's SQL Editor. This creates the clothing and outfit tables, RLS policies, private image bucket, and per-user Storage policies.
3. Set the project's URL and publishable key in **config.js**. Never put a service-role/secret key in browser code.
4. Users must sign in before the app loads their closet and stylist.
