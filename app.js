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
    return Store.get('progress_' + userId) || { userId, words: {}, gameStage: 1 };
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

const STAGE_ADVANCE_STREAK = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 1 };

const ENEMIES = [
  { name: 'コイキング', pokeId: 129 },
  { name: 'ピカチュウ', pokeId: 25  },
  { name: 'フシギバナ', pokeId: 3   },
  { name: 'リザードン', pokeId: 6   },
  { name: 'カイリュー', pokeId: 149 },
  { name: 'ミュウツー', pokeId: 150 },
];

function selectEnemy(gameStage) {
  const idx = Math.max(0, Math.min(gameStage - 1, ENEMIES.length - 1));
  return ENEMIES[idx];
}

function nextReviewDelay(streak) {
  if (streak >= 3) return 86400000;
  if (streak === 2) return 3600000;
  return 0;
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
   Speech synthesis
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
   Audio system (Web Audio API)
   ============================================================ */
let _audioCtx = null;
let _bgmPlaying = false;
let _bgmNextLoop = 0;

function _getAudio() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function _playNote(ctx, freq, start, dur, type, vol) {
  if (!freq || freq <= 0) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.15, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur * 0.88);
    osc.start(start);
    osc.stop(start + dur);
  } catch (e) {}
}

function sfxAttack() {
  try {
    const ctx = _getAudio();
    const t = ctx.currentTime;
    _playNote(ctx, 880, t,        0.04, 'square',   0.25);
    _playNote(ctx, 660, t + 0.04, 0.06, 'square',   0.20);
    _playNote(ctx, 440, t + 0.09, 0.08, 'sawtooth', 0.12);
  } catch (e) {}
}

function sfxWrong() {
  try {
    const ctx = _getAudio();
    const t = ctx.currentTime;
    _playNote(ctx, 220, t,        0.13, 'sawtooth', 0.20);
    _playNote(ctx, 175, t + 0.13, 0.20, 'sawtooth', 0.12);
  } catch (e) {}
}

function sfxLevelUp() {
  try {
    const ctx = _getAudio();
    const t = ctx.currentTime;
    [[523, 0], [659, 0.11], [784, 0.22], [1047, 0.33],
     [784, 0.50], [880, 0.61], [1047, 0.72]
    ].forEach(([f, d]) => _playNote(ctx, f, t + d, 0.12, 'square', 0.28));
  } catch (e) {}
}

function sfxStageClear() {
  try {
    const ctx = _getAudio();
    const t = ctx.currentTime;
    [[523, 0], [659, 0.15], [784, 0.30], [523, 0.45],
     [659, 0.60], [784, 0.75], [1047, 0.90]
    ].forEach(([f, d]) => _playNote(ctx, f, t + d, 0.13, 'square', 0.30));
  } catch (e) {}
}

// BGM: simple 8-bit battle melody
const _BGM = [
  [659,0.2],[587,0.2],[523,0.2],[587,0.2], [659,0.2],[659,0.2],[659,0.4],
  [587,0.2],[587,0.2],[698,0.2],[587,0.2], [523,0.2],[587,0.2],[523,0.4],
  [659,0.2],[784,0.2],[880,0.2],[784,0.2], [659,0.2],[587,0.2],[659,0.4],
  [494,0.2],[523,0.2],[587,0.2],[659,0.2], [659,0.8],
];
const _BGM_DUR = _BGM.reduce((s, [, d]) => s + d, 0);

function startBGM() {
  if (_bgmPlaying) return;
  _bgmPlaying = true;
  try {
    _bgmNextLoop = _getAudio().currentTime + 0.1;
    _scheduleBGM();
  } catch (e) { _bgmPlaying = false; }
}

function stopBGM() {
  _bgmPlaying = false;
}

function _scheduleBGM() {
  if (!_bgmPlaying) return;
  try {
    const ctx = _getAudio();
    let t = _bgmNextLoop;
    _BGM.forEach(([freq, dur]) => {
      _playNote(ctx, freq, t, dur * 0.80, 'square', 0.07);
      t += dur;
    });
    _bgmNextLoop += _BGM_DUR;
    const delay = (_bgmNextLoop - ctx.currentTime) * 1000 - 200;
    setTimeout(() => _scheduleBGM(), Math.max(0, delay));
  } catch (e) {}
}

/* ============================================================
   Enemy hit animation + floating damage number
   ============================================================ */
function playEnemyHit(dmg) {
  const img = document.getElementById('enemy-img');
  img.classList.remove('enemy-hit');
  void img.offsetWidth;
  img.classList.add('enemy-hit');
  setTimeout(() => img.classList.remove('enemy-hit'), 600);

  const area = document.getElementById('enemy-area');
  const popup = document.createElement('div');
  popup.className = 'damage-popup';
  popup.textContent = `-${dmg}`;
  popup.style.left = (38 + Math.random() * 22) + '%';
  popup.style.top  = (42 + Math.random() * 14) + '%';
  area.appendChild(popup);
  setTimeout(() => popup.remove(), 1200);
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
  stopBGM();
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
  if (!App.progress.gameStage) App.progress.gameStage = 1;

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
    wordsToComplete: new Set(queue.map(e => e.word.id)),
    wordsCompleted: new Set(),
    wrongWordToInsert: null,
  };

  const enemy = selectEnemy(App.progress.gameStage);
  const imgEl = document.getElementById('enemy-img');
  imgEl.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${enemy.pokeId}.png`;
  imgEl.alt = enemy.name;
  document.getElementById('enemy-name').textContent = enemy.name;

  document.getElementById('battle-username').textContent = user.name;
  document.getElementById('stage-clear-overlay').classList.add('hidden');
  showScreen('battle');
  startBGM();
  renderQuestion();
}

function buildBattleQueue(progress, allWords) {
  const gameStage = progress.gameStage || 1;
  const totalWords = allWords.length;
  const batchStart = ((gameStage - 1) * 10) % totalWords;
  const batch = allWords.slice(batchStart, batchStart + 10);
  if (batch.length < 10) {
    batch.push(...allWords.slice(0, 10 - batch.length));
  }
  return batch.map(word => ({ word, stageOverride: undefined, isLongTerm: false }));
}

/* ============================================================
   Render question
   ============================================================ */
function renderQuestion() {
  const b = App.battle;
  if (b.currentIdx >= b.queue.length) {
    if ([...b.wordsToComplete].every(id => b.wordsCompleted.has(id))) {
      completeStage();
    } else {
      endBattle('lose');
    }
    return;
  }

  const entry = b.queue[b.currentIdx];
  const ws = getWordState(App.progress, entry.word.id);
  const q = buildQuestion(entry.word, ws.stage, window.WORD_DATA, entry.stageOverride);
  b.currentQuestion = q;

  updateProgressDisplay();
  document.getElementById('stage-badge').textContent = q.stageLabel;

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

  const listenBtns = document.getElementById('listen-btns');
  if (q.type === 'listen') {
    listenBtns.classList.remove('hidden');
    setTimeout(() => speak(q.speakText, 1), 400);
  } else {
    listenBtns.classList.add('hidden');
  }

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

  const rd = document.getElementById('result-display');
  rd.className = 'result-display hidden';
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

  document.querySelectorAll('.choice-btn').forEach(btn => (btn.disabled = true));

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

    sfxAttack();
    playEnemyHit(dmg);
    b.wordsCompleted.add(q.word.id);
    updateProgressDisplay();
    showResult(true, dmg, mult);
    Store.saveProgress(App.progress);
    updateHPBars();
    updateComboDisplay();

    if ([...b.wordsToComplete].every(id => b.wordsCompleted.has(id))) {
      setTimeout(() => completeStage(), 1500);
      return;
    }

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
    sfxWrong();
    showResult(false, 10, 1);
    Store.saveProgress(App.progress);
    updateHPBars();
    updateComboDisplay();

    if (b.playerHP <= 0) {
      setTimeout(() => endBattle('lose'), 1500);
      return;
    }
  }

  function advanceOrEnd() {
    if (b.playerHP <= 0) { endBattle('lose'); return; }
    b.currentIdx++;
    if (b.wrongWordToInsert) {
      b.queue.splice(b.currentIdx, 0, { word: b.wrongWordToInsert, stageOverride: undefined, isLongTerm: false });
      b.wrongWordToInsert = null;
    }
    renderQuestion();
  }

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
function updateProgressDisplay() {
  const b = App.battle;
  const p = App.progress;
  if (!b || !p) return;
  document.getElementById('game-stage-label').textContent = `ゲームステージ ${p.gameStage || 1}`;
  document.getElementById('battle-progress').textContent = `${b.wordsCompleted.size}/10 正解`;
}

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
  sfxLevelUp();
  const el = document.getElementById('stage-up-notice');
  el.textContent = `🎉 学習ステージ ${newStage} にアップ！`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2500);
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
   Stage clear
   ============================================================ */
function completeStage() {
  stopBGM();
  sfxStageClear();
  const clearedStage = App.progress.gameStage || 1;
  App.progress.gameStage = clearedStage + 1;
  Store.saveProgress(App.progress);

  document.getElementById('stage-clear-info').textContent =
    `ゲームステージ ${clearedStage} クリア！ → ステージ ${App.progress.gameStage} へ進もう！`;
  document.getElementById('stage-clear-overlay').classList.remove('hidden');
}

document.getElementById('btn-next-stage').addEventListener('click', () => {
  document.getElementById('stage-clear-overlay').classList.add('hidden');
  startBattle(App.currentUser);
});

document.getElementById('btn-stage-home').addEventListener('click', () => {
  document.getElementById('stage-clear-overlay').classList.add('hidden');
  renderUserScreen();
});

/* ============================================================
   Battle end
   ============================================================ */
function endBattle(reason) {
  stopBGM();
  const b = App.battle;
  const titleEl = document.getElementById('result-title');
  const scoreEl = document.getElementById('result-score');
  const listEl = document.getElementById('result-word-list');

  if (reason === 'lose') {
    titleEl.textContent = '敗北…';
    titleEl.className = 'result-title lose';
  } else {
    titleEl.textContent = '結果';
    titleEl.className = 'result-title';
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
