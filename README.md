# My Watch Shelf — Movie, TV & Anime Tracker

A responsive static watch tracker for GitHub Pages. No backend, account, build system, API key or paid service required.

## Features
- Track Movies, TV Series, Anime Series, Anime Movies and Documentaries
- Large genre library: Anime, Isekai, Shounen, Seinen, Josei, Shoujo, Mecha, Slice of Life, BL, Yuri, Action, Adventure, Comedy, Drama, Fantasy, Horror, Mystery, Romance, Sci-Fi, Sports, Thriller, and many more
- Select multiple genres for each title
- Statuses: Watchlist, Watching, Completed, On hold and Dropped
- Favorites, personal 1–5 star ratings and notes
- Per-season episode counts: enter how many episodes each season has, then track your current season and episode. Marking a series Completed jumps to the last season and episode, and progress % is calculated across all seasons
- Episode and season progress for TV and anime series
- Search, genre/type/status filters, quick genre shortcuts and sorting
- Click any title card to open its interactive detail view
- Quick-add episode, toggle favorite, edit and delete actions
- JSON export/import backup
- Responsive desktop and mobile UI
- Data saved by earlier versions (when the app was called Screenlog) is read automatically
- Undo after deleting, tap-to-rate stars, status dropdown and −/＋ episode buttons in the detail view
- Keyboard accessible (Tab, Enter, Esc, `/` to search) and screen-reader friendly
- Export/Import available on phones too; backups are named with the date
- Step-by-step Add/Edit wizard with poster upload (images are resized in the browser)

## Run locally
Open `index.html` or run `python -m http.server 8000` and visit `http://localhost:8000`.

## Deploy to GitHub Pages
1. Create a GitHub repository, e.g. `my-watch-shelf`.
2. Upload `index.html`, `style.css`, `app.js`, and `README.md` to the repository root.
3. Open **Settings → Pages**.
4. Select **Deploy from a branch**, choose `main` and `/ (root)`, then save.
5. Wait for GitHub Pages to publish: `https://YOUR-USERNAME.github.io/my-watch-shelf/`.

## Data & privacy
Your library is saved in the browser's localStorage, so it stays on the device and browser you use. It does not sync by itself. To move it to another browser or phone, use **Export backup** (top bar, or the phone menu) to download a file, then **Import backup** in the other browser. Export backups regularly as a safety net. Importing a backup replaces the current library.

## Notes
- Genres are selectable multi-tags, not exclusive categories.
- Poster images are optional: paste a link or upload your own. The app does not scrape or fetch copyrighted posters automatically.
- This version intentionally uses no third-party movie database API.
