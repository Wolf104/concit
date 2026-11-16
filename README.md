# Concit

Pick where to go out with friends. Starting in Milan.

## Run it live

The Supabase database is already set up and `config.js` already points at it.
In Vercel, choose Add New > Project, import this GitHub repository and press Deploy. No build settings are needed.

## Files

- `index.html`, `styles.css`, `app.js`: the app
- `data.js`: Milan events and the sights list, plus a backup copy of the hotspots
- Hotspots live in the Supabase `places` table, so you can edit them there
- `config.js`: the Supabase connection and the public notification key
- `sw.js`, `api/push.js`, `package.json`: phone notifications. `api/push.js` needs `VAPID_PRIVATE_KEY` and `PUSH_SECRET` set in Vercel, and `supabase/push.sql` run in the database
- `manifest.webmanifest`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`: lets people add Concit to their phone's home screen
- `supabase/schema.sql` and `supabase/accounts.sql`: the database, run in that order. The other `.sql` files in `supabase/` add later features (group photos and so on)
- `supabase/seed/`: the place import from November 2026 and the list of websites added on 16 Nov 2026

## What's in the app

- **Home**: start a plan, your plans, places open now, upcoming events, sights to see, your groups
- **Decide**: make a plan and vote on it with a group
- **Hotspots**: every place, as a list or a map
- **Events**: what's on in Milan
- **Groups**: your groups and their chats, with plan cards, replies, reactions and photos. Tap a group's name in its chat for members, invites, renaming and muting
- A first-run tutorial, which can be replayed from Your account

If `config.js` is left empty, the app still works on one phone, without share links.
