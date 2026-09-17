/* =============================================================================
   QUIZ APP - server.js
   Simple multi-player quiz with 3 question types + live-ish admin panel.
   No database - everything lives in memory (fine for a live event / demo).
   Restarting the server wipes all players & scores.
============================================================================= */

const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

/* =============================================================================
   1) QUESTIONS CONFIG -- EDIT EVERYTHING HERE
   =============================================================================
   Three question "type"s are supported. To add/remove/change questions just
   edit this array - nothing else in the file needs to change.

   TYPE "matching"
     { type: 'matching', question: '...', pairs: [ {left, right}, ... 5 of them ] }
     -> Scored 1 point per correctly matched pair (max 5 pts/question).

   TYPE "flag"
     { type: 'flag', word: '...', options: [ {country, flag}, ... 4 of them ], correct: 'CountryName' }
     -> Scored 1 point if the chosen country matches `correct`.
     -> `flag` can be an emoji (as below) or swap it for an <img> path if you'd rather use real flag images.

   TYPE "oddone"
     { type: 'oddone', words: [ '...', 5 words ], correct: 'wordThatDoesNotBelong' }
     -> Scored 1 point if the chosen word matches `correct`.

   Order in this array = order questions are asked in. Mix types however you like.
============================================================================= */

const QUESTIONS = [

  // ---------------- MATCHING (5) ----------------
  {
    type: 'matching',
    question: 'Համապատասխանեցնել փոխառությունները:',
    pairs: [
      { left: 'Ալիբի', right: 'Այլուրեքություն' },
      { left: 'Ակադեմիա', right: 'Կաճառ' },
      { left: 'Կոմունիստ', right: 'Համայնավար' },
      { left: 'Կոմպոզիտոր', right: 'Երգահան' },
      { left: 'Արժենիշ', right: 'Կրեդիտ' }
    ]
  },
  {
    type: 'matching',
    question: 'Համապատասխանեցնել փոխառությունները:',
    pairs: [
      { left: 'Գրանտ', right: 'Դրամաշնորհ' },
      { left: 'Կոնցեպցիա', right: 'Հայեցակարգ' },
      { left: 'Մոդուլ', right: 'Գործակից' },
      { left: 'Ավիաբազա', right: 'Օդահենակետ' },
      { left: 'Էֆտանազիա', right: 'Բարեսպանություն' }
    ]
  },

  // ---------------- FLAG / COUNTRY (5) ----------------
  {
    type: 'flag',
    word: 'Աշխարհ',
    options: [
      { country: 'Իրան', flag: '🇮🇷' },
      { country: 'Հայաստան', flag: '🇦🇲' },
      { country: 'Հունաստան', flag: '🇬🇷' },
      { country: 'Թուրքիա', flag: '🇹🇷' }
    ],
    correct: 'Իրան'
  },
  {
    type: 'flag',
    word: 'Տոպրակ',
    options: [
      { country: 'Իրան', flag: '🇮🇷' },
      { country: 'Ասորեստան', flag: '?' }, // no dedicated emoji exists, see note
      { country: 'Թուրքիա', flag: '🇹🇷' },
      { country: 'Հայաստան', flag: '🇦🇲' }
    ],
    correct: 'Թուրքիա'
  },
  {
    type: 'flag',
    word: 'Առնետ',
    options: [
      { country: 'Ասորեստան', flag: '?' },
      { country: 'Թուրքիա', flag: '🇹🇷' },
      { country: 'Հունաստան', flag: '🇬🇷' },
      { country: 'Հայաստան', flag: '🇦🇲' }
    ],
    correct: 'Ասորեստան'
  },
  {
    type: 'flag',
    word: 'Խմոր',
    options: [
      { country: 'Ասորեստան', flag: '?' },
      { country: 'Ղազախստան', flag: '🇰🇿' },
      { country: 'Վրաստան', flag: '🇬🇪' },
      { country: 'Հայաստան', flag: '🇦🇲' }
    ],
    correct: 'Ասորեստան'
  },
  {
    type: 'flag',
    word: 'Գանձ',
    options: [
      { country: 'Ասորեստան', flag: '?' },
      { country: 'Իրան', flag: '🇮🇷' },
      { country: 'Վրաստան', flag: '🇬🇪' },
      { country: 'Հայաստան', flag: '🇦🇲' }
    ],
    correct: 'Իրան'
  },

  // ---------------- ODD ONE OUT (5) ----------------
  {
    type: 'oddone',
    words: ['Մայր', 'Արև', 'Շուն', 'Շղթա', 'Երկիր'],
    correct: 'Շղթա'
  },
  {
    type: 'oddone',
    words: ['Աման', 'Ափսե', 'Մանուշակ', 'Տոն', 'Գիրք'],
    correct: 'Աման'
  },
  {
    type: 'oddone',
    words: ['Պարոն', 'Դուստր', 'Որդի', 'Հայր', 'Տիկին'],
    correct: 'Happy'
  },
  {
    type: 'oddone',
    words: ['Եպիսկոպոս', 'Հոգի', 'Աղոթք', 'Աստված', 'Աղոթատուն'],
    correct: 'Եպիսկոպոս'
  },
  {
    type: 'oddone',
    words: ['Մետաքս', 'Թել', 'Մորթի', 'Գործվածք', 'Վուշ'],
    correct: 'Մետաքս'
  }
];

// Max points a single question of each type is worth.
// (matching = number of pairs, everything else = 1). Used to compute MAX_SCORE below.
function questionMaxPoints(q) {
  return q.type === 'matching' ? q.pairs.length : 1;
}

const MAX_SCORE = QUESTIONS.reduce((sum, q) => sum + questionMaxPoints(q), 0);

/* =============================================================================
   2) APP SETUP
============================================================================= */

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true })); // parse form posts
app.use(express.json());

app.use(session({
  secret: 'change-this-secret-in-production',
  resave: false,
  saveUninitialized: true
}));

/* =============================================================================
   3) IN-MEMORY PLAYER STORE
   Map<sessionId, player>
   player = { name, score, currentIndex, finished, answers: [] }
   Multiple people can play at once because each browser gets its own
   session cookie/id, so each has their own entry in this Map.
============================================================================= */

const players = new Map();

function getPlayer(req) {
  return players.get(req.session.id);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* =============================================================================
   4) PLAYER ROUTES
============================================================================= */

// Landing page. Ask for name, or resume/show result if they already played.
app.get('/', (req, res) => {
  const player = getPlayer(req);

  if (player && player.finished) {
    return res.render('home', { stage: 'done', player, maxScore: MAX_SCORE });
  }
  if (player && !player.finished) {
    return res.redirect('/quiz');
  }
  res.render('home', { stage: 'name' });
});

// Name submitted -> create a fresh player and start the quiz.
app.post('/start', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.redirect('/');

  players.set(req.session.id, {
    name,
    score: 0,
    currentIndex: 0,
    finished: false,
    answers: []
  });

  res.redirect('/quiz');
});

// Show the current question (one question per page).
app.get('/quiz', (req, res) => {
  const player = getPlayer(req);
  if (!player) return res.redirect('/');

  if (player.finished || player.currentIndex >= QUESTIONS.length) {
    player.finished = true;
    return res.render('home', { stage: 'done', player, maxScore: MAX_SCORE });
  }

  const question = QUESTIONS[player.currentIndex];

  // For matching questions, shuffle the right-hand column so it's not a 1:1 visual order.
  const rightShuffled = question.type === 'matching'
    ? shuffle(question.pairs.map(p => p.right))
    : null;

  res.render('home', {
    stage: 'question',
    question,
    rightShuffled,
    index: player.currentIndex,
    total: QUESTIONS.length,
    player
  });
});

// Handle a submitted answer, score it, move to the next question.
app.post('/answer', (req, res) => {
  const player = getPlayer(req);
  if (!player) return res.redirect('/');
  if (player.finished) return res.redirect('/quiz');

  const question = QUESTIONS[player.currentIndex];
  const body = req.body || {};
  let earned = 0;

  if (question.type === 'matching') {
    // Hidden inputs are added client-side as "Left::Right" for every pair the user made.
    let submitted = body.pairs || [];
    if (!Array.isArray(submitted)) submitted = [submitted];

    submitted.forEach(pairStr => {
      const [left, right] = String(pairStr).split('::');
      const correctPair = question.pairs.find(p => p.left === left);
      if (correctPair && correctPair.right === right) earned += 1;
    });
  } else if (question.type === 'flag' || question.type === 'oddone') {
    if (body.answer === question.correct) earned = 1;
  }

  player.score += earned;
  player.answers.push({ questionIndex: player.currentIndex, earned });
  player.currentIndex += 1;

  if (player.currentIndex >= QUESTIONS.length) {
    player.finished = true;
  }

  res.redirect('/quiz');
});

/* =============================================================================
   5) ADMIN ROUTES
   Simple live-ish view: the admin page auto-refreshes itself every few
   seconds (see views/admin.ejs) and re-renders straight from the `players`
   Map, so it always shows current standings.
============================================================================= */

app.get('/admin', (req, res) => {
  const list = Array.from(players.values())
    .sort((a, b) => b.score - a.score); // highest score first

  res.render('admin', {
    players: list,
    maxScore: MAX_SCORE,
    totalQuestions: QUESTIONS.length
  });
});

/* =============================================================================
   6) START SERVER
============================================================================= */

app.listen(PORT, () => {
  console.log(`Quiz app running at http://localhost:${PORT}`);
  console.log(`Admin panel at      http://localhost:${PORT}/admin`);
});