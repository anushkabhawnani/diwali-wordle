# Wordle (new word every 10 minutes)

A Wordle clone where the answer changes every 10 minutes instead of daily. No build step, no dependencies.

## Run it

The game loads its word lists with `fetch()`, and browsers block that when you double-click `index.html` (a `file://` page). Run a tiny local server instead, using any one of these:

- **VS Code:** install the "Live Server" extension, right-click `index.html`, choose "Open with Live Server".
- **Python:** `python3 -m http.server 8000` in this folder, then open http://localhost:8000
- **Node:** `npx serve`

If you host it (GitHub Pages, Netlify, etc.) it just works.

## Files

| File | What it is |
| --- | --- |
| `index.html` | page structure |
| `style.css` | styling; theme colors are CSS variables at the top |
| `script.js` | game logic, loading the word lists, the 10-minute rotation |
| `words.txt` | every word accepted as a guess (one per line) |
| `answers.txt` | words that can become the answer (one per line) |

## How the word rotates

`script.js` turns the clock into a slot number (`Math.floor(Date.now() / 600000)`), seeds a small random generator with it, and picks a word from `answers.txt`. Everyone gets the same word in the same 10-minute window.

## Things to edit

- **More answers / fewer repeats:** add lines to `answers.txt`. Changing this file changes which word each slot picks.
- **Allowed guesses:** add or remove lines in `words.txt`. Answers are always accepted as guesses too.
- **Window length:** `SLOT_MS` at the top of `script.js`.
- **Colors and sizes:** CSS variables at the top of `style.css`.

## Note

The answer is computed in the browser, so it can be found with dev tools. To prevent that, move the word selection and guess grading to a backend.
