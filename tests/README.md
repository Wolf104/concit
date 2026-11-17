# Concit tests

These run the real app in a headless Chrome against a stand-in backend (`fake.js`), so nothing touches the live database.

1. From the repository root, serve the app: `python3 -m http.server 8765`
2. In this folder: `npm install playwright-core` (once)
3. `node flows.js` walks through sign-up and the tour, plans, group chat, hotspots, events, account and invite links, and reports each flow as ok or FAIL.
4. `node cities.js` checks switching between Milan and Madrid, and that an older database with no city column still works.
5. `node boards.js` checks saving to boards, the board page, sharing by link (logged in and out) and turning a board into a vote.
6. `node monkey.js` taps around at random on several phone sizes and reports JavaScript errors, sideways overflow, empty screens and stray text such as "undefined".

Set `CHROME=/path/to/chrome` if Chrome is not at `/usr/bin/google-chrome`.

Not covered: anything that needs a real phone or the real services (notifications arriving, the bot check, the map tiles, iPhone scrolling behaviour).
