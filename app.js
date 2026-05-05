/* ============================================================
   localStorage utilities
   ============================================================ */
const Store = {
  get(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  },
  set(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  },
  getUsers() { return Store.get('users') || []; },
  saveUsers(users) { Store.set('users', users); },
  getProgress(userId) {
    return Store.get('progress_' + userId) || { userId, words: {} };
  },
  saveProgress(progress) {
    Store.set('progress_' + progress.userId, progress);
  },
};

/* ============================================================
   Word progress helpers
   ============================================================ */
function initWordState() {
  return {
    stage: 1,
    correctStreak: 0,
    wrongCount: 0,
    missTypes: { meaning: 0, listening: 0, spelling: 0 },
    nextReview: 0,
    lastClearedAt: null,
    longTermDue: [],
    history: [],
  };
}

function getWordState(progress, wordId) {
  if (!progress.words[wordId]) {
    progress.words[wordId] = initWordState();
  }
  return progress.words[wordId];
}

function stageMissType(stage) {
  if (stage === 2 || stage === 6) return 'listening';
  if (stage === 4) return 'spelling';
  return 'meaning';
}

const STAGE_ADVANCE_STREAK = { 1: 2, 2: 2, 3: 3, 4: 3, 5: 2 };

const ENEMIES = [
  { emoji: '🐥', name: 'ひよこ' },
  { emoji: '🐸', name: 'かえる' },
  { emoji: '🦊', name: 'きつね' },
  { emoji: '🐺', name: 'おおかみ' },
  { emoji: '🐲', name: 'ドラゴン' },
  { emoji: '👹', name: 'おに' },
  { emoji: '👿', name: 'あくま' },
];

function selectEnemy(progress) {
  const stages = Object.values(progress.words).map(w => w.stage);
  const avg = stages.length ? stages.reduce((a, b) => a + b, 0) / stages.length : 1;
  const idx = Math.max(0, Math.min(Math.floor(avg - 1), ENEMIES.length - 1));
  return ENEMIES[idx];
}

function nextReviewDelay(streak) {
  if (streak >= 3) return 86400000;
  if (streak === 2) return 1800000;
  return 300000;
}

/* ============================================================
   Question generation
   ============================================================ */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDummies(correct, pool, count, field) {
  const others = pool.filter(w => w.id !== correct.id && w[field] !== correct[field]);
  return shuffle(others).slice(0, count);
}

function buildChoices(correct, allWords, field) {
  const sameType = allWords.filter(w => w.type === correct.type);
  let dummies = pickDummies(correct, sameType, 3, field);
  if (dummies.length < 3) {
    const more = pickDummies(correct, allWords.filter(w => w.id !== correct.id), 3 - dummies.length, field);
    dummies = [...dummies, ...more];
  }
  return shuffle([correct, ...dummies.slice(0, 3)]);
}

function buildQuestion(word, stage, allWords, forceStage) {
  const s = forceStage !== undefined ? forceStage : stage;
  const q = { word, stage: s };

  if (s === 1) {
    q.type = 'choice';
    q.prompt = word.text;
    q.choices = buildChoices(word, allWords, 'meaning');
    q.answerField = 'meaning';
    q.stageLabel = 'Stage 1: 英語→日本語';
  } else if (s === 2) {
    q.type = 'listen';
    q.speakText = word.text;
    q.choices = buildChoices(word, allWords, 'meaning');
    q.answerField = 'meaning';
    q.stageLabel = 'Stage 2: 聴いて意味を選ぼう';
  } else if (s === 3) {
    q.type = 'choice';
    q.prompt = word.meaning;
    q.choices = buildChoices(word, allWords, 'text');
    q.answerField = 'text';
    q.stageLabel = 'Stage 3: 日本語→英語';
  } else if (s === 4) {
    q.type = 'input';
    q.prompt = word.meaning;
    q.stageLabel = 'Stage 4: スペルを入力';
  } else if (s === 5) {
    const blanked = word.example.replace(new RegExp('\\b' + word.text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '\\b', 'i'), '___');
    q.type = 'choice';
    q.prompt = blanked;
    q.choices = buildChoices(word, allWords, 'text');
    q.answerField = 'text';
    q.stageLabel = 'Stage 5: 空欄補充';
  } else if (s === 6) {
    q.type = 'listen';
    q.speakText = word.example;
    q.choices = buildChoices(word, allWords, 'meaning');
    q.answerField = 'meaning';
    q.stageLabel = 'Stage 6: 例文を聴いて意味を選ぼう';
  }
  return q;
}

/* ============================================================
   Candidate selection
   ============================================================ */
function selectCandidates(progress, allWords, count, lastWordId) {
  const now = Date.now();

  const longTermOverdue = allWords.filter(w => {
    const ws = getWordState(progress, w.id);
    return ws.longTermDue.some(d => d <= now);
  });

  const ready = allWords.filter(w => {
    const ws = getWordState(progress, w.id);
    return ws.nextReview <= now && !longTermOverdue.includes(w);
  });

  function dominantMissType(ws) {
    const { meaning, listening, spelling } = ws.missTypes;
    const max = Math.max(meaning, listening, spelling);
    if (max === 0) return 'meaning';
    if (meaning === max) return 'meaning';
    if (listening === max) return 'listening';
    return 'spelling';
  }

  function missTypeForStage(stage) { return stageMissType(stage); }

  ready.sort((a, b) => {
    const wa = getWordState(progress, a.id);
    const wb = getWordState(progress, b.id);
    const domA = dominantMissType(wa);
    const domB = dominantMissType(wb);
    const matchA = domA === missTypeForStage(wa.stage) ? 1 : 0;
    const matchB = domB === missTypeForStage(wb.stage) ? 1 : 0;
    if (matchB !== matchA) return matchB - matchA;
    if (wb.wrongCount !== wa.wrongCount) return wb.wrongCount - wa.wrongCount;
    return wa.stage - wb.stage;
  });

  const pool = [...longTermOverdue, ...ready];

  if (pool.length < count) {
    const future = allWords.filter(w => {
      const ws = getWordState(progress, w.id);
      return ws.nextReview > now && !pool.includes(w);
    });
    pool.push(...shuffle(future).slice(0, count - pool.length));
  }

  const filtered = pool.filter(w => w.id !== lastWordId);
  return filtered.slice(0, count);
}

/* ============================================================
   Speech synthesis — best available English voice
   ============================================================ */
let _bestVoice = null;

function _initVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;
  const prefer = ['Samantha', 'Google US English', 'Microsoft Zira', 'Alex', 'Karen'];
  for (const name of prefer) {
    const v = voices.find(v => v.name.includes(name) && v.lang.startsWith('en'));
    if (v) { _bestVoice = v; return; }
  }
  _bestVoice = voices.find(v => v.lang === 'en-US' && v.localService)
            || voices.find(v => v.lang.startsWith('en-US'))
            || voices.find(v => v.lang.startsWith('en'));
}

if (window.speechSynthesis) {
  window.speechSynthesis.addEventListener('voiceschanged', _initVoice);
  _initVoice();
}

function speak(text, rate = 1) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'en-US';
  utt.rate = rate;
  utt.pitch = 1;
  if (_bestVoice) utt.voice = _bestVoice;
  window.speechSynthesis.speak(utt);
}

/* ============================================================
   App state
   ============================================================ */
const App = {
  currentUser: null,
  progress: null,
  battle: null,
};

/* ============================================================
   Screen management
   ============================================================ */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
}

/* ============================================================
   User screen
   ============================================================ */
function renderUserScreen() {
  const users = Store.getUsers();
  const list = document.getElementById('user-list');
  list.innerHTML = '';
  users.forEach(u => {
    const btn = document.createElement('button');
    btn.className = 'user-btn';
    btn.textContent = u.name;
    btn.addEventListener('click', () => startBattle(u));
    list.appendChild(btn);
  });
  showScreen('user');
}

document.getElementById('btn-show-add').addEventListener('click', () => {
  document.getElementById('add-user-form').classList.remove('hidden');
  document.getElementById('input-username').focus();
});

document.getElementById('btn-cancel-add').addEventListener('click', () => {
  document.getElementById('add-user-form').classList.add('hidden');
  document.getElementById('input-username').value = '';
});

document.getElementById('btn-save-user').addEventListener('click', saveNewUser);
document.getElementById('input-username').addEventListener('keydown', e => {
  if (e.key === 'Enter') saveNewUser();
});

function saveNewUser() {
  const name = document.getElementById('input-username').value.trim();
  if (!name) return;
  const users = Store.getUsers();
  const userId = 'user_' + Date.now();
  users.push({ userId, name, createdAt: Date.now() });
  Store.saveUsers(users);
  document.getElementById('input-username').value = '';
  document.getElementById('add-user-form').classList.add('hidden');
  renderUserScreen();
}

/* ============================================================
   Battle initialization
   ============================================================ */
function startBattle(user) {
  App.currentUser = user;
  App.progress = Store.getProgress(user.userId);

  const allWords = window.WORD_DATA;
  const queue = buildBattleQueue(App.progress, allWords);

  App.battle = {
    queue,
    currentIdx: 0,
    playerHP: 100,
    enemyHP: 100,
    combo: 0,
    correct: 0,
    total: 0,
    results: [],
  };

  const enemy = selectEnemy(App.progress);
  document.getElementById('enemy-emoji').textContent = enemy.emoji;
  document.getElementById('battle-username').textContent = user.name;
  showScreen('battle');
  renderQuestion();
}

function buildBattleQueue(progress, allWords) {
  const TOTAL = 10;
  const queue = [];
  const usedIds = new Set();
  let prevWordId = null;
  let prevType = null;

  for (let i = 0; i < TOTAL; i++) {
    const forceListening = (i > 0) && (i % 5 === 4);

    let candidates = selectCandidates(progress, allWords, 20, prevWordId);
    if (candidates.length === 0) candidates = allWords.filter(w => w.id !== prevWordId);
    if (candidates.length === 0) candidates = allWords;

    if (prevType && Math.random() < 0.5) {
      const sameTypeCandidates = candidates.filter(w => w.type === prevType && !usedIds.has(w.id));
      if (sameTypeCandidates.length > 0) candidates = sameTypeCandidates;
    }

    const fresh = candidates.filter(w => !usedIds.has(w.id));
    if (fresh.length > 0) candidates = fresh;

    const word = candidates[0];
    if (!word) break;

    const ws = getWordState(progress, word.id);
    const isLongTerm = ws.longTermDue.some(d => d <= Date.now());

    let stageOverride;
    if (isLongTerm) {
      stageOverride = 1;
    } else if (forceListening) {
      stageOverride = 2;
    }

    queue.push({ word, stageOverride, isLongTerm });
    usedIds.add(word.id);
    prevWordId = word.id;
    prevType = word.type;
  }

  return queue;
}

/* ============================================================
   Render question
   ============================================================ */
function renderQuestion() {
  const b = App.battle;
  if (b.currentIdx >= b.queue.length) {
    endBattle('complete');
    return;
  }

  const entry = b.queue[b.currentIdx];
  const ws = getWordState(App.progress, entry.word.id);
  const q = buildQuestion(entry.word, ws.stage, window.WORD_DATA, entry.stageOverride);
  b.currentQuestion = q;

  document.getElementById('battle-qnum').textContent = `問題 ${b.currentIdx + 1} / ${b.queue.length}`;
  document.getElementById('stage-badge').textContent = q.stageLabel;

  // Question text
  const qtEl = document.getElementById('question-text');
  if (q.type === 'listen') {
    qtEl.textContent = '🔊 音声を聴いて答えよう';
  } else {
    qtEl.innerHTML = '';
    const promptSpan = document.createElement('div');
    promptSpan.textContent = q.prompt;
    qtEl.appendChild(promptSpan);
    if (q.stage === 1) {
      const speakBtn = document.createElement('button');
      speakBtn.className = 'btn-speak-question';
      speakBtn.textContent = '🔊 聞く';
      speakBtn.addEventListener('click', () => speak(q.word.text));
      qtEl.appendChild(speakBtn);
    }
  }

  // Listen buttons
  const listenBtns = document.getElementById('listen-btns');
  if (q.type === 'listen') {
    listenBtns.classList.remove('hidden');
    setTimeout(() => speak(q.speakText, 1), 400);
  } else {
    listenBtns.classList.add('hidden');
  }

  // Choices vs input
  const choicesArea = document.getElementById('choices-area');
  const inputArea = document.getElementById('input-area');

  if (q.type === 'input') {
    choicesArea.classList.add('hidden');
    inputArea.classList.remove('hidden');
    document.getElementById('spell-input').value = '';
    document.getElementById('spell-input').focus();
  } else {
    choicesArea.classList.remove('hidden');
    inputArea.classList.add('hidden');
    const btns = document.querySelectorAll('.choice-btn');
    const englishChoices = q.answerField === 'text';
    btns.forEach((btn, i) => {
      const ch = q.choices[i];
      const displayText = ch ? ch[q.answerField] : '';
      btn.className = 'choice-btn';
      btn.disabled = false;
      btn.dataset.answer = displayText;
      btn.dataset.word = ch ? ch.id : '';
      if (englishChoices && ch) {
        btn.innerHTML = `<span class="choice-label">${displayText}</span><span class="speak-mini" data-text="${displayText}">🔊</span>`;
      } else {
        btn.textContent = displayText;
      }
    });
  }

  // Clear result and hide next button
  document.getElementById('result-display').className = 'result-display hidden';
  document.getElementById('btn-next').classList.add('hidden');

  updateComboDisplay();
  updateHPBars();
}

/* ============================================================
   Answer handling
   ============================================================ */
function checkAnswer(userAnswer) {
  const b = App.battle;
  const q = b.currentQuestion;
  const ws = getWordState(App.progress, q.word.id);

  let isCorrect;
  if (q.type === 'input') {
    isCorrect = userAnswer.trim().toLowerCase() === q.word.text.toLowerCase();
  } else {
    isCorrect = userAnswer === q.word[q.answerField];
  }

  b.total++;
  const entry = b.queue[b.currentIdx];
  const isLongTerm = entry.isLongTerm;
  const effectiveStage = entry.stageOverride !== undefined ? entry.stageOverride : ws.stage;
  const prevStage = ws.stage;

  if (isCorrect) {
    b.correct++;
    b.results.push({ word: q.word, correct: true });

    b.combo++;
    const mult = b.combo >= 5 ? 2.0 : b.combo >= 3 ? 1.5 : 1.0;
    const dmg = Math.floor(10 * mult);
    b.enemyHP = Math.max(0, b.enemyHP - dmg);

    ws.correctStreak++;
    ws.history.push({ result: 'correct', ts: Date.now() });
    if (ws.history.length > 20) ws.history = ws.history.slice(-20);
    ws.nextReview = Date.now() + nextReviewDelay(ws.correctStreak);

    if (isLongTerm) {
      const now = Date.now();
      const idx = ws.longTermDue.findIndex(d => d <= now);
      if (idx !== -1) ws.longTermDue.splice(idx, 1);
    } else {
      const needed = STAGE_ADVANCE_STREAK[ws.stage];
      if (needed !== undefined && ws.correctStreak >= needed && ws.stage < 6) {
        ws.stage++;
        ws.correctStreak = 0;
        if (ws.stage === 6) {
          ws.lastClearedAt = Date.now();
          const base = Date.now();
          ws.longTermDue.push(base + 86400000, base + 7 * 86400000, base + 30 * 86400000);
        }
      }
    }

    if (ws.stage > prevStage) showStageUp(ws.stage);
    showResult(true, dmg, mult);
  } else {
    b.results.push({ word: q.word, correct: false });

    b.combo = 0;
    b.playerHP = Math.max(0, b.playerHP - 10);

    ws.correctStreak = 0;
    ws.wrongCount++;
    const mt = stageMissType(effectiveStage);
    ws.missTypes[mt]++;
    ws.history.push({ result: 'wrong', ts: Date.now() });
    if (ws.history.length > 20) ws.history = ws.history.slice(-20);
    ws.nextReview = 0;

    if (isLongTerm) {
      ws.stage = 3;
      ws.correctStreak = 0;
    } else {
      ws.stage = Math.max(1, ws.stage - 1);
    }

    b.wrongWordToInsert = q.word;
    showResult(false, 10, 1);
  }

  Store.saveProgress(App.progress);
  updateHPBars();
  updateComboDisplay();

  document.querySelectorAll('.choice-btn').forEach(btn => (btn.disabled = true));

  function advanceOrEnd() {
    if (b.playerHP <= 0) { endBattle('lose'); return; }
    if (b.enemyHP <= 0) { endBattle('win'); return; }
    b.currentIdx++;
    if (b.wrongWordToInsert) {
      b.queue.splice(b.currentIdx, 0, { word: b.wrongWordToInsert, stageOverride: undefined, isLongTerm: false });
      b.wrongWordToInsert = null;
    }
    renderQuestion();
  }

  // Show next button; also auto-advance after 2s
  const nextBtn = document.getElementById('btn-next');
  nextBtn.classList.remove('hidden');
  const autoTimer = setTimeout(advanceOrEnd, 2000);
  nextBtn.onclick = () => {
    clearTimeout(autoTimer);
    nextBtn.classList.add('hidden');
    advanceOrEnd();
  };
}

/* ============================================================
   Choice button events
   ============================================================ */
document.querySelectorAll('.choice-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    if (e.target.classList.contains('speak-mini')) {
      speak(e.target.dataset.text);
      return;
    }

    const q = App.battle.currentQuestion;
    const answer = btn.dataset.answer !== undefined ? btn.dataset.answer : btn.textContent;

    if (answer === q.word[q.answerField]) {
      btn.classList.add('correct');
    } else {
      btn.classList.add('wrong');
      document.querySelectorAll('.choice-btn').forEach(b => {
        const bAnswer = b.dataset.answer !== undefined ? b.dataset.answer : b.textContent;
        if (bAnswer === q.word[q.answerField]) b.classList.add('correct');
      });
    }
    checkAnswer(answer);
  });
});

/* ============================================================
   Input submit
   ============================================================ */
document.getElementById('btn-submit-spell').addEventListener('click', submitSpell);
document.getElementById('spell-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitSpell();
});

function submitSpell() {
  const val = document.getElementById('spell-input').value;
  checkAnswer(val);
  document.getElementById('input-area').classList.add('hidden');
}

/* ============================================================
   Listen buttons
   ============================================================ */
document.getElementById('btn-play').addEventListener('click', () => {
  const q = App.battle && App.battle.currentQuestion;
  if (q) speak(q.speakText, 1);
});
document.getElementById('btn-play-slow').addEventListener('click', () => {
  const q = App.battle && App.battle.currentQuestion;
  if (q) speak(q.speakText, 0.7);
});

/* ============================================================
   UI helpers
   ============================================================ */
function showResult(isCorrect, dmg, mult) {
  const rd = document.getElementById('result-display');
  if (isCorrect) {
    const comboStr = mult > 1 ? ` × ${mult} コンボ！` : '';
    rd.textContent = `Correct！ ${dmg}ダメージ${comboStr}`;
    rd.className = 'result-display correct';
  } else {
    rd.textContent = 'Wrong… 10ダメージ受けた';
    rd.className = 'result-display wrong';
  }
}

function showStageUp(newStage) {
  const el = document.getElementById('stage-up-notice');
  el.textContent = `🎉 ステージ ${newStage} にアップ！`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2000);
}

function updateHPBars() {
  const b = App.battle;
  document.getElementById('enemy-hp-num').textContent = b.enemyHP;
  document.getElementById('player-hp-num').textContent = b.playerHP;
  document.getElementById('enemy-hp-bar').style.width = b.enemyHP + '%';
  document.getElementById('player-hp-bar').style.width = b.playerHP + '%';
}

function updateComboDisplay() {
  const b = App.battle;
  const el = document.getElementById('combo-display');
  if (b.combo >= 2) {
    const mult = b.combo >= 5 ? '× 2.0' : b.combo >= 3 ? '× 1.5' : '';
    el.textContent = `${b.combo}連続！ ${mult}`;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

/* ============================================================
   Battle end
   ============================================================ */
function endBattle(reason) {
  const b = App.battle;
  const titleEl = document.getElementById('result-title');
  const scoreEl = document.getElementById('result-score');
  const listEl = document.getElementById('result-word-list');

  if (reason === 'win') {
    titleEl.textContent = '勝利！';
    titleEl.className = 'result-title win';
  } else if (reason === 'lose') {
    titleEl.textContent = '敗北…';
    titleEl.className = 'result-title lose';
  } else {
    titleEl.textContent = b.correct >= b.total / 2 ? '勝利！' : '敗北…';
    titleEl.className = 'result-title ' + (b.correct >= b.total / 2 ? 'win' : 'lose');
  }

  scoreEl.textContent = `正解 ${b.correct} / ${b.total} 問`;

  listEl.innerHTML = '';
  b.results.forEach(r => {
    const item = document.createElement('div');
    item.className = 'result-word-item';
    item.innerHTML = `
      <span class="mark">${r.correct ? '✅' : '❌'}</span>
      <span class="result-word-en">${r.word.text}</span>
      <span class="result-word-ja">${r.word.meaning}</span>
    `;
    listEl.appendChild(item);
  });

  showScreen('result');
}

/* ============================================================
   Result screen buttons
   ============================================================ */
document.getElementById('btn-retry').addEventListener('click', () => {
  startBattle(App.currentUser);
});

document.getElementById('btn-back-user').addEventListener('click', () => {
  renderUserScreen();
});

/* ============================================================
   Init
   ============================================================ */
renderUserScreen();
