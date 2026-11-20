// Основная логика игры «Пульт-40»

(function () {
  const SAVE_KEY = 'pult40_save_v1';

  const state = {
    running: false,
    paused: false,
    difficulty: 'medium', // 'easy' | 'medium' | 'hard'
    shiftIndex: 0,
    shiftTimeLeft: 300,
    score: 0,
    shiftScoreEarned: 0,
    panic: 0,
    handledCount: 0,
    perfectCount: 0,
    mistakesCount: 0,

    selectedDistricts: [],
    sirenMode: 'long', // 'long' | 'short'
    sirenModel: 's40', // 's40' | 'tornado' | 'modern'
    tvIntercept: false,

    activeIncident: null,
    incidentTimeLeft: 0,
    incidentMaxTime: 30,
    nextIncidentIn: 3,
    recentIncidentIds: [],

    towers: {}, // towerId -> { status: 'ok'|'broken'|'repairing', faultType, repairMode, progress, duration }
    selectedTowerId: null,
    nextBreakdownIn: 24,

    upgrades: [], // ids of owned upgrades
    tvProgramIndex: 0,
    tvProgramTimer: 0,
    tvResetTimeout: null
  };

  // DOM элементы
  const el = {};

  function cacheDom() {
    const ids = [
      'alarmLamp', 'difficultyBadge', 'shiftTitle', 'shiftTimer', 'scoreValue', 'panicText', 'panicBar',
      'handledCount', 'btnSound', 'btnVoice', 'btnUpgrades', 'btnLeaderboard', 'btnAuth', 'btnManual',
      'cityMap', 'selectedDistrictsText', 'btnClearDistricts',
      'towerDiagPanel', 'diagText', 'diagActions', 'btnRebootTower', 'btnDispatchCrew',
      'eventLog', 'dispatchPanel', 'dispatchTimerLabel', 'dispatchTimerBar',
      'dispatchContent', 'dispatchFooter', 'btnRejectHoax',
      'btnModeLong', 'btnModeShort', 'modelS40', 'modelTornado', 'modelModern', 'btnTestSiren',
      'tvScreen', 'tvNormalView', 'tvEmergencyView', 'tvChannel', 'tvIcon', 'tvTitle',
      'tvTickerText', 'tvInterceptSwitch', 'tvSwitchState',
      'msgSlot1', 'msgSlot2', 'msgSlot3', 'msgPreviewText', 'btnBroadcast',
      'startModal', 'btnStartAuth', 'btnStartLb', 'difficultyButtons', 'difficultyDesc', 'shiftButtons', 'btnStartShift',
      'summaryModal', 'summaryBadge', 'summaryTitle', 'summaryText', 'summaryStats',
      'btnSummaryMenu', 'btnSummaryUpgrades', 'btnNextShift',
      'upgradesModal', 'upgradeBudget', 'upgradesGrid', 'btnCloseUpgrades',
      'manualModal', 'btnCloseManual',
      'authModal', 'authGuestView', 'authProfileView', 'authGuestFooter',
      'tabLogin', 'tabRegister', 'authForm', 'callsignField', 'inputCallsign',
      'inputEmail', 'inputPassword', 'authMessage', 'btnAuthSubmit',
      'profileEmail', 'profileBestShift', 'profileCallsignInput', 'btnSaveCallsign',
      'profileMsg', 'btnLogout', 'btnCloseAuthLogged', 'btnCloseAuth',
      'leaderboardModal', 'btnRefreshLb', 'lbTabs', 'lbStatus', 'lbHead', 'lbBody',
      'lbGuestBanner', 'btnLbOpenAuth', 'btnCloseLeaderboard'
    ];
    ids.forEach((id) => { el[id] = document.getElementById(id); });
  }

  function getDiff() {
    return window.GAME_DATA.DIFFICULTIES[state.difficulty] || window.GAME_DATA.DIFFICULTIES.medium;
  }

  function scalePanic(baseAmount) {
    return Math.max(1, Math.round(baseAmount * getDiff().panicMult));
  }

  function scaleScore(baseAmount) {
    return Math.max(5, Math.round(baseAmount * getDiff().scoreMult));
  }

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data.score === 'number') state.score = data.score;
      if (Array.isArray(data.upgrades)) state.upgrades = data.upgrades;
      if (data.difficulty && window.GAME_DATA.DIFFICULTIES[data.difficulty]) {
        state.difficulty = data.difficulty;
      }
    } catch (_) {}
  }

  function saveProgress() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        score: state.score,
        upgrades: state.upgrades,
        difficulty: state.difficulty
      }));
    } catch (_) {}

    if (window.CloudService && window.CloudService.getUser()) {
      window.CloudService.scheduleSyncProfile({
        score: state.score,
        upgrades: state.upgrades,
        difficulty: state.difficulty
      });
    }
  }

  function hasUpgrade(id) {
    return state.upgrades.includes(id);
  }

  function initTowers() {
    state.towers = {};
    window.GAME_DATA.DISTRICTS.forEach((d) => {
      d.towers.forEach((t) => {
        state.towers[t.id] = {
          id: t.id,
          name: t.name,
          districtId: d.id,
          districtName: d.name,
          status: 'ok',
          faultType: null,
          repairMode: null,
          progress: 0,
          duration: 1
        };
      });
    });
    state.selectedTowerId = null;
    updateTowerDiagUI();
  }

  function populateMessageBuilder() {
    const { MESSAGE_BLOCKS } = window.GAME_DATA;
    const fill = (selectEl, list) => {
      selectEl.innerHTML = '';
      list.forEach((item) => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.text;
        selectEl.appendChild(opt);
      });
    };
    fill(el.msgSlot1, MESSAGE_BLOCKS.slot1);
    fill(el.msgSlot2, MESSAGE_BLOCKS.slot2);
    fill(el.msgSlot3, MESSAGE_BLOCKS.slot3);
    updateMessagePreview();
  }

  function getAssembledMessageText() {
    const s1 = el.msgSlot1.options[el.msgSlot1.selectedIndex]?.textContent || '';
    const s2 = el.msgSlot2.options[el.msgSlot2.selectedIndex]?.textContent || '';
    const s3 = el.msgSlot3.options[el.msgSlot3.selectedIndex]?.textContent || '';
    return `${s1}. ${s2}. ${s3}.`;
  }

  function updateMessagePreview() {
    const full = getAssembledMessageText();
    el.msgPreviewText.textContent = full;
    el.tvTickerText.textContent = `+++ ${full.toUpperCase()} +++ СОХРАНЯЙТЕ ПОРЯДОК! +++`;
  }

  function addLog(text, type = 'info') {
    const li = document.createElement('li');
    li.className = `log-${type}`;
    const now = new Date();
    const ts = now.toTimeString().slice(0, 8);
    li.textContent = `[${ts}] ${text}`;
    el.eventLog.prepend(li);
    while (el.eventLog.children.length > 24) {
      el.eventLog.removeChild(el.eventLog.lastChild);
    }
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.ceil(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  function updateHUD() {
    const diff = getDiff();
    if (el.difficultyBadge) {
      el.difficultyBadge.textContent = diff.badge;
      el.difficultyBadge.className = `diff-badge diff-${diff.id}`;
    }
    el.shiftTimer.textContent = formatTime(state.shiftTimeLeft);
    el.scoreValue.textContent = state.score;
    const p = Math.max(0, Math.min(100, Math.round(state.panic)));
    el.panicText.textContent = `${p}%`;
    el.panicBar.style.width = `${p}%`;
    el.handledCount.textContent = state.handledCount;

    if (state.selectedDistricts.length === 0) {
      el.selectedDistrictsText.textContent = 'НЕТ';
    } else {
      const names = state.selectedDistricts.map((id) => {
        const d = window.GAME_DATA.DISTRICTS.find((x) => x.id === id);
        return d ? d.name : id;
      });
      el.selectedDistrictsText.textContent = names.join(', ');
    }

    // Обновляем доступность моделей сирен
    const tornadoUnlocked = hasUpgrade('siren_tornado');
    const modernUnlocked = hasUpgrade('siren_modern');
    el.modelTornado.classList.toggle('locked', !tornadoUnlocked);
    el.modelTornado.textContent = tornadoUnlocked ? '🌪️ Торнадо' : '🔒 Торнадо';
    el.modelModern.classList.toggle('locked', !modernUnlocked);
    el.modelModern.textContent = modernUnlocked ? '📡 Цифровая' : '🔒 Цифровая';
  }

  function updateTVScreen() {
    if (state.tvIntercept) {
      el.tvNormalView.classList.add('hidden');
      el.tvEmergencyView.classList.remove('hidden');
      el.tvSwitchState.textContent = 'ВКЛ';
      el.tvSwitchState.classList.add('on');
    } else {
      el.tvNormalView.classList.remove('hidden');
      el.tvEmergencyView.classList.add('hidden');
      el.tvSwitchState.textContent = 'ВЫКЛ';
      el.tvSwitchState.classList.remove('on');
      const prog = window.GAME_DATA.TV_PROGRAMS[state.tvProgramIndex];
      el.tvChannel.textContent = prog.channel;
      el.tvIcon.textContent = prog.icon;
      el.tvTitle.textContent = prog.title;
      el.tvNormalView.style.background = `linear-gradient(135deg, ${prog.color} 0%, #101c24 100%)`;
    }
  }

  function updateTowerDiagUI() {
    const brokenList = Object.values(state.towers).filter((t) => t.status !== 'ok');
    if (brokenList.length === 0) {
      state.selectedTowerId = null;
      el.towerDiagPanel.className = 'tower-diag ok';
      el.diagText.textContent = 'ЛИНИЯ СВЯЗИ: ВСЕ 12 ВЫШЕК В СЕТИ (НОРМА)';
      el.diagActions.classList.add('hidden');
      return;
    }

    let focus = brokenList.find((t) => t.id === state.selectedTowerId) || brokenList[0];
    state.selectedTowerId = focus.id;

    el.towerDiagPanel.className = 'tower-diag fault';
    if (focus.status === 'repairing') {
      const pct = Math.round(focus.progress * 100);
      const label = focus.repairMode === 'reboot' ? 'Перезагрузка' : 'Рембригада в пути';
      el.diagText.textContent = `⚠ ${focus.name} (${focus.districtName}): ${label} — ${pct}%`;
      el.diagActions.classList.add('hidden');
    } else {
      const faultDesc = focus.faultType === 'software'
        ? 'Сбой контроллера (поможет перезагрузка)'
        : 'Обрыв кабеля / молния (нужна рембригада)';
      el.diagText.textContent = `⚠ НЕТ СВЯЗИ: ${focus.name} [${focus.districtName}] — ${faultDesc}`;
      el.diagActions.classList.remove('hidden');
    }
  }

  // --- ВЫБОР РАЙОНОВ И ВЫШЕК НА КАРТЕ ---
  function onDistrictClick(districtId) {
    window.SoundEngine.ensureContext();
    window.SoundEngine.playClick();
    const idx = state.selectedDistricts.indexOf(districtId);
    if (idx >= 0) {
      state.selectedDistricts.splice(idx, 1);
    } else {
      state.selectedDistricts.push(districtId);
    }
    updateHUD();
  }

  function onTowerClick(towerId) {
    window.SoundEngine.ensureContext();
    window.SoundEngine.playClick();
    const t = state.towers[towerId];
    if (!t || t.status === 'ok') return;
    state.selectedTowerId = towerId;
    updateTowerDiagUI();
  }

  // --- РЕМОНТ ВЫШЕК ---
  function rebootSelectedTower() {
    const t = state.towers[state.selectedTowerId];
    if (!t || t.status !== 'broken') return;
    window.SoundEngine.playReboot();

    if (t.faultType === 'hardware' && !hasUpgrade('satellite_link')) {
      window.SoundEngine.playError();
      addLog(`${t.name}: перезагрузка не помогла (обрыв кабеля)! Отправьте рембригаду.`, 'err');
      return;
    }

    t.status = 'repairing';
    t.repairMode = 'reboot';
    t.progress = 0;
    t.duration = 2.0;
    addLog(`Запущена дистанционная перезагрузка вышки ${t.name}...`, 'info');
    updateTowerDiagUI();
  }

  function dispatchCrewToTower() {
    const t = state.towers[state.selectedTowerId];
    if (!t || t.status !== 'broken') return;
    window.SoundEngine.playClick();
    t.status = 'repairing';
    t.repairMode = 'crew';
    t.progress = 0;
    t.duration = hasUpgrade('backup_generator') ? 2.8 : 5.5;
    addLog(`Ремонтная бригада выехала на объект ${t.name} (${t.districtName}).`, 'warn');
    updateTowerDiagUI();
  }

  function triggerRandomBreakdown(forceStorm = false) {
    const diff = getDiff();
    const okTowers = Object.values(state.towers).filter((t) => t.status === 'ok');
    if (okTowers.length === 0) return;
    const brokenCount = Object.values(state.towers).filter((t) => t.status !== 'ok').length;
    if (brokenCount >= diff.maxBrokenTowers) return;

    const target = okTowers[Math.floor(Math.random() * okTowers.length)];
    const isHardware = diff.hardwareFaultChance <= 0
      ? false
      : forceStorm
        ? (!hasUpgrade('backup_generator') && Math.random() < Math.min(0.9, diff.hardwareFaultChance + 0.25))
        : Math.random() < diff.hardwareFaultChance;

    target.status = 'broken';
    target.faultType = isHardware ? 'hardware' : 'software';
    target.progress = 0;
    state.selectedTowerId = target.id;

    window.SoundEngine.playThunder();
    addLog(
      `ПОЛОМКА НА ЛИНИИ! Вышка ${target.name} (${target.districtName}) — «НЕТ СВЯЗИ»!`,
      'err'
    );
    updateTowerDiagUI();
  }

  // --- ДОНЕСЕНИЯ ---
  function pickNextIncident() {
    const shift = window.GAME_DATA.SHIFTS[state.shiftIndex];
    const roll = Math.random();
    let poolType = 'real';
    if (roll < shift.hoaxChance) poolType = 'hoax';
    else if (roll < shift.hoaxChance + shift.drillChance) poolType = 'drill';

    let candidates = window.GAME_DATA.INCIDENTS.filter(
      (i) => i.type === poolType && !state.recentIncidentIds.includes(i.id)
    );
    if (candidates.length === 0) {
      candidates = window.GAME_DATA.INCIDENTS.filter((i) => i.type === poolType);
    }
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    state.recentIncidentIds.push(chosen.id);
    if (state.recentIncidentIds.length > 6) state.recentIncidentIds.shift();
    return chosen;
  }

  function spawnIncident() {
    const shift = window.GAME_DATA.SHIFTS[state.shiftIndex];
    const diff = getDiff();
    const inc = pickNextIncident();
    state.activeIncident = inc;
    const bonusTime = hasUpgrade('loud_towers') ? 6 : 0;
    state.incidentMaxTime = Math.max(15, shift.baseResponseTime + diff.timeDelta + bonusTime);
    state.incidentTimeLeft = state.incidentMaxTime;

    el.alarmLamp.classList.add('flashing');
    el.dispatchPanel.classList.remove('standby');
    el.dispatchPanel.classList.add('urgent');
    el.dispatchFooter.classList.remove('hidden');

    renderDispatchCard(inc);
    window.SoundEngine.playAlarmBuzzer();

    addLog(`Срочное донесение от [${inc.source}]: ${inc.title}`, 'warn');

    // Шанс поломки вышки во время грозового донесения
    if (inc.weatherStorm) {
      const baseChance = hasUpgrade('satellite_link') ? 0.28 : 0.6;
      if (Math.random() < Math.min(0.9, baseChance * diff.breakdownMult)) {
        setTimeout(() => {
          if (state.running && !state.paused) triggerRandomBreakdown(true);
        }, 1800);
      }
    }
  }

  function renderDispatchCard(inc) {
    const diff = getDiff();
    let bodyHtml = inc.text;
    let sourceClass = 'dispatch-source';

    // На простом уровне подсвечиваем нужные районы в тексте
    if (diff.showHints && inc.districts && inc.districts.length > 0) {
      const stems = {
        center: ['ЦЕНТР[А-ЯЁ]*'],
        factory: ['ЗАВОДСК[А-ЯЁ]*'],
        port: ['ПОРТ[А-ЯЁ]*'],
        forest: ['ЛЕСН[А-ЯЁ]*'],
        residential: ['СПАЛЬН[А-ЯЁ]*'],
        airport: ['АЭРОПОРТ[А-ЯЁ]*']
      };
      inc.districts.forEach((dId) => {
        (stems[dId] || []).forEach((pattern) => {
          const re = new RegExp(`(${pattern})`, 'g');
          bodyHtml = bodyHtml.replace(re, '<span class="district-hl">$1</span>');
        });
      });
    }

    // Если куплен Анализатор помех — подсвечиваем подозрительные слова в розыгрышах
    if (inc.type === 'hoax' && hasUpgrade('spam_filter')) {
      sourceClass += ' suspicious';
      if (inc.suspiciousWords) {
        inc.suspiciousWords.forEach((phrase) => {
          const re = new RegExp(`(${phrase})`, 'gi');
          bodyHtml = bodyHtml.replace(re, '<span class="suspect-hl">$1</span>');
        });
      }
    }

    const typeHint = inc.type === 'hoax' && hasUpgrade('spam_filter')
      ? '<span style="color:#ffcf5c">⚠ ПОДОЗРИТЕЛЬНЫЙ КАНАЛ</span>'
      : '<span>ПРИОРИТЕТ: ВЫСОКИЙ</span>';

    let easyHintHtml = '';
    if (diff.showHints) {
      if (inc.type === 'real') {
        easyHintHtml = '<div class="easy-hint-bar">💡 Подсказка стажёру: 📢 Протяжный ревун + 📺 Перехват ТВ ВКЛ</div>';
      } else if (inc.type === 'drill') {
        easyHintHtml = '<div class="easy-hint-bar">💡 Подсказка стажёру: 🔔 Короткие гудки + 📺 Перехват ТВ ВЫКЛ</div>';
      } else if (inc.type === 'hoax') {
        easyHintHtml = '<div class="easy-hint-bar">💡 Подсказка стажёру: похоже на шутку — нажмите «Отклонить»!</div>';
      }
    }

    el.dispatchContent.innerHTML = `
      <div class="dispatch-meta">
        <span class="${sourceClass}">${inc.source}</span>
        ${typeHint}
      </div>
      <div class="dispatch-title">${inc.title}</div>
      <div>${bodyHtml}</div>
      ${easyHintHtml}
    `;
  }

  function clearActiveIncident() {
    state.activeIncident = null;
    el.alarmLamp.classList.remove('flashing');
    el.dispatchPanel.classList.remove('urgent');
    el.dispatchPanel.classList.add('standby');
    el.dispatchFooter.classList.add('hidden');
    el.dispatchTimerLabel.textContent = 'ОЖИДАНИЕ';
    el.dispatchTimerBar.style.width = '100%';
    el.dispatchTimerBar.style.backgroundColor = 'var(--crt-green)';
    el.dispatchContent.innerHTML = `
      <div class="standby-msg">
        Линия спокойна. Ожидание следующего донесения...
      </div>
    `;

    const shift = window.GAME_DATA.SHIFTS[state.shiftIndex];
    const [minI, maxI] = shift.incidentInterval;
    const baseWait = minI * 0.45 + Math.random() * ((maxI - minI) * 0.55);
    state.nextIncidentIn = Math.max(2.5, baseWait * getDiff().intervalMult);
  }

  // --- ОБРАБОТКА НАЖАТИЯ «В ЭФИР» ---
  function handleBroadcast() {
    window.SoundEngine.ensureContext();
    window.SoundEngine.playClick();

    if (!state.running) return;
    const inc = state.activeIncident;
    if (!inc) {
      addLog('Нет активного донесения! Для проверки звука используйте «Прослушать звук сирены».', 'warn');
      return;
    }

    // Если это ложный вызов — игрок попался!
    if (inc.type === 'hoax') {
      window.SoundEngine.playSiren(state.sirenModel, state.sirenMode);
      window.CityMap.spawnAcousticWaves(
        state.selectedDistricts.length ? state.selectedDistricts : ['center'],
        state.sirenMode
      );
      setTimeout(() => window.SoundEngine.playError(), 500);

      state.score = Math.max(0, state.score - 70);
      const hoaxPanic = scalePanic(18);
      state.panic = Math.min(100, state.panic + hoaxPanic);
      state.mistakesCount++;
      addLog(`ОШИБКА! Это был ЛОЖНЫЙ ВЫЗОВ (розыгрыш)! -70 очков, +${hoaxPanic}% паники.`, 'err');
      clearActiveIncident();
      scheduleResetControls();
      saveProgress();
      updateHUD();
      checkPanicGameOver();
      return;
    }

    // Реальная угроза или плановая проверка
    if (state.selectedDistricts.length === 0) {
      window.SoundEngine.playError();
      addLog('Сначала выберите хотя бы один район на карте!', 'err');
      return;
    }

    // Звук сирены + волны на карте + диктор громкоговорителя
    window.SoundEngine.playSiren(state.sirenModel, state.sirenMode);
    window.CityMap.spawnAcousticWaves(state.selectedDistricts, state.sirenMode);
    window.SoundEngine.playRadioBroadcast(getAssembledMessageText());

    // Проверка правильности выполнения всех 4 шагов
    const issues = [];
    let penaltyPts = 0;
    let panicAdd = 0;

    // 1. Районы
    const missing = inc.districts.filter((d) => !state.selectedDistricts.includes(d));
    const extra = state.selectedDistricts.filter((d) => !inc.districts.includes(d));

    if (missing.length > 0) {
      issues.push(`пропущен район (${missing.length})`);
      penaltyPts += missing.length * 45;
      panicAdd += missing.length * 12;
    }
    if (extra.length > 0) {
      issues.push(`лишняя паника в чужом районе (${extra.length})`);
      penaltyPts += extra.length * 35;
      panicAdd += extra.length * 10;
    }

    // Проверка сломанных вышек в целевых районах
    let brokenInTarget = 0;
    inc.districts.forEach((dId) => {
      const dist = window.GAME_DATA.DISTRICTS.find((x) => x.id === dId);
      if (dist) {
        dist.towers.forEach((t) => {
          if (state.towers[t.id] && state.towers[t.id].status !== 'ok') {
            brokenInTarget++;
          }
        });
      }
    });
    if (brokenInTarget > 0) {
      issues.push(`неисправная вышка в зоне оповещения`);
      penaltyPts += brokenInTarget * 25;
      panicAdd += brokenInTarget * 5;
    }

    // 2. Режим сирены
    if (state.sirenMode !== inc.sirenMode) {
      issues.push(inc.sirenMode === 'long' ? 'нужен протяжный ревун' : 'для проверки нужны короткие гудки');
      penaltyPts += 35;
      panicAdd += 6;
    }

    // 3. Конструктор сообщения
    const chosenMsg = [el.msgSlot1.value, el.msgSlot2.value, el.msgSlot3.value];
    let msgWrong = 0;
    for (let i = 0; i < 3; i++) {
      if (chosenMsg[i] !== inc.message[i]) msgWrong++;
    }
    if (msgWrong > 0) {
      issues.push(`неверный текст сообщения (${msgWrong} бл.)`);
      penaltyPts += msgWrong * 22;
      panicAdd += msgWrong * 3;
    }

    // 4. Перехват ТВ и радио
    if (state.tvIntercept !== inc.tvRequired) {
      issues.push(inc.tvRequired ? 'не перехвачено ТВ/Радио' : 'зря прервали ТВ во время проверки');
      penaltyPts += 35;
      panicAdd += inc.tvRequired ? 8 : 5;
    }

    // Итог расчёта
    const speedBonus = Math.round((state.incidentTimeLeft / state.incidentMaxTime) * 40);
    let earned = Math.max(20, 160 + speedBonus - penaltyPts);
    if (hasUpgrade('loud_towers')) earned = Math.round(earned * 1.2);
    earned = scaleScore(earned);

    state.handledCount++;

    if (issues.length === 0) {
      state.perfectCount++;
      state.score += earned;
      state.shiftScoreEarned += earned;
      state.panic = Math.max(0, state.panic - 5);
      setTimeout(() => window.SoundEngine.playSuccess(), 650);
      addLog(`ИДЕАЛЬНОЕ ОПОВЕЩЕНИЕ! +${earned} очков (бонус скорости +${speedBonus}).`, 'ok');
    } else {
      state.mistakesCount++;
      const net = Math.max(10, earned);
      const scaledPanic = scalePanic(panicAdd);
      state.score += net;
      state.shiftScoreEarned += net;
      state.panic = Math.min(100, state.panic + scaledPanic);
      addLog(`Оповещение с ошибками (+${net} оч., +${scaledPanic}% паники): ${issues.join('; ')}.`, 'warn');
    }

    clearActiveIncident();
    scheduleResetControls();
    saveProgress();
    updateHUD();
    checkPanicGameOver();
  }

  function scheduleResetControls() {
    state.selectedDistricts = [];
    if (state.tvResetTimeout) clearTimeout(state.tvResetTimeout);
    state.tvResetTimeout = setTimeout(() => {
      if (state.tvIntercept) {
        state.tvIntercept = false;
        el.tvInterceptSwitch.checked = false;
        updateTVScreen();
      }
    }, 3200);
  }

  // --- ОТКЛОНЕНИЕ ЛОЖНОГО ВЫЗОВА ---
  function handleRejectHoax() {
    window.SoundEngine.ensureContext();
    window.SoundEngine.playClick();
    if (!state.running || !state.activeIncident) return;

    const inc = state.activeIncident;
    state.handledCount++;

    if (inc.type === 'hoax') {
      const reward = scaleScore(hasUpgrade('loud_towers') ? 110 : 90);
      state.score += reward;
      state.shiftScoreEarned += reward;
      state.perfectCount++;
      state.panic = Math.max(0, state.panic - 3);
      window.SoundEngine.playSuccess();
      addLog(`БРАВО! Ложный вызов «${inc.title}» отклонён. +${reward} очков!`, 'ok');
    } else {
      state.score = Math.max(0, state.score - 80);
      const rejectPanic = scalePanic(22);
      state.panic = Math.min(100, state.panic + rejectPanic);
      state.mistakesCount++;
      window.SoundEngine.playError();
      addLog(`ТРЕВОГА ПРОПУЩЕНА! Вы отклонили реальное донесение! -80 очков, +${rejectPanic}% паники.`, 'err');
    }

    clearActiveIncident();
    state.selectedDistricts = [];
    saveProgress();
    updateHUD();
    checkPanicGameOver();
  }

  function checkPanicGameOver() {
    if (state.panic >= 100 && state.running) {
      endShift(false);
    }
  }

  // --- УПРАВЛЕНИЕ СМЕНОЙ ---
  function startShift(shiftIdx) {
    window.SoundEngine.ensureContext();
    window.SoundEngine.playClick();

    state.shiftIndex = shiftIdx;
    const shift = window.GAME_DATA.SHIFTS[shiftIdx];
    state.shiftTimeLeft = shift.duration;
    state.shiftScoreEarned = 0;
    state.panic = 0;
    state.handledCount = 0;
    state.perfectCount = 0;
    state.mistakesCount = 0;
    state.selectedDistricts = [];
    state.tvIntercept = false;
    el.tvInterceptSwitch.checked = false;
    state.recentIncidentIds = [];

    initTowers();
    clearActiveIncident();
    const diff = getDiff();
    state.nextIncidentIn = 2.8;
    state.nextBreakdownIn = Math.max(12, (hasUpgrade('satellite_link') ? 45 : 24) / diff.breakdownMult);

    el.shiftTitle.textContent = shift.title;
    el.startModal.classList.add('hidden');
    el.summaryModal.classList.add('hidden');

    state.running = true;
    state.paused = false;

    updateTVScreen();
    updateHUD();
    addLog(`Заступление на ${shift.title} (режим: ${diff.name}). Удачного дежурства!`, 'ok');
  }

  function endShift(success) {
    state.running = false;
    clearActiveIncident();
    window.SoundEngine.stopSiren();

    if (success) {
      window.SoundEngine.playSuccess();
      el.summaryBadge.textContent = 'СМЕНА УСПЕШНО ЗАВЕРШЕНА';
      el.summaryTitle.textContent = 'ОТЛИЧНАЯ РАБОТА, ДЕЖУРНЫЙ!';
      el.summaryText.textContent =
        'Город спокойно пережил вашу смену. Вы можете потратить заработанные очки на прокачку пульта и заступить на следующую смену.';
    } else {
      window.SoundEngine.playError();
      el.summaryBadge.textContent = 'КРИТИЧЕСКИЙ УРОВЕНЬ ПАНИКИ';
      el.summaryTitle.textContent = 'СМЕНА ПРОВАЛЕНА (ПАНИКА 100%)';
      el.summaryText.textContent =
        'Из-за ошибок и задержек в городе поднялась сильная паника. Улучшите оборудование пульта и попробуйте снова!';
    }

    el.summaryStats.innerHTML = `
      <div class="stat-card"><div class="s-val">+${state.shiftScoreEarned}</div><div class="s-lbl">Очков за смену</div></div>
      <div class="stat-card"><div class="s-val">${state.perfectCount} / ${state.handledCount}</div><div class="s-lbl">Идеальных вызовов</div></div>
      <div class="stat-card"><div class="s-val">${Math.round(state.panic)}%</div><div class="s-lbl">Итоговая паника</div></div>
    `;

    const nextIdx = Math.min(window.GAME_DATA.SHIFTS.length - 1, state.shiftIndex + (success ? 1 : 0));
    el.btnNextShift.textContent = success
      ? (state.shiftIndex < window.GAME_DATA.SHIFTS.length - 1 ? `▶ Смена №${nextIdx + 1}` : '▶ Повторить Смену №3')
      : '▶ Попробовать смену снова';
    el.btnNextShift.onclick = () => startShift(nextIdx);

    saveProgress();

    // Отправляем результат смены в облако и таблицу лидеров
    if (window.CloudService && window.CloudService.getUser()) {
      const shiftNum = window.GAME_DATA.SHIFTS[state.shiftIndex].number;
      window.CloudService.syncProfileNow({
        score: state.score,
        bestShiftScore: state.shiftScoreEarned,
        addPerfect: state.perfectCount,
        upgrades: state.upgrades,
        difficulty: state.difficulty
      });
      if (state.shiftScoreEarned > 0) {
        window.CloudService.submitShiftRun({
          shiftNumber: shiftNum,
          difficulty: state.difficulty,
          shiftScore: state.shiftScoreEarned,
          perfectCount: state.perfectCount,
          handledCount: state.handledCount
        }).then((res) => {
          if (res && res.ok) {
            addLog(`Рекорд смены (+${state.shiftScoreEarned} оч.) отправлен в таблицу лидеров!`, 'ok');
          }
        });
      }
    }

    el.summaryModal.classList.remove('hidden');
  }

  // --- МАГАЗИН ПРОКАЧКИ ПУЛЬТА ---
  function renderUpgradesModal() {
    el.upgradeBudget.textContent = state.score;
    el.upgradesGrid.innerHTML = '';

    window.GAME_DATA.UPGRADES.forEach((upg) => {
      const owned = hasUpgrade(upg.id);
      const canBuy = state.score >= upg.cost;

      const card = document.createElement('div');
      card.className = `upgrade-card ${owned ? 'owned' : ''}`;
      card.innerHTML = `
        <div>
          <div class="upg-head">
            <span>${upg.icon} ${upg.name}</span>
            <span style="color:${owned ? '#39ff88' : '#ffb833'}">${owned ? 'УСТАНОВЛЕНО' : upg.cost + ' ★'}</span>
          </div>
          <p class="upg-desc">${upg.desc}</p>
        </div>
        <button class="hw-btn ${owned ? '' : (canBuy ? 'action-amber' : '')}" ${owned || !canBuy ? 'disabled' : ''}>
          ${owned ? '✓ В строю' : (canBuy ? 'Купить и установить' : 'Недостаточно очков')}
        </button>
      `;

      const btn = card.querySelector('button');
      if (!owned && canBuy) {
        btn.addEventListener('click', () => {
          state.score -= upg.cost;
          state.upgrades.push(upg.id);
          window.SoundEngine.playSuccess();
          addLog(`Установлено улучшение: ${upg.name}!`, 'ok');
          saveProgress();
          updateHUD();
          renderUpgradesModal();
        });
      }
      el.upgradesGrid.appendChild(card);
    });
  }

  // --- ГЛАВНЫЙ ЦИКЛ ИГРЫ ---
  let lastTick = performance.now();

  function gameLoop(now) {
    const dt = Math.min(0.1, (now - lastTick) / 1000);
    lastTick = now;

    if (state.running && !state.paused) {
      // Таймер смены
      state.shiftTimeLeft -= dt;
      if (state.shiftTimeLeft <= 0) {
        state.shiftTimeLeft = 0;
        updateHUD();
        endShift(true);
      } else {
        // Смена телепередач в обычном режиме
        state.tvProgramTimer += dt;
        if (state.tvProgramTimer >= 12) {
          state.tvProgramTimer = 0;
          state.tvProgramIndex = (state.tvProgramIndex + 1) % window.GAME_DATA.TV_PROGRAMS.length;
          if (!state.tvIntercept) updateTVScreen();
        }

        // Обновление ремонта вышек
        let diagChanged = false;
        Object.values(state.towers).forEach((t) => {
          if (t.status === 'repairing') {
            t.progress += dt / t.duration;
            diagChanged = true;
            if (t.progress >= 1) {
              t.status = 'ok';
              t.progress = 0;
              t.faultType = null;
              const pts = t.repairMode === 'reboot' ? 25 : 35;
              state.score += pts;
              state.shiftScoreEarned += pts;
              window.SoundEngine.playSuccess();
              addLog(`Вышка ${t.name} восстановлена и снова в сети! (+${pts} оч.)`, 'ok');
              saveProgress();
            }
          }
        });
        if (diagChanged) updateTowerDiagUI();

        // Случайные поломки на линии
        state.nextBreakdownIn -= dt;
        if (state.nextBreakdownIn <= 0) {
          const shift = window.GAME_DATA.SHIFTS[state.shiftIndex];
          const diff = getDiff();
          const mod = (hasUpgrade('satellite_link') ? 0.5 : 1.0) * diff.breakdownMult;
          if (Math.random() < Math.min(0.92, shift.breakdownChance * mod)) {
            triggerRandomBreakdown(false);
          }
          const baseCd = hasUpgrade('satellite_link') ? 38 : 22;
          state.nextBreakdownIn = Math.max(11, (baseCd + Math.random() * 14) / diff.breakdownMult);
        }

        // Активное донесение или ожидание нового
        if (state.activeIncident) {
          state.incidentTimeLeft -= dt;
          const pct = Math.max(0, (state.incidentTimeLeft / state.incidentMaxTime) * 100);
          el.dispatchTimerBar.style.width = `${pct}%`;
          el.dispatchTimerLabel.textContent = `ОСТАЛОСЬ: ${Math.max(0, state.incidentTimeLeft).toFixed(1)} с`;
          el.dispatchTimerBar.style.backgroundColor =
            pct > 45 ? 'var(--crt-green)' : (pct > 20 ? 'var(--amber)' : 'var(--red-alert)');

          if (state.incidentTimeLeft <= 0) {
            const inc = state.activeIncident;
            if (inc.type === 'hoax') {
              addLog('Ложный вызов оборвался сам. Совет: отклоняйте их вручную за бонус!', 'info');
            } else {
              state.score = Math.max(0, state.score - 90);
              const timeoutPanic = scalePanic(25);
              state.panic = Math.min(100, state.panic + timeoutPanic);
              state.mistakesCount++;
              window.SoundEngine.playError();
              addLog(`ВРЕМЯ ВЫШЛО! Вы не успели оповестить город о «${inc.title}»! -90 оч., +${timeoutPanic}% паники.`, 'err');
              saveProgress();
              checkPanicGameOver();
            }
            clearActiveIncident();
          }
        } else {
          state.nextIncidentIn -= dt;
          if (state.nextIncidentIn <= 0) {
            spawnIncident();
          }
        }

        updateHUD();
      }
    }

    requestAnimationFrame(gameLoop);
  }

  // --- ПРИВЯЗКА КНОПОК ---
  function bindEvents() {
    el.btnClearDistricts.addEventListener('click', () => {
      window.SoundEngine.playClick();
      state.selectedDistricts = [];
      updateHUD();
    });

    el.btnRebootTower.addEventListener('click', rebootSelectedTower);
    el.btnDispatchCrew.addEventListener('click', dispatchCrewToTower);

    // Режим сирены (протяжный / короткие)
    [el.btnModeLong, el.btnModeShort].forEach((btn) => {
      btn.addEventListener('click', () => {
        window.SoundEngine.ensureContext();
        window.SoundEngine.playClick();
        state.sirenMode = btn.dataset.mode;
        el.btnModeLong.classList.toggle('active', state.sirenMode === 'long');
        el.btnModeShort.classList.toggle('active', state.sirenMode === 'short');
      });
    });

    // Выбор модели сирены
    [el.modelS40, el.modelTornado, el.modelModern].forEach((btn) => {
      btn.addEventListener('click', () => {
        const model = btn.dataset.model;
        if (model === 'tornado' && !hasUpgrade('siren_tornado')) {
          addLog('Откройте сирену «Американская торнадо» в меню «Прокачка»!', 'warn');
          return;
        }
        if (model === 'modern' && !hasUpgrade('siren_modern')) {
          addLog('Откройте «Современную цифровую сирену» в меню «Прокачка»!', 'warn');
          return;
        }
        window.SoundEngine.ensureContext();
        window.SoundEngine.playClick();
        state.sirenModel = model;
        [el.modelS40, el.modelTornado, el.modelModern].forEach((b) => {
          b.classList.toggle('active', b.dataset.model === model);
        });
      });
    });

    el.btnTestSiren.addEventListener('click', () => {
      window.SoundEngine.ensureContext();
      window.SoundEngine.playSiren(state.sirenModel, state.sirenMode);
    });

    // Тумблер перехвата ТВ/Радио
    el.tvInterceptSwitch.addEventListener('change', () => {
      window.SoundEngine.ensureContext();
      state.tvIntercept = el.tvInterceptSwitch.checked;
      window.SoundEngine.playSwitch(state.tvIntercept);
      if (state.tvIntercept) window.SoundEngine.playTvIntercept();
      updateTVScreen();
    });

    // Конструктор сообщений
    [el.msgSlot1, el.msgSlot2, el.msgSlot3].forEach((sel) => {
      sel.addEventListener('change', () => {
        window.SoundEngine.playClick();
        updateMessagePreview();
      });
    });

    el.btnBroadcast.addEventListener('click', handleBroadcast);
    el.btnRejectHoax.addEventListener('click', handleRejectHoax);

    // Звук и голос
    el.btnSound.addEventListener('click', () => {
      const nextMuted = !window.SoundEngine.isMuted();
      window.SoundEngine.setMuted(nextMuted);
      el.btnSound.classList.toggle('active', !nextMuted);
      el.btnSound.textContent = nextMuted ? '🔇 Без звука' : '🔊 Звук';
    });

    el.btnVoice.addEventListener('click', () => {
      const nextVoice = !window.SoundEngine.isVoiceEnabled();
      window.SoundEngine.setVoiceEnabled(nextVoice);
      el.btnVoice.classList.toggle('active', nextVoice);
      el.btnVoice.textContent = nextVoice ? '🗣️ Диктор' : '🗣️ Выкл';
    });

    // Модалка прокачки
    const openUpgrades = () => {
      window.SoundEngine.playClick();
      state.paused = true;
      renderUpgradesModal();
      el.upgradesModal.classList.remove('hidden');
    };
    el.btnUpgrades.addEventListener('click', openUpgrades);
    el.btnSummaryUpgrades.addEventListener('click', openUpgrades);
    el.btnCloseUpgrades.addEventListener('click', () => {
      window.SoundEngine.playClick();
      el.upgradesModal.classList.add('hidden');
      state.paused = false;
    });

    // Модалка регламента
    el.btnManual.addEventListener('click', () => {
      window.SoundEngine.playClick();
      state.paused = true;
      el.manualModal.classList.remove('hidden');
    });
    el.btnCloseManual.addEventListener('click', () => {
      window.SoundEngine.playClick();
      el.manualModal.classList.add('hidden');
      state.paused = false;
    });

    // Выбор сложности на стартовом экране
    function renderDifficultySelector() {
      el.difficultyButtons.innerHTML = '';
      Object.values(window.GAME_DATA.DIFFICULTIES).forEach((d) => {
        const btn = document.createElement('button');
        btn.className = `hw-btn diff-choice-btn diff-${d.id} ${state.difficulty === d.id ? 'active' : ''}`;
        btn.innerHTML = `${d.badge}<small>${d.subtitle}</small>`;
        btn.addEventListener('click', () => {
          window.SoundEngine.ensureContext();
          window.SoundEngine.playClick();
          state.difficulty = d.id;
          saveProgress();
          renderDifficultySelector();
          updateHUD();
        });
        el.difficultyButtons.appendChild(btn);
      });
      el.difficultyDesc.textContent = getDiff().desc;
    }
    renderDifficultySelector();

    if (el.btnSummaryMenu) {
      el.btnSummaryMenu.addEventListener('click', () => {
        window.SoundEngine.playClick();
        el.summaryModal.classList.add('hidden');
        renderDifficultySelector();
        el.startModal.classList.remove('hidden');
      });
    }

    // Выбор смены на стартовом экране
    window.GAME_DATA.SHIFTS.forEach((sh, idx) => {
      const btn = document.createElement('button');
      btn.className = `hw-btn shift-choice-btn ${idx === 0 ? 'active' : ''}`;
      btn.innerHTML = `Смена №${sh.number}<br><small>${Math.round(sh.duration / 60)} мин</small>`;
      btn.addEventListener('click', () => {
        state.shiftIndex = idx;
        el.shiftButtons.querySelectorAll('button').forEach((b, i) => {
          b.classList.toggle('active', i === idx);
        });
      });
      el.shiftButtons.appendChild(btn);
    });

    el.btnStartShift.addEventListener('click', () => startShift(state.shiftIndex));

    // --- АВТОРИЗАЦИЯ И ПРОФИЛЬ ---
    let authMode = 'login'; // 'login' | 'register'

    function showAuthMsg(text, isError = false) {
      el.authMessage.textContent = text;
      el.authMessage.className = `auth-msg ${isError ? 'err' : 'ok'}`;
    }

    function setAuthMode(mode) {
      authMode = mode;
      el.tabLogin.classList.toggle('active', mode === 'login');
      el.tabRegister.classList.toggle('active', mode === 'register');
      el.callsignField.classList.toggle('hidden', mode !== 'register');
      el.btnAuthSubmit.textContent = mode === 'login' ? '▶ ВОЙТИ В СИСТЕМУ' : '▶ СОЗДАТЬ АККАУНТ';
      el.authMessage.classList.add('hidden');
    }

    function updateAuthModalView() {
      const user = window.CloudService && window.CloudService.getUser();
      const profile = window.CloudService && window.CloudService.getProfile();
      if (user) {
        el.authGuestView.classList.add('hidden');
        el.authGuestFooter.classList.add('hidden');
        el.authProfileView.classList.remove('hidden');
        el.profileEmail.textContent = user.email || '—';
        el.profileBestShift.textContent = `${profile?.best_shift_score || 0} ★`;
        el.profileCallsignInput.value = profile?.callsign || '';
        el.profileMsg.classList.add('hidden');
      } else {
        el.authGuestView.classList.remove('hidden');
        el.authGuestFooter.classList.remove('hidden');
        el.authProfileView.classList.add('hidden');
      }
    }

    function openAuthModal() {
      window.SoundEngine.playClick();
      state.paused = true;
      updateAuthModalView();
      el.authModal.classList.remove('hidden');
    }

    function closeAuthModal() {
      window.SoundEngine.playClick();
      el.authModal.classList.add('hidden');
      state.paused = false;
    }

    el.btnAuth.addEventListener('click', openAuthModal);
    if (el.btnStartAuth) el.btnStartAuth.addEventListener('click', openAuthModal);
    el.btnCloseAuth.addEventListener('click', closeAuthModal);
    el.btnCloseAuthLogged.addEventListener('click', closeAuthModal);
    el.tabLogin.addEventListener('click', () => { window.SoundEngine.playClick(); setAuthMode('login'); });
    el.tabRegister.addEventListener('click', () => { window.SoundEngine.playClick(); setAuthMode('register'); });

    el.authForm.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      if (!window.CloudService || !window.CloudService.isAvailable()) {
        showAuthMsg('Облачный сервис недоступен (проверьте интернет).', true);
        return;
      }
      const email = el.inputEmail.value.trim();
      const password = el.inputPassword.value;
      const callsign = el.inputCallsign.value.trim();

      el.btnAuthSubmit.disabled = true;
      el.btnAuthSubmit.textContent = 'ПОДКЛЮЧЕНИЕ...';

      const res = authMode === 'login'
        ? await window.CloudService.signIn(email, password)
        : await window.CloudService.signUp(email, password, callsign);

      el.btnAuthSubmit.disabled = false;
      setAuthMode(authMode);

      if (res.error) {
        showAuthMsg(res.error, true);
      } else if (res.needsConfirm) {
        showAuthMsg(res.message, false);
      } else {
        window.SoundEngine.playSuccess();
        updateAuthModalView();
      }
    });

    el.btnSaveCallsign.addEventListener('click', async () => {
      const next = el.profileCallsignInput.value.trim();
      if (next.length < 2) {
        el.profileMsg.textContent = 'Позывной должен быть не короче 2 символов.';
        el.profileMsg.className = 'auth-msg err';
        return;
      }
      const res = await window.CloudService.updateCallsign(next);
      if (res.error) {
        el.profileMsg.textContent = res.error;
        el.profileMsg.className = 'auth-msg err';
      } else {
        window.SoundEngine.playSuccess();
        el.profileMsg.textContent = `Позывной обновлён: ${res.callsign}`;
        el.profileMsg.className = 'auth-msg ok';
      }
    });

    el.btnLogout.addEventListener('click', async () => {
      window.SoundEngine.playClick();
      await window.CloudService.signOut();
      addLog('Вы вышли из облачного аккаунта. Включён локальный режим.', 'info');
      updateAuthModalView();
    });

    // --- ТАБЛИЦА ЛИДЕРОВ ---
    let currentLbTab = 'all';

    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    async function loadLeaderboard(tabMode = currentLbTab) {
      currentLbTab = tabMode;
      el.lbTabs.querySelectorAll('.lb-tab').forEach((b) => {
        b.classList.toggle('active', b.dataset.lb === tabMode);
      });

      const user = window.CloudService && window.CloudService.getUser();
      el.lbGuestBanner.classList.toggle('hidden', Boolean(user));
      el.lbStatus.textContent = 'Загрузка рейтинга...';
      el.lbBody.innerHTML = '';

      if (!window.CloudService || !window.CloudService.isAvailable()) {
        el.lbStatus.textContent = 'Нет подключения к облаку.';
        return;
      }

      const res = await window.CloudService.fetchLeaderboard(tabMode);
      if (res.error) {
        el.lbStatus.textContent = `Ошибка загрузки: ${res.error}`;
        return;
      }

      const myId = user ? user.id : null;
      const diffLabels = { easy: '🟢 Простой', medium: '🟡 Средний', hard: '🔴 Сложный' };

      if (res.kind === 'profiles') {
        el.lbHead.innerHTML = '<tr><th>#</th><th>Позывной</th><th>Лучшая смена</th><th>Идеальных</th><th>Бюджет ★</th></tr>';
        if (res.rows.length === 0) {
          el.lbStatus.textContent = 'Пока нет зарегистрированных дежурных. Станьте первым!';
          return;
        }
        el.lbStatus.textContent = `Показано лучших дежурных: ${res.rows.length}`;
        el.lbBody.innerHTML = res.rows.map((r, i) => {
          const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
          const isMe = myId && r.id === myId;
          return `
            <tr class="${isMe ? 'lb-me' : ''}">
              <td>${rank}</td>
              <td>${escapeHtml(r.callsign)}${isMe ? ' (вы)' : ''}</td>
              <td>${r.best_shift_score || 0}</td>
              <td>${r.total_perfect || 0}</td>
              <td class="lb-score-cell">${r.score || 0} ★</td>
            </tr>
          `;
        }).join('');
      } else {
        el.lbHead.innerHTML = '<tr><th>#</th><th>Позывной</th><th>Сложность</th><th>Смена</th><th>Идеально</th><th>Очки</th></tr>';
        if (res.rows.length === 0) {
          el.lbStatus.textContent = 'В этой категории пока нет записей. Завершите смену первым!';
          return;
        }
        el.lbStatus.textContent = `Топ смен (${res.rows.length}):`;
        el.lbBody.innerHTML = res.rows.map((r, i) => {
          const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
          const isMe = myId && r.user_id === myId;
          return `
            <tr class="${isMe ? 'lb-me' : ''}">
              <td>${rank}</td>
              <td>${escapeHtml(r.callsign)}${isMe ? ' (вы)' : ''}</td>
              <td>${diffLabels[r.difficulty] || r.difficulty}</td>
              <td>№${r.shift_number}</td>
              <td>${r.perfect_count}/${r.handled_count}</td>
              <td class="lb-score-cell">+${r.shift_score} ★</td>
            </tr>
          `;
        }).join('');
      }
    }

    const openLeaderboardModal = () => {
      window.SoundEngine.playClick();
      state.paused = true;
      el.leaderboardModal.classList.remove('hidden');
      loadLeaderboard(currentLbTab);
    };
    el.btnLeaderboard.addEventListener('click', openLeaderboardModal);
    if (el.btnStartLb) el.btnStartLb.addEventListener('click', openLeaderboardModal);

    el.btnCloseLeaderboard.addEventListener('click', () => {
      window.SoundEngine.playClick();
      el.leaderboardModal.classList.add('hidden');
      state.paused = false;
    });

    el.btnRefreshLb.addEventListener('click', () => {
      window.SoundEngine.playClick();
      loadLeaderboard(currentLbTab);
    });

    el.lbTabs.querySelectorAll('.lb-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.SoundEngine.playClick();
        loadLeaderboard(btn.dataset.lb);
      });
    });

    el.btnLbOpenAuth.addEventListener('click', () => {
      el.leaderboardModal.classList.add('hidden');
      openAuthModal();
    });

    // Реакция на вход/выход в облаке
    window._onCloudAuthChange = function (user, profile) {
      if (user && profile) {
        el.btnAuth.textContent = `👤 ${profile.callsign}`;
        el.btnAuth.classList.add('active');
        if (el.btnStartAuth) {
          el.btnStartAuth.textContent = `👤 ${profile.callsign}`;
          el.btnStartAuth.classList.add('active');
        }

        // Мягко объединяем локальный и облачный прогресс, чтобы ничего не потерять
        const mergedUpgrades = Array.from(new Set([...(state.upgrades || []), ...(profile.upgrades || [])]));
        const mergedScore = Math.max(state.score || 0, profile.score || 0);
        const changed = mergedScore !== profile.score || mergedUpgrades.length !== (profile.upgrades || []).length;

        state.upgrades = mergedUpgrades;
        state.score = mergedScore;
        if (profile.difficulty && window.GAME_DATA.DIFFICULTIES[profile.difficulty]) {
          state.difficulty = profile.difficulty;
        }
        renderDifficultySelector();
        updateHUD();
        updateAuthModalView();

        if (changed) {
          window.CloudService.syncProfileNow({
            score: state.score,
            upgrades: state.upgrades,
            difficulty: state.difficulty
          });
        }
        addLog(`Облачный профиль подключён: ${profile.callsign} (${state.score} ★).`, 'ok');
      } else {
        el.btnAuth.textContent = '👤 Войти';
        el.btnAuth.classList.remove('active');
        if (el.btnStartAuth) {
          el.btnStartAuth.textContent = '👤 Войти';
          el.btnStartAuth.classList.remove('active');
        }
        updateAuthModalView();
      }
    };
  }

  function init() {
    cacheDom();
    loadSave();
    initTowers();
    populateMessageBuilder();
    bindEvents();
    updateTVScreen();
    updateHUD();

    if (window.CloudService) {
      window.CloudService.init((user, profile) => {
        if (window._onCloudAuthChange) window._onCloudAuthChange(user, profile);
      });
    }

    window.CityMap.init(
      el.cityMap,
      () => state,
      onDistrictClick,
      onTowerClick
    );

    requestAnimationFrame(gameLoop);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
