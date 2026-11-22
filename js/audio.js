// Звуковой движок игры «Пульт-40» (Web Audio API + SpeechSynthesis)
// Полностью процедурный синтез — работает офлайн без внешних аудиофайлов.

window.SoundEngine = (function () {
  let ctx = null;
  let masterGain = null;
  let muted = false;
  let voiceEnabled = true;
  let activeSirenNodes = [];

  function ensureContext() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : 0.45;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    return ctx;
  }

  function setMuted(isMuted) {
    muted = isMuted;
    if (masterGain && ctx) {
      masterGain.gain.setTargetAtTime(muted ? 0 : 0.45, ctx.currentTime, 0.03);
    }
    if (muted) {
      stopSiren();
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    }
  }

  function isMuted() {
    return muted;
  }

  function setVoiceEnabled(enabled) {
    voiceEnabled = enabled;
    if (!enabled && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  function isVoiceEnabled() {
    return voiceEnabled;
  }

  function stopSiren() {
    activeSirenNodes.forEach((n) => {
      try {
        if (n.stop) n.stop();
        if (n.disconnect) n.disconnect();
      } catch (_) {}
    });
    activeSirenNodes = [];
  }

  // Механический щелчок кнопки пульта
  function playClick() {
    const c = ensureContext();
    if (!c || muted) return;
    const now = c.currentTime;

    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.045);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  // Щелчок тяжёлого тумблера (Перехват ТВ)
  function playSwitch(on) {
    const c = ensureContext();
    if (!c || muted) return;
    const now = c.currentTime;

    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(on ? 240 : 380, now);
    osc.frequency.exponentialRampToValueAtTime(on ? 780 : 140, now + 0.06);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  // Зуммер нового срочного донесения
  function playAlarmBuzzer() {
    const c = ensureContext();
    if (!c || muted) return;
    const now = c.currentTime;

    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.22;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(760, t);
      osc.frequency.setValueAtTime(620, t + 0.08);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.015);
      gain.gain.setValueAtTime(0.22, t + 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 900;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.19);
    }
  }

  // Короткий сигнал перехвата ТВ/Радио
  function playTvIntercept() {
    const c = ensureContext();
    if (!c || muted) return;
    const now = c.currentTime;
    const freqs = [880, 1100, 880];
    freqs.forEach((f, idx) => {
      const t = now + idx * 0.12;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.11);
    });
  }

  // Сигнал успеха
  function playSuccess() {
    const c = ensureContext();
    if (!c || muted) return;
    const now = c.currentTime;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      const t = now + i * 0.09;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.24, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  }

  // Сигнал ошибки
  function playError() {
    const c = ensureContext();
    if (!c || muted) return;
    const now = c.currentTime;
    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.18;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160 - i * 35, t);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.17);
    }
  }

  // Гром / помеха при поломке вышки
  function playThunder() {
    const c = ensureContext();
    if (!c || muted) return;
    const now = c.currentTime;
    const bufferSize = c.sampleRate * 0.7;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.25));
    }
    const noise = c.createBufferSource();
    noise.buffer = buffer;

    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, now);
    filter.frequency.exponentialRampToValueAtTime(55, now + 0.65);

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    noise.start(now);
  }

  // Звук перезагрузки вышки
  function playReboot() {
    const c = ensureContext();
    if (!c || muted) return;
    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(1100, now + 0.25);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  // Воспроизведение сирены
  // model: 's40' | 'tornado' | 'modern'
  // mode: 'long' | 'short'
  function playSiren(model = 's40', mode = 'long') {
    const c = ensureContext();
    if (!c || muted) return;
    stopSiren();
    const now = c.currentTime;

    if (mode === 'short') {
      // Короткие гудки (3 импульса для проверки)
      for (let i = 0; i < 3; i++) {
        const start = now + i * 0.65;
        const osc = c.createOscillator();
        const osc2 = c.createOscillator();
        const filter = c.createBiquadFilter();
        const gain = c.createGain();

        if (model === 's40') {
          osc.type = 'sawtooth';
          osc2.type = 'triangle';
          osc.frequency.setValueAtTime(240, start);
          osc.frequency.linearRampToValueAtTime(420, start + 0.14);
          osc.frequency.setValueAtTime(420, start + 0.36);
          osc.frequency.linearRampToValueAtTime(260, start + 0.5);
          osc2.frequency.setValueAtTime(120, start);
          osc2.frequency.linearRampToValueAtTime(210, start + 0.14);
          osc2.frequency.linearRampToValueAtTime(130, start + 0.5);
          filter.type = 'lowpass';
          filter.frequency.value = 1100;
        } else if (model === 'tornado') {
          osc.type = 'sawtooth';
          osc2.type = 'square';
          osc.frequency.setValueAtTime(440, start);
          osc2.frequency.setValueAtTime(554, start);
          filter.type = 'bandpass';
          filter.frequency.value = 900;
        } else {
          osc.type = 'sine';
          osc2.type = 'triangle';
          osc.frequency.setValueAtTime(880, start);
          osc2.frequency.setValueAtTime(1180, start);
          filter.type = 'lowpass';
          filter.frequency.value = 2200;
        }

        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.24, start + 0.06);
        gain.gain.setValueAtTime(0.24, start + 0.38);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.52);

        osc.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        osc.start(start);
        osc2.start(start);
        osc.stop(start + 0.55);
        osc2.stop(start + 0.55);
        activeSirenNodes.push(osc, osc2, gain);
      }
      return;
    }

    // Протяжный ревун ('long') — около 4.2 секунд
    const duration = 4.2;
    const osc1 = c.createOscillator();
    const osc2 = c.createOscillator();
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    const filter = c.createBiquadFilter();
    const gain = c.createGain();

    if (model === 's40') {
      // Легендарная советская С-40: тяжёлый раскрут электродвигателя и низкий ревущий ротор
      osc1.type = 'sawtooth';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(140, now);
      osc1.frequency.exponentialRampToValueAtTime(455, now + 1.45);
      osc1.frequency.linearRampToValueAtTime(435, now + 2.4);
      osc1.frequency.exponentialRampToValueAtTime(160, now + duration);

      osc2.frequency.setValueAtTime(70, now);
      osc2.frequency.exponentialRampToValueAtTime(227, now + 1.45);
      osc2.frequency.linearRampToValueAtTime(217, now + 2.4);
      osc2.frequency.exponentialRampToValueAtTime(80, now + duration);

      // Лёгкая вибрация ротора
      lfo.frequency.value = 7.5;
      lfoGain.gain.value = 8;
      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, now);
      filter.frequency.linearRampToValueAtTime(1400, now + 1.5);
      filter.frequency.linearRampToValueAtTime(500, now + duration);
      filter.Q.value = 2.5;
    } else if (model === 'tornado') {
      // Американская сирена торнадо (Thunderbolt): жутковатый двухтональный дуэт с вращением
      osc1.type = 'sawtooth';
      osc2.type = 'square';
      osc1.frequency.setValueAtTime(260, now);
      osc1.frequency.exponentialRampToValueAtTime(466, now + 0.9);
      osc1.frequency.setValueAtTime(466, now + 2.8);
      osc1.frequency.exponentialRampToValueAtTime(220, now + duration);

      osc2.frequency.setValueAtTime(325, now);
      osc2.frequency.exponentialRampToValueAtTime(587, now + 0.9);
      osc2.frequency.setValueAtTime(587, now + 2.8);
      osc2.frequency.exponentialRampToValueAtTime(275, now + duration);

      // Эффект вращающегося рупора (амплитудная модуляция)
      lfo.frequency.value = 1.6;
      lfoGain.gain.value = 0.08;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);

      filter.type = 'bandpass';
      filter.frequency.value = 880;
      filter.Q.value = 1.6;
    } else {
      // Современная цифровая сирена (СГС-22): быстрый электронный wail
      osc1.type = 'triangle';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(580, now);
      osc1.frequency.linearRampToValueAtTime(1280, now + 1.1);
      osc1.frequency.linearRampToValueAtTime(620, now + 2.2);
      osc1.frequency.linearRampToValueAtTime(1280, now + 3.2);
      osc1.frequency.linearRampToValueAtTime(520, now + duration);

      osc2.frequency.setValueAtTime(290, now);
      osc2.frequency.linearRampToValueAtTime(640, now + 1.1);
      osc2.frequency.linearRampToValueAtTime(310, now + 2.2);
      osc2.frequency.linearRampToValueAtTime(640, now + 3.2);
      osc2.frequency.linearRampToValueAtTime(260, now + duration);

      lfo.frequency.value = 12;
      lfoGain.gain.value = 10;
      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);

      filter.type = 'lowpass';
      filter.frequency.value = 2200;
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.35);
    gain.gain.setValueAtTime(0.28, now + duration - 0.8);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc1.start(now);
    osc2.start(now);
    lfo.start(now);
    osc1.stop(now + duration + 0.05);
    osc2.stop(now + duration + 0.05);
    lfo.stop(now + duration + 0.05);

    activeSirenNodes.push(osc1, osc2, lfo, gain);
  }

  // Озвучивание собранного текста громкоговорителем + радио-шум
  function playRadioBroadcast(text) {
    const c = ensureContext();
    if (c && !muted) {
      // Короткий радио-сквелч перед речью
      const now = c.currentTime;
      const buf = c.createBuffer(1, c.sampleRate * 0.14, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.4;
      }
      const noise = c.createBufferSource();
      noise.buffer = buf;
      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1600;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      noise.start(now);
    }

    if (!muted && voiceEnabled && window.speechSynthesis && text) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = window.I18N ? window.I18N.getSpeechLang() : 'ru-RU';
        utter.rate = 1.08;
        utter.pitch = 0.92;
        utter.volume = 0.85;
        window.speechSynthesis.speak(utter);
      } catch (_) {}
    }
  }

  // Двухтональный сигнал сотового оповещения Kola-Alert (испанский ES-Alert: 853 Гц + 960 Гц) + вибрация
  function playKolaAlert() {
    if (navigator.vibrate) {
      try {
        navigator.vibrate([380, 140, 380, 140, 550]);
      } catch (_) {}
    }

    const c = ensureContext();
    if (!c || muted) return;
    const now = c.currentTime;

    // 3 резких двухтональных импульса (853 Hz + 960 Hz)
    const bursts = [
      { offset: 0.0, dur: 0.72 },
      { offset: 0.92, dur: 0.52 },
      { offset: 1.62, dur: 0.82 }
    ];

    bursts.forEach(({ offset, dur }) => {
      const start = now + offset;
      const oscA = c.createOscillator();
      const oscB = c.createOscillator();
      const filter = c.createBiquadFilter();
      const gain = c.createGain();

      oscA.type = 'sawtooth';
      oscB.type = 'sawtooth';
      oscA.frequency.setValueAtTime(853, start);
      oscB.frequency.setValueAtTime(960, start);

      filter.type = 'bandpass';
      filter.frequency.value = 920;
      filter.Q.value = 1.2;

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.24, start + 0.02);
      gain.gain.setValueAtTime(0.24, start + dur - 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

      oscA.connect(filter);
      oscB.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      oscA.start(start);
      oscB.start(start);
      oscA.stop(start + dur + 0.02);
      oscB.stop(start + dur + 0.02);
    });
  }

  return {
    ensureContext,
    setMuted,
    isMuted,
    setVoiceEnabled,
    isVoiceEnabled,
    stopSiren,
    playClick,
    playSwitch,
    playAlarmBuzzer,
    playTvIntercept,
    playKolaAlert,
    playSuccess,
    playError,
    playThunder,
    playReboot,
    playSiren,
    playRadioBroadcast
  };
})();
