/* ==========================================================
   Wordle: a new word every 10 minutes
   ----------------------------------------------------------
   - answers.txt : words that can become the answer
   - words.txt   : every word accepted as a guess
   Both files hold one 5-letter word per line.
   ========================================================== */

// ---------- Settings ----------
const SLOT_MS = 10 * 60 * 1000; // how long each word lasts
const WORD_LENGTH = 5;
const MAX_GUESSES = 6;
const KEYS = { game: "wordle10:game", stats: "wordle10:stats" };

const $ = (id) => document.getElementById(id);

// ---------- Word lists ----------
let answerWords = []; // possible answers
let validWords = new Set(); // allowed guesses
let wordsReady = false;

async function loadWordFile(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path}`);
  const text = await response.text();
  return text
    .split(/\r?\n/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => /^[a-z]{5}$/.test(word));
}

// ---------- Picking the word from the clock ----------
// The slot number goes up by 1 every 10 minutes, for everyone at once.
const getSlot = () => Math.floor(Date.now() / SLOT_MS);

// Small seeded random generator: the same seed always gives the same numbers.
function seededRandom(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickAnswer(slot) {
  const random = seededRandom(slot);
  random(); // skip the first value, it is too similar between close seeds
  return answerWords[Math.floor(random() * answerWords.length)];
}

// ---------- Saving to localStorage ----------
function loadJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch (error) {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // storage unavailable (private mode, etc.): the game still works
  }
}

// ---------- Game state ----------
let game = loadJSON(KEYS.game, null); // { slot, guesses, current, done, won }
let stats = loadJSON(KEYS.stats, {
  played: 0,
  wins: 0,
  streak: 0,
  maxStreak: 0,
  distribution: [0, 0, 0, 0, 0, 0],
});
let currentSlot;
let answer;
let isRevealing = false; // true while tiles are flipping

function startRound() {
  const wasMidGame =
    game && game.slot !== getSlot() && (game.guesses.length || game.current);

  currentSlot = getSlot();
  answer = pickAnswer(currentSlot);
  isRevealing = false;

  if (!game || game.slot !== currentSlot) {
    // An unfinished game that timed out counts as a loss
    if (game && !game.done && game.guesses.length) {
      stats.played++;
      stats.streak = 0;
      saveJSON(KEYS.stats, stats);
    }
    game = {
      slot: currentSlot,
      guesses: [],
      current: "",
      done: false,
      won: false,
    };
    saveJSON(KEYS.game, game);
  }

  buildBoard();
  if (wasMidGame) showToast("New word!");
}

// ---------- Grading ----------
// Returns an array like ["correct", "absent", "present", ...]
function gradeGuess(guess) {
  const result = Array(WORD_LENGTH).fill("absent");
  const leftover = {}; // answer letters not matched exactly

  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === answer[i]) {
      result[i] = "correct";
    } else {
      leftover[answer[i]] = (leftover[answer[i]] || 0) + 1;
    }
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] !== "correct" && leftover[guess[i]] > 0) {
      result[i] = "present";
      leftover[guess[i]]--;
    }
  }
  return result;
}

// ---------- Drawing the board and keyboard ----------
function buildBoard() {
  const board = $("board");
  board.innerHTML = "";

  for (let r = 0; r < MAX_GUESSES; r++) {
    const row = document.createElement("div");
    row.className = "row";
    for (let c = 0; c < WORD_LENGTH; c++) {
      const tile = document.createElement("div");
      tile.className = "t";
      row.appendChild(tile);
    }
    board.appendChild(row);
  }

  game.guesses.forEach((guess, r) => {
    const result = gradeGuess(guess);
    [...board.children[r].children].forEach((tile, c) => {
      tile.textContent = guess[c];
      tile.dataset.s = result[c];
    });
  });

  paintCurrentRow();
  paintKeyboard();
  $("modal").hidden = true;
  if (game.done) setTimeout(() => showModal(true), 400);
}

function paintCurrentRow() {
  const r = game.guesses.length;
  if (r >= MAX_GUESSES) return;
  [...$("board").children[r].children].forEach((tile, c) => {
    tile.textContent = game.current[c] || "";
    tile.dataset.s = game.current[c] ? "filled" : "";
  });
}

function paintKeyboard() {
  const rank = { absent: 1, present: 2, correct: 3 };
  const best = {}; // best result seen for each letter

  game.guesses.forEach((guess) => {
    gradeGuess(guess).forEach((state, i) => {
      const letter = guess[i];
      if (!best[letter] || rank[state] > rank[best[letter]])
        best[letter] = state;
    });
  });

  document.querySelectorAll(".k[data-k]").forEach((key) => {
    if (best[key.dataset.k]) key.dataset.s = best[key.dataset.k];
    else delete key.dataset.s;
  });
}

function buildKeyboard() {
  // "+" = Enter, "-" = Backspace
  ["qwertyuiop", "asdfghjkl", "+zxcvbnm-"].forEach((letters, rowIndex) => {
    const row = document.createElement("div");
    row.className = "kr";
    if (rowIndex === 1)
      row.insertAdjacentHTML("beforeend", '<div class="h"></div>');

    [...letters].forEach((char) => {
      const key = document.createElement("button");
      key.className = "k";
      if (char === "+") {
        key.textContent = "Enter";
        key.classList.add("w");
        key.onclick = () => pressKey("Enter");
      } else if (char === "-") {
        key.textContent = "⌫";
        key.classList.add("w");
        key.onclick = () => pressKey("Backspace");
      } else {
        key.textContent = char;
        key.dataset.k = char;
        key.onclick = () => pressKey(char);
      }
      row.appendChild(key);
    });

    if (rowIndex === 1)
      row.insertAdjacentHTML("beforeend", '<div class="h"></div>');
    $("kb").appendChild(row);
  });
}

// ---------- Input ----------
function pressKey(key) {
  if (!wordsReady || game.done || isRevealing) return;

  if (key === "Enter") return submitGuess();
  if (key === "Backspace") {
    game.current = game.current.slice(0, -1);
  } else if (/^[a-z]$/.test(key) && game.current.length < WORD_LENGTH) {
    game.current += key;
  }
  paintCurrentRow();
}

function shakeRow() {
  const row = $("board").children[game.guesses.length];
  row.classList.remove("shake");
  void row.offsetWidth; // restart the animation
  row.classList.add("shake");
}

function submitGuess() {
  if (game.current.length < WORD_LENGTH) {
    shakeRow();
    return showToast("Not enough letters");
  }
  if (!validWords.has(game.current)) {
    shakeRow();
    return showToast("Not in word list");
  }

  const guess = game.current;
  const rowIndex = game.guesses.length;
  const result = gradeGuess(guess);
  const tiles = [...$("board").children[rowIndex].children];
  const roundAtSubmit = currentSlot;

  game.guesses.push(guess);
  game.current = "";
  saveJSON(KEYS.game, game);
  isRevealing = true;

  // Flip the tiles one by one, switching colour at the halfway point
  tiles.forEach((tile, i) => {
    setTimeout(() => tile.classList.add("flip"), i * 300);
    setTimeout(
      () => {
        tile.dataset.s = result[i];
      },
      i * 300 + 250,
    );
  });

  setTimeout(
    () => {
      if (roundAtSubmit !== currentSlot) return; // a new word started meanwhile
      finishReveal(guess, rowIndex, tiles);
    },
    WORD_LENGTH * 300 + 300,
  );
}

function finishReveal(guess, rowIndex, tiles) {
  isRevealing = false;
  paintKeyboard();

  if (guess === answer) {
    game.done = game.won = true;
    stats.played++;
    stats.wins++;
    stats.streak++;
    stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
    stats.distribution[rowIndex]++;
    tiles.forEach((tile, i) =>
      setTimeout(() => tile.classList.add("bounce"), i * 100),
    );
    const praise = [
      "Genius",
      "Magnificent",
      "Impressive",
      "Splendid",
      "Great",
      "Phew",
    ];
    showToast(praise[rowIndex], 2000);
  } else if (rowIndex === MAX_GUESSES - 1) {
    game.done = true;
    stats.played++;
    stats.streak = 0;
    showToast(answer.toUpperCase(), 4000);
  }

  saveJSON(KEYS.game, game);
  saveJSON(KEYS.stats, stats);
  if (game.done) setTimeout(() => showModal(true), 1600);
}

// ---------- Toasts and the stats popup ----------
function showToast(message, duration = 1500) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  $("toasts").prepend(toast);
  setTimeout(() => toast.remove(), duration);
}

function formatTime(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function showModal(gameJustEnded) {
  $("mt").textContent = gameJustEnded
    ? game.won
      ? "You won!"
      : "Better luck next time"
    : "Statistics";
  $("ma").hidden = !(gameJustEnded && game.done);
  $("ma").textContent = answer;

  const winPercent = stats.played
    ? Math.round((stats.wins / stats.played) * 100)
    : 0;
  $("mn").innerHTML = [
    [stats.played, "Played"],
    [winPercent, "Win %"],
    [stats.streak, "Current streak"],
    [stats.maxStreak, "Max streak"],
  ]
    .map(([value, label]) => `<div>${value}<small>${label}</small></div>`)
    .join("");

  const most = Math.max(1, ...stats.distribution);
  const winningRow = game.done && game.won ? game.guesses.length - 1 : -1;
  $("md").innerHTML = stats.distribution
    .map((count, i) => {
      const width = Math.max(8, (count / most) * 100);
      const highlight = i === winningRow ? "hi" : "";
      return `<div class="dr"><i>${i + 1}</i><span class="${highlight}" style="width:${width}%">${count}</span></div>`;
    })
    .join("");

  $("modal").hidden = false;
}

// ---------- Event listeners ----------
document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === "Escape") {
    $("modal").hidden = true;
    return;
  }
  if (!$("modal").hidden) return; // ignore typing while the popup is open
  pressKey(event.key.length === 1 ? event.key.toLowerCase() : event.key);
});

$("bs").onclick = () => showModal(false);
$("bx").onclick = () => ($("modal").hidden = true);
$("modal").onclick = (event) => {
  if (event.target.id === "modal") $("modal").hidden = true;
};
$("bt").onclick = () => {
  const root = document.documentElement;
  const isDark = root.dataset.theme
    ? root.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = isDark ? "light" : "dark";
};

// ---------- Clock: countdown and 10-minute rollover ----------
setInterval(() => {
  const timeLeft = SLOT_MS - (Date.now() % SLOT_MS);
  $("tm").textContent = formatTime(timeLeft);
  $("mtm").textContent = formatTime(timeLeft);
  if (wordsReady && getSlot() !== currentSlot) startRound();
}, 250);

// ---------- Start ----------
async function init() {
  buildKeyboard();
  try {
    const [answers, valid] = await Promise.all([
      loadWordFile("answers.txt"),
      loadWordFile("words.txt"),
    ]);
    answerWords = answers;
    validWords = new Set([...valid, ...answers]);
    wordsReady = true;
    startRound();
  } catch (error) {
    console.error(error);
    showToast(
      "Couldn’t load the word lists. Run this with a local server (see README).",
      10000,
    );
  }
}

init();
