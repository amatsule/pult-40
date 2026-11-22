// Интерактивная карта города на HTML5 Canvas для «Пульт-40»

window.CityMap = (function () {
  const WIDTH = 660;
  const HEIGHT = 470;

  let canvas = null;
  let ctx = null;
  let hoveredDistrictId = null;
  let hoveredTowerId = null;
  let radarAngle = 0;
  let waves = []; // { x, y, radius, maxRadius, color, alpha }
  let getStateFn = null;
  let onDistrictClickFn = null;
  let onTowerClickFn = null;

  function init(canvasEl, getState, onDistrictClick, onTowerClick) {
    canvas = canvasEl;
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    ctx = canvas.getContext('2d');
    getStateFn = getState;
    onDistrictClickFn = onDistrictClick;
    onTowerClickFn = onTowerClick;

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', () => {
      hoveredDistrictId = null;
      hoveredTowerId = null;
    });
    canvas.addEventListener('click', handleClick);

    requestAnimationFrame(renderLoop);
  }

  function getCanvasCoords(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;
    return {
      x: (evt.clientX - rect.left) * scaleX,
      y: (evt.clientY - rect.top) * scaleY
    };
  }

  function pointInPolygon(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < ((xj - xi) * (y - yi)) / (yj - yi + 0.00001) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function findTowerAt(x, y, state) {
    const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    for (const d of window.GAME_DATA.DISTRICTS) {
      for (const t of d.towers) {
        const dist = Math.hypot(x - t.x, y - t.y);
        const towerState = state.towers[t.id];
        const hitRadius = (towerState && towerState.status !== 'ok')
          ? (isTouch ? 30 : 20)
          : (isTouch ? 18 : 12);
        if (dist <= hitRadius) {
          return { tower: t, district: d, state: towerState };
        }
      }
    }
    return null;
  }

  function findDistrictAt(x, y) {
    for (const d of window.GAME_DATA.DISTRICTS) {
      if (pointInPolygon(x, y, d.polygon)) {
        return d;
      }
    }
    return null;
  }

  function handleMouseMove(evt) {
    const state = getStateFn();
    const { x, y } = getCanvasCoords(evt);
    const towerHit = findTowerAt(x, y, state);
    if (towerHit && towerHit.state && towerHit.state.status !== 'ok') {
      hoveredTowerId = towerHit.tower.id;
      hoveredDistrictId = null;
      canvas.style.cursor = 'pointer';
      return;
    }
    hoveredTowerId = null;
    const dist = findDistrictAt(x, y);
    hoveredDistrictId = dist ? dist.id : null;
    canvas.style.cursor = dist ? 'pointer' : 'crosshair';
  }

  function handleClick(evt) {
    const state = getStateFn();
    const { x, y } = getCanvasCoords(evt);

    // Сначала проверяем клик по сломанной вышке
    const towerHit = findTowerAt(x, y, state);
    if (towerHit && towerHit.state && towerHit.state.status !== 'ok') {
      if (onTowerClickFn) onTowerClickFn(towerHit.tower.id);
      return;
    }

    const dist = findDistrictAt(x, y);
    if (dist && onDistrictClickFn) {
      onDistrictClickFn(dist.id);
    }
  }

  function spawnAcousticWaves(districtIds, mode) {
    const state = getStateFn();
    districtIds.forEach((dId) => {
      const d = window.GAME_DATA.DISTRICTS.find((x) => x.id === dId);
      if (!d) return;
      d.towers.forEach((t) => {
        const ts = state.towers[t.id];
        if (ts && ts.status !== 'ok') return; // сломанная вышка не даёт волну
        const count = mode === 'long' ? 4 : 2;
        for (let i = 0; i < count; i++) {
          waves.push({
            x: t.x,
            y: t.y,
            radius: 6 - i * 16,
            maxRadius: mode === 'long' ? 115 : 70,
            color: mode === 'long' ? '#ff4d4d' : '#ffcf40',
            alpha: 0.95
          });
        }
      });
    });
  }

  function drawWaterAndBackground(now) {
    ctx.fillStyle = '#07140f';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Вода (залив возле Порта и река)
    ctx.save();
    ctx.fillStyle = '#071e26';
    ctx.beginPath();
    ctx.moveTo(385, 430);
    ctx.lineTo(585, 425);
    ctx.lineTo(660, 390);
    ctx.lineTo(660, 470);
    ctx.lineTo(350, 470);
    ctx.closePath();
    ctx.fill();

    // Координатная сетка CRT
    ctx.strokeStyle = 'rgba(57, 255, 136, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= WIDTH; x += 44) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= HEIGHT; y += 44) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WIDTH, y);
      ctx.stroke();
    }

    // Подписи координат
    ctx.fillStyle = 'rgba(57, 255, 136, 0.35)';
    ctx.font = '10px "Courier New", monospace';
    const cols = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж'];
    cols.forEach((c, i) => ctx.fillText(c, 22 + i * 88, 14));
    for (let r = 1; r <= 5; r++) {
      ctx.fillText('0' + r, 6, r * 88 - 10);
    }

    // Надпись залива
    ctx.fillStyle = 'rgba(77, 210, 255, 0.35)';
    ctx.font = 'italic 11px "Courier New", monospace';
    ctx.fillText(window.I18N ? window.I18N.t('mapBay') : 'СЕВЕРНЫЙ ЗАЛИВ', 480, 454);

    // Лёгкий радарный луч
    const cx = 330;
    const cy = 240;
    radarAngle = (now * 0.00055) % (Math.PI * 2);
    const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 340);
    grad.addColorStop(0, 'rgba(57, 255, 136, 0.06)');
    grad.addColorStop(1, 'rgba(57, 255, 136, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 340, radarAngle - 0.35, radarAngle);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawDistrictDecor(d) {
    ctx.save();
    ctx.strokeStyle = 'rgba(130, 255, 180, 0.16)';
    ctx.fillStyle = 'rgba(130, 255, 180, 0.12)';
    ctx.lineWidth = 1;

    if (d.features === 'center') {
      // Улицы и площадь
      ctx.strokeRect(265, 200, 95, 70);
      ctx.beginPath();
      ctx.moveTo(312, 180);
      ctx.lineTo(312, 300);
      ctx.moveTo(240, 235);
      ctx.lineTo(395, 235);
      ctx.stroke();
    } else if (d.features === 'factory') {
      // Заводские корпуса и трубы
      ctx.fillRect(445, 195, 36, 20);
      ctx.fillRect(510, 170, 42, 24);
      ctx.fillRect(490, 225, 48, 20);
    } else if (d.features === 'port') {
      // Причалы
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(435 + i * 36, 395, 14, 24);
      }
    } else if (d.features === 'forest') {
      // Ёлочки
      const trees = [[95, 165], [140, 95], [185, 180], [215, 95], [85, 115], [175, 110]];
      trees.forEach(([tx, ty]) => {
        ctx.beginPath();
        ctx.moveTo(tx, ty - 10);
        ctx.lineTo(tx - 6, ty + 4);
        ctx.lineTo(tx + 6, ty + 4);
        ctx.closePath();
        ctx.fill();
      });
    } else if (d.features === 'residential') {
      // Панельные дома
      const blocks = [[85, 255], [135, 260], [95, 315], [160, 310], [105, 365], [155, 365]];
      blocks.forEach(([bx, by]) => ctx.fillRect(bx, by, 26, 11));
    } else if (d.features === 'airport') {
      // ВПП
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(163, 217, 255, 0.25)';
      ctx.beginPath();
      ctx.moveTo(255, 395);
      ctx.lineTo(360, 355);
      ctx.moveTo(275, 345);
      ctx.lineTo(345, 412);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDistricts(state, now) {
    window.GAME_DATA.DISTRICTS.forEach((d) => {
      const isSelected = state.selectedDistricts.includes(d.id);
      const isHovered = hoveredDistrictId === d.id;
      const hasBrokenTower = d.towers.some((t) => state.towers[t.id] && state.towers[t.id].status !== 'ok');

      ctx.save();
      ctx.beginPath();
      d.polygon.forEach(([px, py], i) => {
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();

      // Заливка района
      if (isSelected) {
        const pulse = 0.28 + 0.08 * Math.sin(now * 0.008);
        ctx.fillStyle = `rgba(255, 184, 51, ${pulse})`;
      } else if (isHovered) {
        ctx.fillStyle = 'rgba(57, 255, 136, 0.18)';
      } else {
        ctx.fillStyle = d.color;
      }
      ctx.fill();

      // Контур района
      ctx.lineWidth = isSelected ? 2.6 : (isHovered ? 2 : 1.3);
      ctx.strokeStyle = isSelected
        ? '#ffcc33'
        : hasBrokenTower
          ? 'rgba(255, 90, 90, 0.7)'
          : isHovered
            ? '#66ffaa'
            : 'rgba(57, 255, 136, 0.45)';
      ctx.stroke();

      drawDistrictDecor(d);

      // Подпись района
      ctx.font = 'bold 12px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = isSelected ? '#ffe07a' : '#8cffbe';
      const labelShort = window.I18N ? window.I18N.districtName(d.id, true) : d.shortName;
      ctx.fillText(labelShort, d.labelPos[0], d.labelPos[1]);

      if (isSelected) {
        ctx.font = 'bold 9px "Courier New", monospace';
        ctx.fillStyle = '#ffcc33';
        ctx.fillText(window.I18N ? window.I18N.t('mapSelected') : '[ ВЫБРАН ]', d.labelPos[0], d.labelPos[1] + 13);
      }

      ctx.restore();
    });
  }

  function drawTowers(state, now) {
    const blinkOn = Math.floor(now / 520) % 2 === 0;

    window.GAME_DATA.DISTRICTS.forEach((d) => {
      d.towers.forEach((t) => {
        const ts = state.towers[t.id] || { status: 'ok', progress: 0 };
        const isHovered = hoveredTowerId === t.id;
        const isSelectedForRepair = state.selectedTowerId === t.id;

        ctx.save();

        // Опора/крыша здания под вышкой
        ctx.fillStyle = '#0c1c16';
        ctx.strokeStyle = 'rgba(57, 255, 136, 0.35)';
        ctx.lineWidth = 1;
        ctx.fillRect(t.x - 6, t.y - 6, 12, 12);
        ctx.strokeRect(t.x - 6, t.y - 6, 12, 12);

        if (ts.status === 'ok') {
          // Мигающая зелёная точка — исправная вышка с сиреной
          const radius = blinkOn ? 4.2 : 3.2;
          ctx.beginPath();
          ctx.arc(t.x, t.y, radius, 0, Math.PI * 2);
          ctx.fillStyle = blinkOn ? '#39ff88' : '#1b8a49';
          ctx.shadowColor = '#39ff88';
          ctx.shadowBlur = blinkOn ? 10 : 3;
          ctx.fill();
        } else if (ts.status === 'repairing') {
          // Идёт перезагрузка или едет рембригада
          ctx.beginPath();
          ctx.arc(t.x, t.y, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (ts.progress || 0));
          ctx.strokeStyle = '#4dd2ff';
          ctx.lineWidth = 3;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(t.x, t.y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = '#4dd2ff';
          ctx.fill();

          ctx.font = 'bold 9px "Courier New", monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#7de3ff';
          const repLbl = ts.repairMode === 'reboot'
            ? (window.I18N ? window.I18N.t('mapRebooting') : 'ПЕРЕЗАГР...')
            : (window.I18N ? window.I18N.t('mapCrew') : 'РЕМБРИГАДА');
          ctx.fillText(repLbl, t.x, t.y - 16);
        } else {
          // ПОЛОМКА: «НЕТ СВЯЗИ» (мигает красным)
          const pulseR = 11 + 5 * Math.abs(Math.sin(now * 0.008));
          ctx.beginPath();
          ctx.arc(t.x, t.y, pulseR, 0, Math.PI * 2);
          ctx.strokeStyle = isSelectedForRepair ? '#ffffff' : 'rgba(255, 59, 59, 0.9)';
          ctx.lineWidth = isHovered || isSelectedForRepair ? 2.5 : 1.6;
          ctx.setLineDash([4, 3]);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.beginPath();
          ctx.arc(t.x, t.y, 5.2, 0, Math.PI * 2);
          ctx.fillStyle = blinkOn ? '#ff2a2a' : '#990f0f';
          ctx.shadowColor = '#ff2a2a';
          ctx.shadowBlur = 12;
          ctx.fill();

          ctx.font = 'bold 9px "Courier New", monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ff6b6b';
          ctx.fillText(window.I18N ? window.I18N.t('mapNoSignal') : '! НЕТ СВЯЗИ', t.x, t.y - 16);
        }

        ctx.restore();
      });
    });
  }

  function drawWaves() {
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      w.radius += 1.6;
      if (w.radius > 0) {
        const progress = w.radius / w.maxRadius;
        const alpha = Math.max(0, (1 - progress) * w.alpha);
        ctx.save();
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
        ctx.strokeStyle = w.color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
      if (w.radius >= w.maxRadius) {
        waves.splice(i, 1);
      }
    }
  }

  function renderLoop(now) {
    if (!ctx || !getStateFn) return;
    const state = getStateFn();

    drawWaterAndBackground(now);
    drawDistricts(state, now);
    drawWaves();
    drawTowers(state, now);

    // Индикатор грозы поверх карты, если текущее событие штормовое
    if (state.activeIncident && state.activeIncident.weatherStorm) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 215, 100, 0.75)';
      ctx.font = 'bold 11px "Courier New", monospace';
      ctx.fillText(window.I18N ? window.I18N.t('mapStormWarn') : '⚡ ГРОЗОВОЙ ФРОНТ — РИСК ПОМЕХ НА ЛИНИИ', 14, HEIGHT - 12);
      ctx.restore();
    }

    requestAnimationFrame(renderLoop);
  }

  return {
    init,
    spawnAcousticWaves
  };
})();
