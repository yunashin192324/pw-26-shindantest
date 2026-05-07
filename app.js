/* ============================================================
   CONSTANTS
   ============================================================ */
const STAGE_ADVANCE_STREAK = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 1 };

const ENEMIES = [
  { name: 'コイキング', pokeId: 129 },
  { name: 'ピカチュウ', pokeId: 25  },
  { name: 'フシギバナ', pokeId: 3   },
  { name: 'リザードン', pokeId: 6   },
  { name: 'カイリュー', pokeId: 149 },
  { name: 'ミュウツー',  pokeId: 150 },
];

const BOSS_ENEMIES = [
  { name: '英語魔王ザーグ', pokeId: 249 },
  { name: '熟語の大魔神',   pokeId: 384 },
  { name: '伝説のドラゴン', pokeId: 483 },
];
const BOSS_HP   = 300;
const BOSS_MAX_Q = 20;

const TITLES = [
  { min: 30, title: '英語の勇者' },
  { min: 25, title: 'マスター' },
  { min: 20, title: '英語の賢者' },
  { min: 15, title: '言葉の魔法使い' },
  { min: 10, title: '英語の剣士' },
  { min: 7,  title: '勇者の卵' },
  { min: 4,  title: '見習い魔法使い' },
  { min: 1,  title: '見習い冒険者' },
];

const BADGE_DEFS = [
  { id: 'first_battle',  emoji: '⚔️', name: '初陣',          desc: '初めてバトルを開始した' },
  { id: 'first_correct', emoji: '✅', name: '初正解',         desc: '初めて正解した' },
  { id: 'combo5',        emoji: '🔥', name: '5コンボ！',      desc: '5連続正解を達成した' },
  { id: 'combo10',       emoji: '💥', name: '10コンボ！！',   desc: '10連続正解を達成した' },
  { id: 'perfect',       emoji: '💯', name: 'パーフェクト',   desc: 'ノーミスでバトルをクリアした' },
  { id: 'level5',        emoji: '⭐', name: 'Lv5到達',        desc: 'レベル5に到達した' },
  { id: 'level10',       emoji: '🌟', name: 'Lv10到達',       desc: 'レベル10に到達した' },
  { id: 'level20',       emoji: '✨', name: 'Lv20到達',       desc: 'レベル20に到達した' },
  { id: 'master10',      emoji: '📚', name: '単語マスター10', desc: '10単語をマスターした' },
  { id: 'streak7',       emoji: '🏆', name: '7日連続！',      desc: '7日間連続でログインした' },
];

const DIALOGS = {
  correct: ['ナイスアタック！', 'すごい！', 'やった！', 'よし！', '完璧だ！', 'グッドアンサー！'],
  wrong:   ['くじけるな！', 'つぎがんばれ！', '惜しい！', '覚えておこう！', '次は絶対！'],
  combo3:  ['3コンボ！熱い！', 'トリプル！', '連続攻撃！'],
  combo5:  ['5コンボ！', '必殺ゲージMAX！'],
  combo10: ['10コンボ！！伝説！', '最強の冒険者！'],
  special: ['⚡ 必殺技！！', 'スペシャルアタック！', '全力全開！'],
  win:     ['勝利だ！', 'やったぞ！', '最高の冒険者！'],
  lose:    ['次は勝つ！', '鍛え直してくる！', '一緒にがんばろう！'],
  defeat:  ['撃破！', '敵を倒した！残りも完璧に！', 'ラストスパート！'],
  boss:    ['ボスが現れた！', '強敵だ！気を引き締めて！', '伝説の戦いが始まる！'],
  levelup: ['レベルアップ！', '成長している！', 'どんどん強くなる！'],
};
function getDialog(key) {
  const list = DIALOGS[key] || ['がんばれ！'];
  return list[Math.floor(Math.random() * list.length)];
}

/* ============================================================
   Store
   ============================================================ */
const Store = {
  get(key)      { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
  getUsers()    { return Store.get('users') || []; },
  saveUsers(u)  { Store.set('users', u); },
  getProgress(userId) {
    const saved = Store.get('progress_' + userId) || {};
    return {
      userId, words: {}, gameStage: 1, totalExp: 0, battleCount: 0,
      loginStreak: 0, lastLoginDate: null, badges: [], soundEnabled: true, bossCleared: 0,
      ...saved,
    };
  },
  saveProgress(p) { Store.set('progress_' + p.userId, p); },
};

/* ============================================================
   Level / EXP
   ============================================================ */
function expForLevel(lv) { return lv * 100; }
function computeLevelInfo(totalExp) {
  let lv = 1, rem = Math.max(0, totalExp);
  while (rem >= expForLevel(lv)) { rem -= expForLevel(lv); lv++; }
  return { level: lv, exp: rem, expNeeded: expForLevel(lv) };
}
function getTitle(lv) {
  for (const t of TITLES) { if (lv >= t.min) return t.title; }
  return '見習い冒険者';
}
function getMasterWordCount(progress) {
  return Object.values(progress.words).filter(ws => ws.stage >= 6).length;
}

/* ============================================================
   Badge helpers
   ============================================================ */
function awardBadge(progress, badgeId) {
  if (progress.badges.includes(badgeId)) return;
  progress.badges.push(badgeId);
  const def = BADGE_DEFS.find(b => b.id === badgeId);
  if (def) showBadgeNotification(def.emoji, `バッジ獲得！ ${def.name}`);
  Store.saveProgress(progress);
}
function showBadgeNotification(emoji, text) {
  const el = document.getElementById('badge-notification');
  const textEl = document.getElementById('badge-notification-text');
  if (!el || !textEl) return;
  textEl.textContent = `${emoji} ${text}`;
  el.classList.remove('hidden');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 400);
  }, 2800);
}

/* ============================================================
   Login streak
   ============================================================ */
function checkLoginStreak(progress) {
  const today = new Date().toDateString();
  if (progress.lastLoginDate === today) return null;
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  progress.loginStreak = (progress.lastLoginDate === yesterday)
    ? (progress.loginStreak || 0) + 1 : 1;
  progress.lastLoginDate = today;
  if (progress.loginStreak >= 7) awardBadge(progress, 'streak7');
  Store.saveProgress(progress);
  return { bonusExp: 20, streak: progress.loginStreak };
}

/* ============================================================
   Word state helpers
   ============================================================ */
function initWordState() {
  return {
    stage: 1, correctStreak: 0, wrongCount: 0,
    missTypes: { meaning: 0, listening: 0, spelling: 0 },
    nextReview: 0, lastClearedAt: null, longTermDue: [], history: [],
  };
}
function getWordState(progress, wordId) {
  if (!progress.words[wordId]) progress.words[wordId] = initWordState();
  return progress.words[wordId];
}
function stageMissType(s) {
  if (s === 2 || s === 6) return 'listening';
  if (s === 4) return 'spelling';
  return 'meaning';
}
function nextReviewDelay(streak) {
  if (streak >= 3) return 86400000;
  if (streak === 2) return 3600000;
  return 0;
}

/* ============================================================
   Enemy selection
   ============================================================ */
function selectEnemy(gameStage) {
  return ENEMIES[Math.max(0, Math.min(gameStage - 1, ENEMIES.length - 1))];
}
function selectBossEnemy(bossCount) {
  return BOSS_ENEMIES[bossCount % BOSS_ENEMIES.length];
}
function isBossStage(gameStage) {
  return gameStage > 1 && (gameStage - 1) % 3 === 0;
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
  return shuffle(pool.filter(w => w.id !== correct.id && w[field] !== correct[field])).slice(0, count);
}
function buildChoices(correct, allWords, field) {
  const same = allWords.filter(w => w.type === correct.type);
  let d = pickDummies(correct, same, 3, field);
  if (d.length < 3) d = [...d, ...pickDummies(correct, allWords.filter(w => w.id !== correct.id), 3 - d.length, field)];
  return shuffle([correct, ...d.slice(0, 3)]);
}
function buildQuestion(word, stage, allWords, forceStage) {
  const s = forceStage !== undefined ? forceStage : stage;
  const q = { word, stage: s };
  if (s === 1) {
    Object.assign(q, { type: 'choice', prompt: word.text,
      choices: buildChoices(word, allWords, 'meaning'), answerField: 'meaning', stageLabel: 'Stage 1: 英語→日本語' });
  } else if (s === 2) {
    Object.assign(q, { type: 'listen', speakText: word.text,
      choices: buildChoices(word, allWords, 'meaning'), answerField: 'meaning', stageLabel: 'Stage 2: 聴いて意味を選ぼう' });
  } else if (s === 3) {
    Object.assign(q, { type: 'choice', prompt: word.meaning,
      choices: buildChoices(word, allWords, 'text'), answerField: 'text', stageLabel: 'Stage 3: 日本語→英語' });
  } else if (s === 4) {
    Object.assign(q, { type: 'input', prompt: word.meaning, stageLabel: 'Stage 4: スペルを入力' });
  } else if (s === 5) {
    const blanked = word.example.replace(
      new RegExp('\\b' + word.text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '\\b', 'i'), '___');
    Object.assign(q, { type: 'choice', prompt: blanked,
      choices: buildChoices(word, allWords, 'text'), answerField: 'text', stageLabel: 'Stage 5: 空欄補充' });
  } else {
    Object.assign(q, { type: 'listen', speakText: word.example,
      choices: buildChoices(word, allWords, 'meaning'), answerField: 'meaning', stageLabel: 'Stage 6: 例文を聴いて意味を選ぼう' });
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
  utt.lang = 'en-US'; utt.rate = rate; utt.pitch = 1;
  if (_bestVoice) utt.voice = _bestVoice;
  window.speechSynthesis.speak(utt);
}

/* ============================================================
   Audio (Web Audio API)
   ============================================================ */
let _audioCtx = null;
let _bgmPlaying = false;
let _bgmNextLoop = 0;
let _bgmIsBoss = false;

function _soundOn() { return !(App.progress && App.progress.soundEnabled === false); }
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
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.15, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur * 0.88);
    osc.start(start); osc.stop(start + dur);
  } catch (e) {}
}
function sfxAttack() {
  if (!_soundOn()) return;
  try {
    const ctx = _getAudio(), t = ctx.currentTime;
    _playNote(ctx, 880, t,        0.04, 'square',   0.25);
    _playNote(ctx, 660, t + 0.04, 0.06, 'square',   0.20);
    _playNote(ctx, 440, t + 0.09, 0.08, 'sawtooth', 0.12);
  } catch (e) {}
}
function sfxSpecial() {
  if (!_soundOn()) return;
  try {
    const ctx = _getAudio(), t = ctx.currentTime;
    [[523,0],[659,0.06],[784,0.12],[1047,0.18],[784,0.28],[1047,0.38],[1319,0.48]]
      .forEach(([f,d]) => _playNote(ctx, f, t+d, 0.09, 'square', 0.30));
  } catch (e) {}
}
function sfxWrong() {
  if (!_soundOn()) return;
  try {
    const ctx = _getAudio(), t = ctx.currentTime;
    _playNote(ctx, 220, t,        0.13, 'sawtooth', 0.20);
    _playNote(ctx, 175, t + 0.13, 0.20, 'sawtooth', 0.12);
  } catch (e) {}
}
function sfxFanfare() {
  if (!_soundOn()) return;
  try {
    const ctx = _getAudio(), t = ctx.currentTime;
    [[523,0],[659,0.11],[784,0.22],[1047,0.33],[784,0.50],[880,0.61],[1047,0.72]]
      .forEach(([f,d]) => _playNote(ctx, f, t+d, 0.12, 'square', 0.28));
  } catch (e) {}
}
function sfxStageAdvance() {
  if (!_soundOn()) return;
  try {
    const ctx = _getAudio(), t = ctx.currentTime;
    _playNote(ctx, 523, t,        0.07, 'square', 0.18);
    _playNote(ctx, 659, t + 0.07, 0.07, 'square', 0.18);
    _playNote(ctx, 784, t + 0.14, 0.10, 'square', 0.20);
  } catch (e) {}
}
function sfxClear() {
  if (!_soundOn()) return;
  try {
    const ctx = _getAudio(), t = ctx.currentTime;
    [[523,0],[659,0.15],[784,0.30],[523,0.45],[659,0.60],[784,0.75],[1047,0.90]]
      .forEach(([f,d]) => _playNote(ctx, f, t+d, 0.13, 'square', 0.30));
  } catch (e) {}
}
function sfxBoss() {
  if (!_soundOn()) return;
  try {
    const ctx = _getAudio(), t = ctx.currentTime;
    _playNote(ctx, 110, t,        0.30, 'sawtooth', 0.35);
    _playNote(ctx, 147, t + 0.30, 0.30, 'sawtooth', 0.30);
    _playNote(ctx, 110, t + 0.60, 0.15, 'sawtooth', 0.25);
    _playNote(ctx, 98,  t + 0.75, 0.50, 'sawtooth', 0.35);
  } catch (e) {}
}

const _BGM = [
  [659,0.2],[587,0.2],[523,0.2],[587,0.2],[659,0.2],[659,0.2],[659,0.4],
  [587,0.2],[587,0.2],[698,0.2],[587,0.2],[523,0.2],[587,0.2],[523,0.4],
  [659,0.2],[784,0.2],[880,0.2],[784,0.2],[659,0.2],[587,0.2],[659,0.4],
  [494,0.2],[523,0.2],[587,0.2],[659,0.2],[659,0.8],
];
const _BOSS_BGM = [
  [220,0.1],[247,0.1],[262,0.1],[294,0.1],[330,0.1],[294,0.1],[262,0.1],[247,0.1],
  [220,0.1],[220,0.1],[196,0.1],[220,0.1],[247,0.1],[220,0.1],[196,0.1],[175,0.2],
  [220,0.1],[247,0.1],[262,0.1],[294,0.1],[330,0.15],[349,0.15],[330,0.1],[294,0.1],
  [262,0.1],[262,0.1],[247,0.1],[220,0.1],[196,0.4],
];
const _BGM_DUR      = _BGM.reduce((s,[,d]) => s+d, 0);
const _BOSS_BGM_DUR = _BOSS_BGM.reduce((s,[,d]) => s+d, 0);

function startBGM(isBoss = false) {
  if (_bgmPlaying) return;
  if (!_soundOn()) return;
  _bgmPlaying = true; _bgmIsBoss = isBoss;
  try { _bgmNextLoop = _getAudio().currentTime + 0.1; _scheduleBGM(); }
  catch (e) { _bgmPlaying = false; }
}
function stopBGM() { _bgmPlaying = false; }
function _scheduleBGM() {
  if (!_bgmPlaying) return;
  try {
    const ctx = _getAudio();
    const melody = _bgmIsBoss ? _BOSS_BGM : _BGM;
    const dur    = _bgmIsBoss ? _BOSS_BGM_DUR : _BGM_DUR;
    let t = _bgmNextLoop;
    melody.forEach(([f,d]) => { _playNote(ctx, f, t, d*0.80, 'square', 0.07); t += d; });
    _bgmNextLoop += dur;
    setTimeout(() => _scheduleBGM(), Math.max(0, (_bgmNextLoop - ctx.currentTime)*1000 - 200));
  } catch (e) {}
}

/* ============================================================
   Enemy hit effect
   ============================================================ */
function playEnemyHit(dmg, isSpecial) {
  try {
    const img = document.getElementById('enemy-img');
    img.classList.remove('enemy-hit');
    void img.offsetWidth;
    img.classList.add('enemy-hit');
    setTimeout(() => img.classList.remove('enemy-hit'), 600);

    const area = document.getElementById('enemy-area');
    if (!area) return;
    const popup = document.createElement('div');
    popup.className = isSpecial ? 'damage-popup special-hit' : 'damage-popup';
    popup.textContent = isSpecial ? `⚡ -${dmg}` : `-${dmg}`;
    popup.style.left = (25 + Math.random() * 35) + '%';
    popup.style.top  = (35 + Math.random() * 20) + '%';
    area.appendChild(popup);
    setTimeout(() => popup.remove(), 1200);
  } catch (e) {}
}

/* ============================================================
   Dialog bubble
   ============================================================ */
let _dialogTimer = null;
function showDialog(key) {
  const el = document.getElementById('dialog-bubble');
  if (!el) return;
  if (_dialogTimer) clearTimeout(_dialogTimer);
  el.textContent = getDialog(key);
  el.classList.remove('hidden');
  _dialogTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

/* ============================================================
   App state
   ============================================================ */
const App = { currentUser: null, progress: null, battle: null };

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
}

/* ============================================================
   Mute button
   ============================================================ */
document.getElementById('btn-mute').addEventListener('click', () => {
  if (!App.progress) return;
  App.progress.soundEnabled = (App.progress.soundEnabled === false) ? true : false;
  Store.saveProgress(App.progress);
  updateMuteButton();
  if (!_soundOn()) {
    stopBGM();
  } else if (App.battle) {
    startBGM(App.battle.isBoss);
  }
});
function updateMuteButton() {
  const btn = document.getElementById('btn-mute');
  if (btn) btn.textContent = _soundOn() ? '🔊' : '🔇';
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
    const prog = Store.getProgress(u.userId);
    const li   = computeLevelInfo(prog.totalExp || 0);
    const masterCount = getMasterWordCount(prog);
    const streak      = prog.loginStreak || 0;
    const badgeCount  = (prog.badges || []).length;

    const wrap = document.createElement('div');
    wrap.className = 'user-btn';
    wrap.innerHTML = `
      <div class="user-btn-main">
        <span class="user-btn-arrow">▶</span>
        <div class="user-btn-body">
          <div class="user-btn-name">${u.name}</div>
          <div class="user-btn-info">
            <span class="user-lv">Lv.${li.level}</span>
            <span class="user-title-label">${getTitle(li.level)}</span>
          </div>
          <div class="user-btn-stats">
            <span>📚 ${masterCount}語</span>
            <span>🔥 ${streak}日</span>
            <span>🏅 ${badgeCount}個</span>
          </div>
        </div>
      </div>
    `;
    const actions = document.createElement('div');
    actions.className = 'user-btn-actions';

    const badgeBtn = document.createElement('button');
    badgeBtn.className = 'btn btn-gray btn-sm';
    badgeBtn.textContent = 'バッジ';
    badgeBtn.addEventListener('click', e => { e.stopPropagation(); showBadgeModal(prog); });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger btn-sm';
    deleteBtn.textContent = '削除';
    deleteBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm(`「${u.name}」のデータを削除しますか？`)) return;
      const users = Store.getUsers().filter(user => user.userId !== u.userId);
      Store.saveUsers(users);
      localStorage.removeItem('progress_' + u.userId);
      renderUserScreen();
    });

    actions.appendChild(badgeBtn);
    actions.appendChild(deleteBtn);
    wrap.appendChild(actions);

    wrap.addEventListener('click', () => startBattle(u));
    list.appendChild(wrap);
  });
  showScreen('user');
}

/* ============================================================
   Badge modal
   ============================================================ */
function showBadgeModal(progress) {
  const listEl = document.getElementById('badge-modal-list');
  listEl.innerHTML = '';
  BADGE_DEFS.forEach(def => {
    const earned = (progress.badges || []).includes(def.id);
    const item = document.createElement('div');
    item.className = 'badge-item' + (earned ? ' earned' : ' locked');
    item.innerHTML = `
      <span class="badge-emoji">${earned ? def.emoji : '🔒'}</span>
      <div class="badge-info">
        <div class="badge-name">${def.name}</div>
        <div class="badge-desc">${earned ? def.desc : '???'}</div>
      </div>
    `;
    listEl.appendChild(item);
  });
  document.getElementById('badge-modal').classList.remove('hidden');
}
document.getElementById('btn-badge-close').addEventListener('click', () => {
  document.getElementById('badge-modal').classList.add('hidden');
});

/* ============================================================
   Add user
   ============================================================ */
document.getElementById('btn-show-add').addEventListener('click', () => {
  document.getElementById('add-user-form').classList.remove('hidden');
  document.getElementById('input-username').focus();
});
document.getElementById('btn-cancel-add').addEventListener('click', () => {
  document.getElementById('add-user-form').classList.add('hidden');
  document.getElementById('input-username').value = '';
});
document.getElementById('btn-save-user').addEventListener('click', saveNewUser);
document.getElementById('input-username').addEventListener('keydown', e => { if (e.key === 'Enter') saveNewUser(); });
function saveNewUser() {
  const name = document.getElementById('input-username').value.trim();
  if (!name) return;
  const users = Store.getUsers();
  users.push({ userId: 'user_' + Date.now(), name, createdAt: Date.now() });
  Store.saveUsers(users);
  document.getElementById('input-username').value = '';
  document.getElementById('add-user-form').classList.add('hidden');
  renderUserScreen();
}

/* ============================================================
   Battle init
   ============================================================ */
function startBattle(user) {
  App.currentUser = user;
  App.progress    = Store.getProgress(user.userId);
  if (!App.progress.gameStage) App.progress.gameStage = 1;

  const streakResult = checkLoginStreak(App.progress);

  App.progress.battleCount = (App.progress.battleCount || 0) + 1;
  if (App.progress.battleCount === 1) awardBadge(App.progress, 'first_battle');
  Store.saveProgress(App.progress);
  updateMuteButton();

  const allWords = window.WORD_DATA;
  const boss  = isBossStage(App.progress.gameStage);
  const enemy = boss ? selectBossEnemy(App.progress.bossCleared || 0) : selectEnemy(App.progress.gameStage);
  const maxQ  = boss ? BOSS_MAX_Q : 10;
  const enemyHP = boss ? BOSS_HP : 100;

  const queue = buildBattleQueue(App.progress, allWords, maxQ);

  App.battle = {
    queue, currentIdx: 0,
    playerHP: 100, enemyHP, maxHP: enemyHP,
    combo: 0, specialGauge: 0,
    correct: 0, total: 0, results: [],
    wordsToComplete: new Set(queue.map(e => e.word.id)),
    wordsCompleted:  new Set(),
    wrongWordToInsert: null,
    isBoss: boss, wrongCount: 0,
    expAtStart: App.progress.totalExp || 0,
    mastersAtStart: getMasterWordCount(App.progress),
  };

  const enemyImgEl = document.getElementById('enemy-img');
  enemyImgEl.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${enemy.pokeId}.png`;
  enemyImgEl.alt = enemy.name;
  enemyImgEl.classList.remove('enemy-defeated');
  document.getElementById('enemy-name').textContent = enemy.name;
  document.getElementById('battle-username').textContent = user.name;
  document.getElementById('stage-clear-overlay').classList.add('hidden');

  showScreen('battle');

  if (boss) {
    sfxBoss();
    startBGM(true);
    setTimeout(() => showDialog('boss'), 700);
  } else {
    startBGM(false);
  }

  if (streakResult) {
    gainExp(streakResult.bonusExp);
    setTimeout(() => showBadgeNotification('🔥',
      `${streakResult.streak}日連続ログイン！ +${streakResult.bonusExp} EXP`), 1800);
  }

  renderQuestion();
}

function buildBattleQueue(progress, allWords, count) {
  count = count || 10;
  const now = Date.now();

  // Long-term SRS reviews: mastered words with a scheduled recall date that has arrived
  const ltReviews = [];
  // Short-term reviews: seen words (stage>1) whose spaced-repetition delay has expired
  const shortReviews = [];

  for (const word of allWords) {
    const ws = progress.words[word.id];
    if (!ws) continue;
    if (ws.longTermDue && ws.longTermDue.some(t => t <= now)) {
      ltReviews.push({ word, stageOverride: ws.stage, isLongTerm: true });
    } else if (ws.stage > 1 && ws.nextReview > 0 && ws.nextReview <= now) {
      shortReviews.push({ word, stageOverride: undefined, isLongTerm: false });
    }
  }

  shuffle(ltReviews);
  shuffle(shortReviews);

  // Cap reviews so there's always room for new words
  const picked = [
    ...ltReviews.slice(0, 3),
    ...shortReviews.slice(0, 3),
  ];
  const pickedIds = new Set(picked.map(e => e.word.id));

  // Fill remaining slots with sequential new words starting from current stage offset
  const batchStart = ((progress.gameStage - 1) * 10) % allWords.length;
  for (let i = 0; picked.length < count; i++) {
    if (i >= allWords.length) break;
    const word = allWords[(batchStart + i) % allWords.length];
    if (!pickedIds.has(word.id)) {
      picked.push({ word, stageOverride: undefined, isLongTerm: false });
      pickedIds.add(word.id);
    }
  }

  return shuffle(picked).slice(0, count);
}

/* ============================================================
   Render question
   ============================================================ */
function renderQuestion() {
  const b = App.battle;
  if (b.currentIdx >= b.queue.length) {
    const allDone = [...b.wordsToComplete].every(id => b.wordsCompleted.has(id));
    allDone ? completeStage() : endBattle('lose');
    return;
  }

  const entry = b.queue[b.currentIdx];
  const ws = getWordState(App.progress, entry.word.id);
  const q  = buildQuestion(entry.word, ws.stage, window.WORD_DATA, entry.stageOverride);
  b.currentQuestion = q;

  updateProgressDisplay();
  document.getElementById('stage-badge').textContent = q.stageLabel;

  const qtEl = document.getElementById('question-text');
  if (q.type === 'listen') {
    qtEl.textContent = '🔊 音声を聴いて答えよう';
  } else {
    qtEl.innerHTML = '';
    const d = document.createElement('div');
    d.textContent = q.prompt;
    qtEl.appendChild(d);
    if (q.stage === 1) {
      const btn = document.createElement('button');
      btn.className = 'btn-speak-question';
      btn.textContent = '🔊 聞く';
      btn.addEventListener('click', () => speak(q.word.text));
      qtEl.appendChild(btn);
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
  const inputArea   = document.getElementById('input-area');
  if (q.type === 'input') {
    choicesArea.classList.add('hidden');
    inputArea.classList.remove('hidden');
    document.getElementById('spell-input').value = '';
    document.getElementById('spell-input').focus();
  } else {
    choicesArea.classList.remove('hidden');
    inputArea.classList.add('hidden');
    document.querySelectorAll('.choice-btn').forEach((btn, i) => {
      const ch   = q.choices[i];
      const text = ch ? ch[q.answerField] : '';
      btn.className = 'choice-btn';
      btn.disabled  = false;
      btn.dataset.answer = text;
      btn.dataset.word   = ch ? ch.id : '';
      const keyHint = `<span class="choice-key">${i + 1}</span>`;
      if (q.answerField === 'text' && ch) {
        btn.innerHTML = `${keyHint}<span class="choice-label">${text}</span><span class="speak-mini" data-text="${text}">🔊</span>`;
      } else {
        btn.innerHTML = `${keyHint}${text}`;
      }
    });
  }

  document.getElementById('result-display').className = 'result-display hidden';
  document.getElementById('btn-next').classList.add('hidden');
  document.getElementById('dialog-bubble').classList.add('hidden');

  updateComboDisplay();
  updateHPBars();
  updateSpecialGauge();
}

/* ============================================================
   Answer handling
   ============================================================ */
function checkAnswer(userAnswer) {
  const b  = App.battle;
  const q  = b.currentQuestion;
  const ws = getWordState(App.progress, q.word.id);

  const isCorrect = q.type === 'input'
    ? userAnswer.trim().toLowerCase() === q.word.text.toLowerCase()
    : userAnswer === q.word[q.answerField];

  b.total++;
  const entry        = b.queue[b.currentIdx];
  const effectiveStage = entry.stageOverride !== undefined ? entry.stageOverride : ws.stage;
  const prevStage    = ws.stage;

  document.querySelectorAll('.choice-btn').forEach(btn => (btn.disabled = true));

  if (isCorrect) {
    b.correct++;
    b.results.push({ word: q.word, correct: true });
    b.combo++;
    b.specialGauge++;

    if (!App.progress.badges.includes('first_correct')) awardBadge(App.progress, 'first_correct');
    if (b.combo >= 10 && !App.progress.badges.includes('combo10')) awardBadge(App.progress, 'combo10');
    else if (b.combo >= 5 && !App.progress.badges.includes('combo5')) awardBadge(App.progress, 'combo5');

    // Damage (special vs regular)
    let dmg, isSpecial = false;
    if (b.specialGauge >= 5) {
      b.specialGauge = 0;
      dmg = 30;
      isSpecial = true;
      sfxSpecial();
    } else {
      const mult = b.combo >= 5 ? 2.0 : b.combo >= 3 ? 1.5 : 1.0;
      dmg = Math.floor(10 * mult);
      sfxAttack();
    }
    const prevEnemyHP = b.enemyHP;
    b.enemyHP = Math.max(0, b.enemyHP - dmg);
    playEnemyHit(dmg, isSpecial);

    // Word state
    ws.correctStreak++;
    ws.history.push({ result: 'correct', ts: Date.now() });
    if (ws.history.length > 20) ws.history = ws.history.slice(-20);
    ws.nextReview = Date.now() + nextReviewDelay(ws.correctStreak);
    if (entry.isLongTerm) {
      const idx = ws.longTermDue.findIndex(d => d <= Date.now());
      if (idx !== -1) ws.longTermDue.splice(idx, 1);
    } else {
      const needed = STAGE_ADVANCE_STREAK[ws.stage];
      if (needed !== undefined && ws.correctStreak >= needed && ws.stage < 6) {
        ws.stage++;
        ws.correctStreak = 0;
        if (ws.stage === 6) {
          const base = Date.now();
          ws.lastClearedAt = base;
          ws.longTermDue.push(base + 86400000, base + 7*86400000, base + 30*86400000);
        }
      }
    }
    if (ws.stage > prevStage) showStageUp(ws.stage);

    gainExp(10 + (ws.stage > prevStage ? 20 : 0));
    if (getMasterWordCount(App.progress) >= 10) awardBadge(App.progress, 'master10');

    b.wordsCompleted.add(q.word.id);
    updateProgressDisplay();

    // Dialog
    if (isSpecial)       showDialog('special');
    else if (b.combo >= 10) showDialog('combo10');
    else if (b.combo >= 5)  showDialog('combo5');
    else if (b.combo >= 3)  showDialog('combo3');
    else                    showDialog('correct');
    if (!b.isBoss && prevEnemyHP > 0 && b.enemyHP <= 0) showDialog('defeat');

    const mult = b.combo >= 5 ? 2.0 : b.combo >= 3 ? 1.5 : 1.0;
    showResult(true, dmg, isSpecial ? null : mult);
    Store.saveProgress(App.progress);
    updateHPBars();
    updateComboDisplay();
    updateSpecialGauge();

    if (b.isBoss && b.enemyHP <= 0) { setTimeout(() => completeStage(), 1500); return; }
    if ([...b.wordsToComplete].every(id => b.wordsCompleted.has(id))) {
      setTimeout(() => completeStage(), 1500); return;
    }

  } else {
    b.results.push({ word: q.word, correct: false });
    b.combo = 0;
    b.specialGauge = 0;
    b.wrongCount++;
    b.playerHP = Math.max(0, b.playerHP - 10);

    ws.correctStreak = 0;
    ws.wrongCount++;
    ws.missTypes[stageMissType(effectiveStage)]++;
    ws.history.push({ result: 'wrong', ts: Date.now() });
    if (ws.history.length > 20) ws.history = ws.history.slice(-20);
    ws.nextReview = 0;
    if (entry.isLongTerm) { ws.stage = 3; ws.correctStreak = 0; }
    else                  { ws.stage = Math.max(1, ws.stage - 1); }

    b.wrongWordToInsert = q.word;
    sfxWrong();
    setTimeout(() => speak(q.word.text, 0.85), 380);
    const pa = document.querySelector('.player-area');
    if (pa) { pa.classList.remove('player-hit'); void pa.offsetWidth; pa.classList.add('player-hit'); setTimeout(() => pa.classList.remove('player-hit'), 600); }
    showDialog('wrong');
    showResult(false, 10, 1);
    Store.saveProgress(App.progress);
    updateHPBars();
    updateComboDisplay();
    updateSpecialGauge();

    if (b.playerHP <= 0) {
      showDialog('lose');
      setTimeout(() => endBattle('lose'), 1500);
      return;
    }
  }

  function advanceOrEnd() {
    if (b.playerHP <= 0) { endBattle('lose'); return; }
    b.currentIdx++;
    if (b.wrongWordToInsert) {
      b.queue.splice(b.currentIdx, 0,
        { word: b.wrongWordToInsert, stageOverride: undefined, isLongTerm: false });
      b.wrongWordToInsert = null;
    }
    renderQuestion();
  }

  const nextBtn  = document.getElementById('btn-next');
  nextBtn.classList.remove('hidden');
  const autoTimer = setTimeout(advanceOrEnd, 2000);
  nextBtn.onclick = () => { clearTimeout(autoTimer); nextBtn.classList.add('hidden'); advanceOrEnd(); };
}

/* ============================================================
   EXP / Level up
   ============================================================ */
function gainExp(amount) {
  const before = computeLevelInfo(App.progress.totalExp || 0);
  App.progress.totalExp = (App.progress.totalExp || 0) + amount;
  const after  = computeLevelInfo(App.progress.totalExp);
  if (after.level > before.level) {
    showLevelUp(after.level);
    if (after.level >= 20 && !App.progress.badges.includes('level20')) awardBadge(App.progress, 'level20');
    else if (after.level >= 10 && !App.progress.badges.includes('level10')) awardBadge(App.progress, 'level10');
    else if (after.level >= 5  && !App.progress.badges.includes('level5'))  awardBadge(App.progress, 'level5');
  }
}
function showLevelUp(newLevel) {
  sfxFanfare();
  showDialog('levelup');
  const el = document.getElementById('stage-up-notice');
  el.textContent = `🎉 Lv.${newLevel} アップ！ ${getTitle(newLevel)}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

/* ============================================================
   Choice / input events
   ============================================================ */
document.querySelectorAll('.choice-btn').forEach(btn => {
  btn.addEventListener('click', e => {
    if (e.target.classList.contains('speak-mini')) { speak(e.target.dataset.text); return; }
    const q = App.battle && App.battle.currentQuestion;
    if (!q) return;
    const answer = btn.dataset.answer !== undefined ? btn.dataset.answer : btn.textContent;
    if (answer === q.word[q.answerField]) {
      btn.classList.add('correct');
    } else {
      btn.classList.add('wrong');
      document.querySelectorAll('.choice-btn').forEach(b2 => {
        const a = b2.dataset.answer !== undefined ? b2.dataset.answer : b2.textContent;
        if (a === q.word[q.answerField]) b2.classList.add('correct');
      });
    }
    checkAnswer(answer);
  });
});

document.getElementById('btn-submit-spell').addEventListener('click', submitSpell);
document.getElementById('spell-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitSpell(); });
function submitSpell() {
  const val = document.getElementById('spell-input').value;
  checkAnswer(val);
  document.getElementById('input-area').classList.add('hidden');
}

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
  const b = App.battle, p = App.progress;
  if (!b || !p) return;
  document.getElementById('game-stage-label').textContent =
    b.isBoss ? '👹 ボスバトル！' : `ゲームステージ ${p.gameStage}`;
  document.getElementById('battle-progress').textContent =
    `${b.wordsCompleted.size}/${b.wordsToComplete.size} 正解`;
  document.getElementById('battle-master-count').textContent = `📚 ${getMasterWordCount(p)}`;
}

function showResult(isCorrect, dmg, mult) {
  const rd = document.getElementById('result-display');
  if (isCorrect) {
    const special   = mult === null;
    const comboStr  = (!special && mult > 1) ? ` × ${mult} コンボ！` : '';
    rd.textContent = `${special ? '⚡ 必殺技！ ' : ''}Correct！ ${dmg}ダメージ${comboStr}`;
    rd.className = 'result-display correct';
  } else {
    rd.textContent = 'Wrong… 10ダメージ受けた';
    rd.className = 'result-display wrong';
  }
}

function showStageUp(newStage) {
  sfxStageAdvance();
  const el = document.getElementById('stage-up-notice');
  el.textContent = `📖 学習ステージ ${newStage} にアップ！`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2500);
}

function updateHPBars() {
  const b = App.battle;
  if (!b) return;
  document.getElementById('enemy-hp-num').textContent = b.enemyHP;
  document.getElementById('player-hp-num').textContent = b.playerHP;
  document.getElementById('enemy-hp-bar').style.width = (b.enemyHP / b.maxHP * 100) + '%';
  const playerBar = document.getElementById('player-hp-bar');
  playerBar.style.width = b.playerHP + '%';
  playerBar.className = 'hp-fill player-fill';
  if (b.playerHP <= 30) playerBar.classList.add('hp-critical');
  else if (b.playerHP <= 60) playerBar.classList.add('hp-warning');
  const img = document.getElementById('enemy-img');
  if (img) img.classList.toggle('enemy-defeated', !b.isBoss && b.enemyHP <= 0);
}

function updateComboDisplay() {
  const b = App.battle;
  if (!b) return;
  const el = document.getElementById('combo-display');
  if (b.combo >= 2) {
    const mult = b.combo >= 5 ? '× 2.0' : b.combo >= 3 ? '× 1.5' : '';
    el.textContent = `${b.combo}連続！ ${mult}`;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

function updateSpecialGauge() {
  const b = App.battle;
  if (!b) return;
  const num  = document.getElementById('special-gauge-num');
  const fill = document.getElementById('special-gauge-fill');
  if (num)  num.textContent = b.specialGauge;
  if (fill) fill.style.width = (b.specialGauge / 5 * 100) + '%';
  const area = document.getElementById('special-gauge-area');
  if (area) area.classList.toggle('gauge-ready', b.specialGauge >= 4);
}

/* ============================================================
   Stage clear
   ============================================================ */
function completeStage() {
  stopBGM();
  sfxClear();

  const b       = App.battle;
  const cleared = App.progress.gameStage;

  if (b.wrongCount === 0) awardBadge(App.progress, 'perfect');

  if (b.isBoss) {
    App.progress.bossCleared = (App.progress.bossCleared || 0) + 1;
    gainExp(100);
    document.getElementById('stage-clear-info').textContent =
      `👹 ボス「${document.getElementById('enemy-name').textContent}」を倒した！`;
  } else {
    document.getElementById('stage-clear-info').textContent =
      `ゲームステージ ${cleared} クリア！ → ステージ ${cleared + 1} へ進もう！`;
  }

  App.progress.gameStage = cleared + 1;
  Store.saveProgress(App.progress);

  const li = computeLevelInfo(App.progress.totalExp || 0);
  const expGained   = (App.progress.totalExp || 0) - b.expAtStart;
  const newMasters  = getMasterWordCount(App.progress) - b.mastersAtStart;
  const masterLine  = newMasters > 0 ? `<div class="stage-clear-masters">📚 ${newMasters}語 マスター！</div>` : '';
  document.getElementById('stage-clear-exp').innerHTML =
    `<div>+${expGained} EXP &nbsp;／&nbsp; Lv.${li.level} ${getTitle(li.level)}</div>` +
    `<div class="stage-clear-bar-wrap"><div class="stage-clear-bar" style="width:${Math.round(li.exp/li.expNeeded*100)}%"></div></div>` +
    `<div class="stage-clear-exp-label">${li.exp} / ${li.expNeeded}</div>` +
    masterLine;

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
  if (reason === 'lose') {
    titleEl.textContent = '敗北…';
    titleEl.className = 'result-title lose';
  } else {
    titleEl.textContent = '勝利！';
    titleEl.className = 'result-title win';
  }

  const li = computeLevelInfo(App.progress.totalExp || 0);
  const expGained = (App.progress.totalExp || 0) - b.expAtStart;
  document.getElementById('result-score').innerHTML =
    `<div>正解 ${b.wordsCompleted.size} / ${b.wordsToComplete.size} 語 &nbsp;|&nbsp; +${expGained} EXP</div>` +
    `<div class="result-level">Lv.${li.level} ${getTitle(li.level)}</div>`;

  // Deduplicate: one row per word — ✅ first-try correct, 🔄 correct after retry, ❌ never correct
  const wordStatus = new Map();
  b.results.forEach(r => {
    if (!wordStatus.has(r.word.id)) {
      wordStatus.set(r.word.id, { word: r.word, firstWasCorrect: r.correct, everCorrect: r.correct });
    } else if (r.correct) {
      wordStatus.get(r.word.id).everCorrect = true;
    }
  });

  const listEl = document.getElementById('result-word-list');
  listEl.innerHTML = '';
  wordStatus.forEach(({ word, firstWasCorrect, everCorrect }) => {
    const mark = firstWasCorrect ? '✅' : everCorrect ? '🔄' : '❌';
    const item = document.createElement('div');
    item.className = 'result-word-item' + (firstWasCorrect ? '' : everCorrect ? ' retried' : ' missed');
    const exampleHtml = (!firstWasCorrect && word.example)
      ? `<div class="result-word-example">${word.example}</div>` : '';
    item.innerHTML = `
      <span class="mark">${mark}</span>
      <div class="result-word-body">
        <div class="result-word-row">
          <span class="result-word-en">${word.text}</span>
          <span class="result-word-ja">${word.meaning}</span>
        </div>
        ${exampleHtml}
      </div>
    `;
    listEl.appendChild(item);
  });

  showScreen('result');
}

document.getElementById('btn-retry').addEventListener('click', () => startBattle(App.currentUser));
document.getElementById('btn-back-user').addEventListener('click', () => renderUserScreen());

/* ============================================================
   Keyboard shortcuts
   ============================================================ */
document.addEventListener('keydown', e => {
  if (!App.battle) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (['1','2','3','4'].includes(e.key)) {
    if (document.getElementById('choices-area').classList.contains('hidden')) return;
    const btn = document.querySelectorAll('.choice-btn')[parseInt(e.key) - 1];
    if (btn && !btn.disabled) btn.click();
    return;
  }
  if (e.key === 'Enter') {
    const nextBtn = document.getElementById('btn-next');
    if (!nextBtn.classList.contains('hidden')) nextBtn.click();
  }
});

/* ============================================================
   Init
   ============================================================ */
renderUserScreen();
