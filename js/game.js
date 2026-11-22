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
    kolaAlert: false,

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
    tvResetTimeout: null,
    phoneAlertTimeout: null
  };

  // DOM элементы
  const el = {};

  function cacheDom() {
    const ids = [
      'alarmLamp', 'difficultyBadge', 'shiftTitle', 'shiftTimer', 'scoreValue', 'panicText', 'panicBar',
      'handledCount', 'langSelect', 'startLangSelect', 'btnSound', 'btnVoice', 'btnUpgrades', 'btnLeaderboard', 'btnAuth', 'btnAdmin', 'btnManual',
      'hqBanner', 'hqBannerText',
      'cityMap', 'selectedDistrictsText', 'btnClearDistricts',
      'towerDiagPanel', 'diagText', 'diagActions', 'btnRebootTower', 'btnDispatchCrew',
      'eventLog', 'dispatchPanel', 'dispatchTimerLabel', 'dispatchTimerBar',
      'dispatchContent', 'dispatchFooter', 'btnRejectHoax',
      'btnModeLong', 'btnModeShort', 'modelS40', 'modelTornado', 'modelModern', 'btnTestSiren',
      'tvScreen', 'tvNormalView', 'tvEmergencyView', 'tvChannel', 'tvIcon', 'tvTitle',
      'tvTickerText', 'tvInterceptSwitch', 'tvSwitchState',
      'kolaPanel', 'kolaTowerStatus', 'kolaAlertSwitch', 'kolaSwitchState',
      'phoneAlertPopup', 'phoneAlertFrame', 'phoneClock', 'phoneAlertZones', 'phoneAlertText', 'btnClosePhoneAlert',
      'msgSlot1', 'msgSlot2', 'msgSlot3', 'msgPreviewText', 'btnBroadcast',
      'startModal', 'btnStartAuth', 'btnStartLb', 'btnStartAdmin', 'difficultyButtons', 'difficultyDesc', 'shiftButtons', 'btnStartShift',
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
      'lbGuestBanner', 'btnLbOpenAuth', 'btnCloseLeaderboard',
      'adminModal', 'adminTabs', 'adminTabDebug', 'adminTabUsers', 'adminTabHq',
      'admSpawnReal', 'admSpawnDrill', 'admSpawnHoax', 'admSpawnBreak',
      'admAddScore', 'admResetPanic', 'admFixTowers', 'admFinishShift', 'adminDebugMsg',
      'adminUsersStatus', 'btnAdmRefreshUsers', 'adminUsersBody', 'adminUsersMsg',
      'adminHqInput', 'btnAdmSaveHq', 'btnAdmClearHq', 'adminHqMsg', 'btnCloseAdmin'
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

  function t(key, vars) {
    return window.I18N ? window.I18N.t(key, vars) : key;
  }

  function populateMessageBuilder() {
    const { MESSAGE_BLOCKS } = window.GAME_DATA;
    const prev = [el.msgSlot1.value, el.msgSlot2.value, el.msgSlot3.value];
    const fill = (selectEl, list, prevVal) => {
      selectEl.innerHTML = '';
      list.forEach((item) => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = window.I18N ? window.I18N.msgBlock(item.id) : item.text;
        selectEl.appendChild(opt);
      });
      if (prevVal && list.some((x) => x.id === prevVal)) {
        selectEl.value = prevVal;
      }
    };
    fill(el.msgSlot1, MESSAGE_BLOCKS.slot1, prev[0]);
    fill(el.msgSlot2, MESSAGE_BLOCKS.slot2, prev[1]);
    fill(el.msgSlot3, MESSAGE_BLOCKS.slot3, prev[2]);
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
    el.tvTickerText.textContent = `+++ ${full.toUpperCase()} +++ ${t('tickerSuffix')} +++`;
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
    const diffT = window.I18N ? window.I18N.diffText(diff) : diff;
    if (el.difficultyBadge) {
      el.difficultyBadge.textContent = diffT.badge;
      el.difficultyBadge.className = `diff-badge diff-${diff.id}`;
    }
    const shift = window.GAME_DATA.SHIFTS[state.shiftIndex];
    if (shift && el.shiftTitle) {
      el.shiftTitle.textContent = window.I18N ? window.I18N.shiftTitle(shift) : shift.title;
    }
    el.shiftTimer.textContent = formatTime(state.shiftTimeLeft);
    el.scoreValue.textContent = state.score;
    const p = Math.max(0, Math.min(100, Math.round(state.panic)));
    el.panicText.textContent = `${p}%`;
    el.panicBar.style.width = `${p}%`;
    el.handledCount.textContent = state.handledCount;

    if (state.selectedDistricts.length === 0) {
      el.selectedDistrictsText.textContent = t('noneText');
    } else {
      const names = state.selectedDistricts.map((id) =>
        window.I18N ? window.I18N.districtName(id, false) : id
      );
      el.selectedDistrictsText.textContent = names.join(', ');
    }

    // Обновляем доступность моделей сирен
    const tornadoUnlocked = hasUpgrade('siren_tornado');
    const modernUnlocked = hasUpgrade('siren_modern');
    el.modelTornado.classList.toggle('locked', !tornadoUnlocked);
    el.modelTornado.textContent = tornadoUnlocked ? t('modelTornadoOpen') : t('modelTornadoLock');
    el.modelModern.classList.toggle('locked', !modernUnlocked);
    el.modelModern.textContent = modernUnlocked ? t('modelModernOpen') : t('modelModernLock');

    el.btnSound.textContent = window.SoundEngine.isMuted() ? t('btnSoundOff') : t('btnSoundOn');
    el.btnVoice.textContent = window.SoundEngine.isVoiceEnabled() ? t('btnVoiceOn') : t('btnVoiceOff');
    updateKolaAlertUI();
  }

  function getBrokenTowersInDistricts(districtIds) {
    const broken = [];
    districtIds.forEach((dId) => {
      const dist = window.GAME_DATA.DISTRICTS.find((x) => x.id === dId);
      if (!dist) return;
      dist.towers.forEach((t) => {
        const ts = state.towers[t.id];
        if (ts && ts.status !== 'ok') {
          broken.push(ts);
        }
      });
    });
    return broken;
  }

  function updateKolaAlertUI() {
    if (!el.kolaSwitchState || !el.kolaTowerStatus || !el.kolaPanel) return;
    el.kolaSwitchState.textContent = state.kolaAlert ? t('stateOn') : t('stateOff');
    el.kolaSwitchState.classList.toggle('on', state.kolaAlert);

    const broken = getBrokenTowersInDistricts(state.selectedDistricts);
    el.kolaPanel.classList.remove('active-on', 'blocked');
    el.kolaTowerStatus.classList.remove('ready', 'blocked');

    if (state.selectedDistricts.length === 0) {
      el.kolaTowerStatus.textContent = t('kolaSelectFirst');
      if (state.kolaAlert) el.kolaPanel.classList.add('active-on');
      return;
    }

    if (broken.length > 0) {
      const names = broken.map((tObj) => tObj.name).join(', ');
      el.kolaTowerStatus.textContent = t('kolaBlocked', { names });
      el.kolaTowerStatus.classList.add('blocked');
      el.kolaPanel.classList.add('blocked');
    } else {
      el.kolaTowerStatus.textContent = t('kolaReady');
      el.kolaTowerStatus.classList.add('ready');
      if (state.kolaAlert) el.kolaPanel.classList.add('active-on');
    }
  }

  function triggerPhoneKolaAlert(districtIds, messageText) {
    if (!el.phoneAlertPopup) return;
    const now = new Date();
    const hhmm = now.toTimeString().slice(0, 5);
    const zoneNames = districtIds.map((id) =>
      window.I18N ? window.I18N.districtName(id, true) : id
    );

    el.phoneClock.textContent = hhmm;
    el.phoneAlertZones.textContent = `${t('phoneZone')} ${zoneNames.join(', ')}`;
    el.phoneAlertText.textContent = messageText;
    el.phoneAlertPopup.classList.remove('hidden');

    // Перезапускаем анимацию вибрации телефона
    el.phoneAlertFrame.classList.remove('vibrating');
    void el.phoneAlertFrame.offsetWidth;
    el.phoneAlertFrame.classList.add('vibrating');

    window.SoundEngine.playKolaAlert();

    if (state.phoneAlertTimeout) clearTimeout(state.phoneAlertTimeout);
    state.phoneAlertTimeout = setTimeout(() => {
      el.phoneAlertPopup.classList.add('hidden');
    }, 6000);
  }

  function updateTVScreen() {
    if (state.tvIntercept) {
      el.tvNormalView.classList.add('hidden');
      el.tvEmergencyView.classList.remove('hidden');
      el.tvSwitchState.textContent = t('stateOn');
      el.tvSwitchState.classList.add('on');
    } else {
      el.tvNormalView.classList.remove('hidden');
      el.tvEmergencyView.classList.add('hidden');
      el.tvSwitchState.textContent = t('stateOff');
      el.tvSwitchState.classList.remove('on');
      const prog = window.GAME_DATA.TV_PROGRAMS[state.tvProgramIndex];
      const progT = window.I18N ? window.I18N.tvProgram(state.tvProgramIndex, prog) : prog;
      el.tvChannel.textContent = progT.channel;
      el.tvIcon.textContent = prog.icon;
      el.tvTitle.textContent = progT.title;
      el.tvNormalView.style.background = `linear-gradient(135deg, ${prog.color} 0%, #101c24 100%)`;
    }
  }

  function updateTowerDiagUI() {
    const brokenList = Object.values(state.towers).filter((tObj) => tObj.status !== 'ok');
    if (brokenList.length === 0) {
      state.selectedTowerId = null;
      el.towerDiagPanel.className = 'tower-diag ok';
      el.diagText.textContent = t('diagAllOk');
      el.diagActions.classList.add('hidden');
      updateKolaAlertUI();
      return;
    }

    let focus = brokenList.find((tObj) => tObj.id === state.selectedTowerId) || brokenList[0];
    state.selectedTowerId = focus.id;
    const distLabel = window.I18N ? window.I18N.districtName(focus.districtId, false) : focus.districtName;

    el.towerDiagPanel.className = 'tower-diag fault';
    if (focus.status === 'repairing') {
      const pct = Math.round(focus.progress * 100);
      const label = focus.repairMode === 'reboot' ? t('diagRepairReboot') : t('diagRepairCrew');
      el.diagText.textContent = `⚠ ${focus.name} (${distLabel}): ${label} — ${pct}%`;
      el.diagActions.classList.add('hidden');
    } else {
      const faultDesc = focus.faultType === 'software' ? t('faultSoft') : t('faultHard');
      el.diagText.textContent = `⚠ ${focus.name} [${distLabel}] — ${faultDesc}`;
      el.diagActions.classList.remove('hidden');
    }
    updateKolaAlertUI();
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
  function pickNextIncident(forceType = null) {
    const shift = window.GAME_DATA.SHIFTS[state.shiftIndex];
    let poolType = forceType;
    if (!poolType) {
      const roll = Math.random();
      poolType = 'real';
      if (roll < shift.hoaxChance) poolType = 'hoax';
      else if (roll < shift.hoaxChance + shift.drillChance) poolType = 'drill';
    }

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

  function spawnIncident(forceType = null) {
    const shift = window.GAME_DATA.SHIFTS[state.shiftIndex];
    const diff = getDiff();
    const inc = pickNextIncident(forceType);
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
    const incT = window.I18N ? window.I18N.incidentText(inc) : inc;
    let bodyHtml = incT.text;
    let sourceClass = 'dispatch-source';

    // На простом уровне подсвечиваем нужные районы в тексте (на всех 4 языках)
    if (diff.showHints && inc.districts && inc.districts.length > 0) {
      const stems = {
        center: ['ЦЕНТР[А-ЯЁ]*', 'CENTER', 'CENTRO', 'CENTRE'],
        factory: ['ЗАВОДСК[А-ЯЁ]*', 'INDUSTRIAL'],
        port: ['ПОРТ[А-ЯЁ]*', 'PORT', 'PUERTO'],
        forest: ['ЛЕСН[А-ЯЁ]*', 'FOREST', 'BOSQUE', 'BOSC'],
        residential: ['СПАЛЬН[А-ЯЁ]*', 'RESIDENTIAL', 'RESIDENCIAL'],
        airport: ['АЭРОПОРТ[А-ЯЁ]*', 'AIRPORT', 'AEROPUERTO', 'AEROPORT']
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
      ? `<span style="color:#ffcf5c">${t('suspiciousChan')}</span>`
      : `<span>${t('priorityHigh')}</span>`;

    let easyHintHtml = '';
    if (diff.showHints) {
      if (inc.type === 'real') {
        easyHintHtml = `<div class="easy-hint-bar">${t('hintReal')}</div>`;
      } else if (inc.type === 'drill') {
        easyHintHtml = `<div class="easy-hint-bar">${t('hintDrill')}</div>`;
      } else if (inc.type === 'hoax') {
        easyHintHtml = `<div class="easy-hint-bar">${t('hintHoax')}</div>`;
      }
    }

    el.dispatchContent.innerHTML = `
      <div class="dispatch-meta">
        <span class="${sourceClass}">${incT.source}</span>
        ${typeHint}
      </div>
      <div class="dispatch-title">${incT.title}</div>
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
    el.dispatchTimerLabel.textContent = t('waitBadge');
    el.dispatchTimerBar.style.width = '100%';
    el.dispatchTimerBar.style.backgroundColor = 'var(--crt-green)';
    el.dispatchContent.innerHTML = `
      <div class="standby-msg">
        ${t('standbyMsg')}
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

    // 5. Сотовая рассылка Kola-Alert
    let kolaBonus = 0;
    if (state.kolaAlert) {
      const brokenSelected = getBrokenTowersInDistricts(state.selectedDistricts);
      if (brokenSelected.length > 0) {
        const bNames = brokenSelected.map((t) => `${t.name} (${t.districtName})`).join(', ');
        issues.push('Kola-Alert заблокирован поломкой вышки');
        addLog(`❌ Kola-Alert НЕ СРАБОТАЛ: нет связи с сотовой вышкой ${bNames}! Почините её на карте.`, 'err');
      } else {
        triggerPhoneKolaAlert(state.selectedDistricts, getAssembledMessageText());
        if (inc.type === 'real') {
          kolaBonus = 30;
          addLog('📱 Kola-Alert доставлен на телефоны жителей выбранных районов! (+30 бонус)', 'ok');
        } else {
          issues.push('зря включили Kola-Alert во время проверки');
          penaltyPts += 15;
          panicAdd += 4;
        }
      }
    }

    // Итог расчёта
    const speedBonus = Math.round((state.incidentTimeLeft / state.incidentMaxTime) * 40);
    let earned = Math.max(20, 160 + speedBonus + kolaBonus - penaltyPts);
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
      if (state.kolaAlert) {
        state.kolaAlert = false;
        if (el.kolaAlertSwitch) el.kolaAlertSwitch.checked = false;
        updateKolaAlertUI();
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
    state.kolaAlert = false;
    if (el.kolaAlertSwitch) el.kolaAlertSwitch.checked = false;
    if (el.phoneAlertPopup) el.phoneAlertPopup.classList.add('hidden');
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
      const upgT = window.I18N ? window.I18N.upgradeText(upg) : upg;

      const card = document.createElement('div');
      card.className = `upgrade-card ${owned ? 'owned' : ''}`;
      card.innerHTML = `
        <div>
          <div class="upg-head">
            <span>${upg.icon} ${upgT.name}</span>
            <span style="color:${owned ? '#39ff88' : '#ffb833'}">${owned ? t('upgOwned') : upg.cost + ' ★'}</span>
          </div>
          <p class="upg-desc">${upgT.desc}</p>
        </div>
        <button class="hw-btn ${owned ? '' : (canBuy ? 'action-amber' : '')}" ${owned || !canBuy ? 'disabled' : ''}>
          ${owned ? t('upgInService') : (canBuy ? t('upgBuy') : t('upgNoFunds'))}
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
          el.dispatchTimerLabel.textContent = t('timeLeft', { s: Math.max(0, state.incidentTimeLeft).toFixed(1) });
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

    // Тумблер сотовой рассылки Kola-Alert
    if (el.kolaAlertSwitch) {
      el.kolaAlertSwitch.addEventListener('change', () => {
        window.SoundEngine.ensureContext();
        state.kolaAlert = el.kolaAlertSwitch.checked;
        window.SoundEngine.playSwitch(state.kolaAlert);
        updateKolaAlertUI();
      });
    }

    if (el.btnClosePhoneAlert) {
      el.btnClosePhoneAlert.addEventListener('click', () => {
        window.SoundEngine.playClick();
        el.phoneAlertPopup.classList.add('hidden');
        if (state.phoneAlertTimeout) clearTimeout(state.phoneAlertTimeout);
      });
    }

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
        const dT = window.I18N ? window.I18N.diffText(d) : d;
        const btn = document.createElement('button');
        btn.className = `hw-btn diff-choice-btn diff-${d.id} ${state.difficulty === d.id ? 'active' : ''}`;
        btn.innerHTML = `${dT.badge}<small>${dT.subtitle}</small>`;
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
      const curD = getDiff();
      el.difficultyDesc.textContent = (window.I18N ? window.I18N.diffText(curD) : curD).desc;
    }
    renderDifficultySelector();

    if (el.btnSummaryMenu) {
      el.btnSummaryMenu.addEventListener('click', () => {
        window.SoundEngine.playClick();
        el.summaryModal.classList.add('hidden');
        renderDifficultySelector();
        renderShiftButtons();
        el.startModal.classList.remove('hidden');
      });
    }

    // Выбор смены на стартовом экране
    function renderShiftButtons() {
      el.shiftButtons.innerHTML = '';
      window.GAME_DATA.SHIFTS.forEach((sh, idx) => {
        const btn = document.createElement('button');
        btn.className = `hw-btn shift-choice-btn ${idx === state.shiftIndex ? 'active' : ''}`;
        btn.innerHTML = `${t('shiftNum', { n: sh.number })}<br><small>${t('shiftMin', { m: Math.round(sh.duration / 60) })}</small>`;
        btn.addEventListener('click', () => {
          state.shiftIndex = idx;
          renderShiftButtons();
          updateHUD();
        });
        el.shiftButtons.appendChild(btn);
      });
    }
    renderShiftButtons();

    // Переключение языка (RU / EN / ES / VA)
    function applyLanguage(langCode) {
      if (!window.I18N) return;
      window.I18N.setLang(langCode);
      if (el.langSelect) el.langSelect.value = langCode;
      if (el.startLangSelect) el.startLangSelect.value = langCode;
      window.I18N.applyDom();
      populateMessageBuilder();
      renderDifficultySelector();
      renderShiftButtons();
      updateTVScreen();
      updateTowerDiagUI();
      updateHUD();
      if (state.activeIncident) {
        renderDispatchCard(state.activeIncident);
      } else {
        el.dispatchTimerLabel.textContent = t('waitBadge');
        el.dispatchContent.innerHTML = `<div class="standby-msg">${t('standbyMsg')}</div>`;
      }
      if (!el.upgradesModal.classList.contains('hidden')) {
        renderUpgradesModal();
      }
      if (!window.CloudService || !window.CloudService.getUser()) {
        el.btnAuth.textContent = t('btnAuth');
        if (el.btnStartAuth) el.btnStartAuth.textContent = t('btnAuth');
      }
    }

    [el.langSelect, el.startLangSelect].forEach((sel) => {
      if (!sel) return;
      sel.addEventListener('change', () => {
        window.SoundEngine.playClick();
        applyLanguage(sel.value);
      });
    });
    window._applyLanguage = applyLanguage;

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
        const isAdm = window.CloudService && window.CloudService.isAdmin();
        el.lbHead.innerHTML = `<tr><th>#</th><th>Позывной</th><th>Сложность</th><th>Смена</th><th>Идеально</th><th>Очки</th>${isAdm ? '<th></th>' : ''}</tr>`;
        if (res.rows.length === 0) {
          el.lbStatus.textContent = 'В этой категории пока нет записей. Завершите смену первым!';
          return;
        }
        el.lbStatus.textContent = `Топ смен (${res.rows.length}):`;
        el.lbBody.innerHTML = res.rows.map((r, i) => {
          const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
          const isMe = myId && r.user_id === myId;
          const delCol = isAdm
            ? `<td><button class="lb-del-btn" data-del-run="${r.id}" title="Удалить запись">🗑️</button></td>`
            : '';
          return `
            <tr class="${isMe ? 'lb-me' : ''}">
              <td>${rank}</td>
              <td>${escapeHtml(r.callsign)}${isMe ? ' (вы)' : ''}</td>
              <td>${diffLabels[r.difficulty] || r.difficulty}</td>
              <td>№${r.shift_number}</td>
              <td>${r.perfect_count}/${r.handled_count}</td>
              <td class="lb-score-cell">+${r.shift_score} ★</td>
              ${delCol}
            </tr>
          `;
        }).join('');

        if (isAdm) {
          el.lbBody.querySelectorAll('[data-del-run]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const runId = Number(btn.dataset.delRun);
              btn.disabled = true;
              const delRes = await window.CloudService.deleteLeaderboardRun(runId);
              if (delRes && delRes.ok) {
                window.SoundEngine.playClick();
                loadLeaderboard(currentLbTab);
              } else {
                btn.disabled = false;
                el.lbStatus.textContent = `Ошибка удаления: ${delRes?.error || 'нет прав'}`;
              }
            });
          });
        }
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

    // --- ПРИКАЗ ШТАБА (ГЛОБАЛЬНЫЙ БАННЕР) ---
    function applyHqBanner(message) {
      const text = String(message || '').trim();
      if (text) {
        el.hqBannerText.textContent = text;
        el.hqBanner.classList.remove('hidden');
      } else {
        el.hqBannerText.textContent = '';
        el.hqBanner.classList.add('hidden');
      }
      if (el.adminHqInput) el.adminHqInput.value = text;
    }

    // --- ПАНЕЛЬ АДМИНИСТРАТОРА (НАЧАЛЬНИК ГО) ---
    function showAdminMsg(targetEl, text, isErr = false) {
      targetEl.textContent = text;
      targetEl.className = `auth-msg ${isErr ? 'err' : 'ok'}`;
    }

    function switchAdminTab(tabName) {
      el.adminTabs.querySelectorAll('.admin-tab').forEach((b) => {
        b.classList.toggle('active', b.dataset.atab === tabName);
      });
      el.adminTabDebug.classList.toggle('hidden', tabName !== 'debug');
      el.adminTabUsers.classList.toggle('hidden', tabName !== 'users');
      el.adminTabHq.classList.toggle('hidden', tabName !== 'hq');
      if (tabName === 'users') loadAdminUsers();
    }

    async function loadAdminUsers() {
      el.adminUsersStatus.textContent = 'Загрузка списка дежурных...';
      el.adminUsersBody.innerHTML = '';
      el.adminUsersMsg.classList.add('hidden');

      const res = await window.CloudService.fetchAllProfiles();
      if (res.error) {
        el.adminUsersStatus.textContent = `Ошибка: ${res.error}`;
        return;
      }
      el.adminUsersStatus.textContent = `Всего дежурных: ${res.rows.length}`;
      el.adminUsersBody.innerHTML = res.rows.map((u) => `
        <tr data-uid="${u.id}">
          <td>
            <input type="text" class="adm-inline-input adm-callsign" value="${escapeHtml(u.callsign)}" maxlength="24" />
            ${u.is_admin ? '<small style="color:#ff7a7a">ADMIN</small>' : ''}
          </td>
          <td><input type="number" class="adm-inline-input adm-inline-num adm-score" value="${u.score || 0}" min="0" /></td>
          <td>${u.best_shift_score || 0} ★</td>
          <td style="white-space:nowrap;">
            <button class="hw-btn small-btn action-cyan adm-save-u" type="button">Сохр.</button>
            <button class="hw-btn small-btn danger-outline adm-zero-u" type="button" title="Обнулить очки">0</button>
          </td>
        </tr>
      `).join('');

      el.adminUsersBody.querySelectorAll('tr').forEach((tr) => {
        const uid = tr.dataset.uid;
        const inpName = tr.querySelector('.adm-callsign');
        const inpScore = tr.querySelector('.adm-score');
        const btnSave = tr.querySelector('.adm-save-u');
        const btnZero = tr.querySelector('.adm-zero-u');

        btnSave.addEventListener('click', async () => {
          btnSave.disabled = true;
          const upd = await window.CloudService.adminUpdateProfile(uid, {
            callsign: inpName.value,
            score: Number(inpScore.value)
          });
          btnSave.disabled = false;
          if (upd.error) {
            showAdminMsg(el.adminUsersMsg, `Ошибка: ${upd.error}`, true);
          } else {
            window.SoundEngine.playSuccess();
            showAdminMsg(el.adminUsersMsg, `Профиль «${upd.profile.callsign}» обновлён (${upd.profile.score} ★).`);
            const curUser = window.CloudService.getUser();
            if (curUser && curUser.id === uid) {
              state.score = upd.profile.score;
              updateHUD();
            }
          }
        });

        btnZero.addEventListener('click', () => {
          inpScore.value = 0;
          btnSave.click();
        });
      });
    }

    const openAdminModal = () => {
      if (!window.CloudService || !window.CloudService.isAdmin()) return;
      window.SoundEngine.playClick();
      state.paused = true;
      el.adminDebugMsg.classList.add('hidden');
      el.adminHqMsg.classList.add('hidden');
      el.adminModal.classList.remove('hidden');
      switchAdminTab('debug');
    };

    if (el.btnAdmin) el.btnAdmin.addEventListener('click', openAdminModal);
    if (el.btnStartAdmin) el.btnStartAdmin.addEventListener('click', openAdminModal);
    el.btnCloseAdmin.addEventListener('click', () => {
      window.SoundEngine.playClick();
      el.adminModal.classList.add('hidden');
      state.paused = false;
    });

    el.adminTabs.querySelectorAll('.admin-tab').forEach((b) => {
      b.addEventListener('click', () => {
        window.SoundEngine.playClick();
        switchAdminTab(b.dataset.atab);
      });
    });

    el.btnAdmRefreshUsers.addEventListener('click', () => {
      window.SoundEngine.playClick();
      loadAdminUsers();
    });

    // Кнопки отладки смены
    function adminSpawnHelper(type, label) {
      if (!state.running) {
        showAdminMsg(el.adminDebugMsg, 'Сначала нажмите «Заступить на смену»!', true);
        return;
      }
      el.adminModal.classList.add('hidden');
      state.paused = false;
      spawnIncident(type);
      addLog(`[АДМИН] Принудительно запущено событие: ${label}.`, 'warn');
    }

    el.admSpawnReal.addEventListener('click', () => adminSpawnHelper('real', 'Реальная угроза'));
    el.admSpawnDrill.addEventListener('click', () => adminSpawnHelper('drill', 'Плановая проверка'));
    el.admSpawnHoax.addEventListener('click', () => adminSpawnHelper('hoax', 'Ложный вызов'));

    el.admSpawnBreak.addEventListener('click', () => {
      if (!state.running) {
        showAdminMsg(el.adminDebugMsg, 'Сначала нажмите «Заступить на смену»!', true);
        return;
      }
      triggerRandomBreakdown(false);
      showAdminMsg(el.adminDebugMsg, 'Вызвана поломка случайной вышки на карте!');
    });

    el.admAddScore.addEventListener('click', () => {
      window.SoundEngine.playSuccess();
      state.score += 500;
      saveProgress();
      updateHUD();
      showAdminMsg(el.adminDebugMsg, `Выдано +500 ★! Текущий бюджет: ${state.score} ★.`);
    });

    el.admResetPanic.addEventListener('click', () => {
      window.SoundEngine.playSuccess();
      state.panic = 0;
      updateHUD();
      showAdminMsg(el.adminDebugMsg, 'Паника в городе сброшена до 0%.');
    });

    el.admFixTowers.addEventListener('click', () => {
      window.SoundEngine.playSuccess();
      Object.values(state.towers).forEach((t) => {
        t.status = 'ok';
        t.faultType = null;
        t.progress = 0;
      });
      state.selectedTowerId = null;
      updateTowerDiagUI();
      showAdminMsg(el.adminDebugMsg, 'Все 12 вышек связи мгновенно восстановлены!');
    });

    el.admFinishShift.addEventListener('click', () => {
      if (!state.running) {
        showAdminMsg(el.adminDebugMsg, 'Сейчас нет активной смены.', true);
        return;
      }
      el.adminModal.classList.add('hidden');
      state.paused = false;
      state.shiftTimeLeft = 0;
      endShift(true);
    });

    // Приказ Штаба
    el.btnAdmSaveHq.addEventListener('click', async () => {
      const msg = el.adminHqInput.value.trim();
      const res = await window.CloudService.saveAnnouncement(msg);
      if (res.error) {
        showAdminMsg(el.adminHqMsg, `Ошибка: ${res.error}`, true);
      } else {
        window.SoundEngine.playSuccess();
        applyHqBanner(res.message);
        showAdminMsg(el.adminHqMsg, res.message ? 'Приказ Штаба опубликован для всех игроков!' : 'Объявление скрыто.');
      }
    });

    el.btnAdmClearHq.addEventListener('click', async () => {
      el.adminHqInput.value = '';
      const res = await window.CloudService.saveAnnouncement('');
      if (res.error) {
        showAdminMsg(el.adminHqMsg, `Ошибка: ${res.error}`, true);
      } else {
        applyHqBanner('');
        showAdminMsg(el.adminHqMsg, 'Объявление скрыто.');
      }
    });

    // Реакция на вход/выход в облаке
    window._onCloudAuthChange = function (user, profile) {
      const isAdm = Boolean(user && profile && profile.is_admin === true);
      if (el.btnAdmin) el.btnAdmin.classList.toggle('hidden', !isAdm);
      if (el.btnStartAdmin) el.btnStartAdmin.classList.toggle('hidden', !isAdm);

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
        addLog(`Облачный профиль подключён: ${profile.callsign}${isAdm ? ' [АДМИН]' : ''} (${state.score} ★).`, 'ok');
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

    window._applyHqBanner = applyHqBanner;
  }

  function init() {
    cacheDom();
    loadSave();
    initTowers();
    populateMessageBuilder();
    bindEvents();
    if (window.I18N && window._applyLanguage) {
      window._applyLanguage(window.I18N.getLang());
    } else {
      updateTVScreen();
      updateHUD();
    }

    if (window.CloudService) {
      window.CloudService.init((user, profile) => {
        if (window._onCloudAuthChange) window._onCloudAuthChange(user, profile);
      }).then((ok) => {
        if (ok) {
          window.CloudService.fetchAnnouncement().then((msg) => {
            if (window._applyHqBanner) window._applyHqBanner(msg);
          });
        }
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
