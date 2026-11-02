# Concit

Pick where to go out with friends. Starting in Milan.

## Run it live

The Supabase database is already set up and `config.js` already points at it.
In Vercel, choose Add New > Project, import this GitHub repository and press Deploy. No build settings are needed.

## Files

- `index.html`, `styles.css`, `app.js`: the app
- `data.js`: Milan hotspots and events
- `config.js`: the Supabase connection
- `supabase/schema.sql`: the database

If `config.js` is left empty, the app still works on one phone, without share links.
