// Данные игры «Пульт-40»: районы, донесения, блоки сообщений, улучшения и смены

window.GAME_DATA = (function () {
  const DISTRICTS = [
    {
      id: 'center',
      name: 'Центр',
      shortName: 'ЦЕНТР',
      color: '#1b3d2f',
      accent: '#39ff88',
      polygon: [
        [235, 165], [395, 160], [420, 275], [360, 325], [240, 315], [210, 240]
      ],
      labelPos: [315, 240],
      towers: [
        { id: 't_c1', x: 275, y: 205, name: 'Ц-01 (Дом Советов)' },
        { id: 't_c2', x: 355, y: 265, name: 'Ц-02 (Телеграф)' }
      ],
      features: 'center'
    },
    {
      id: 'factory',
      name: 'Заводской',
      shortName: 'ЗАВОДСКОЙ',
      color: '#2b3326',
      accent: '#ffb84d',
      polygon: [
        [395, 160], [585, 125], [610, 285], [420, 275]
      ],
      labelPos: [505, 210],
      towers: [
        { id: 't_f1', x: 465, y: 180, name: 'З-01 (ТЭЦ-4)' },
        { id: 't_f2', x: 550, y: 235, name: 'З-02 (Химкомбинат)' }
      ],
      features: 'factory'
    },
    {
      id: 'port',
      name: 'Порт',
      shortName: 'ПОРТ',
      color: '#17343f',
      accent: '#4dd2ff',
      polygon: [
        [360, 325], [420, 275], [610, 285], [585, 425], [385, 430]
      ],
      labelPos: [490, 355],
      towers: [
        { id: 't_p1', x: 445, y: 340, name: 'П-01 (Причал №3)' },
        { id: 't_p2', x: 545, y: 375, name: 'П-02 (Маяк)' }
      ],
      features: 'port'
    },
    {
      id: 'forest',
      name: 'Лесной',
      shortName: 'ЛЕСНОЙ',
      color: '#183823',
      accent: '#66ff66',
      polygon: [
        [45, 70], [275, 55], [395, 160], [235, 165], [210, 240], [55, 225]
      ],
      labelPos: [155, 140],
      towers: [
        { id: 't_l1', x: 120, y: 120, name: 'Л-01 (Лесничество)' },
        { id: 't_l2', x: 245, y: 110, name: 'Л-02 (Санаторий)' }
      ],
      features: 'forest'
    },
    {
      id: 'residential',
      name: 'Спальный',
      shortName: 'СПАЛЬНЫЙ',
      color: '#233830',
      accent: '#7dffb3',
      polygon: [
        [55, 225], [210, 240], [240, 315], [230, 425], [60, 410]
      ],
      labelPos: [145, 325],
      towers: [
        { id: 't_r1', x: 115, y: 280, name: 'С-01 (Школа №14)' },
        { id: 't_r2', x: 185, y: 370, name: 'С-02 (Универсам)' }
      ],
      features: 'residential'
    },
    {
      id: 'airport',
      name: 'Аэропорт',
      shortName: 'АЭРОПОРТ',
      color: '#26343d',
      accent: '#a3d9ff',
      polygon: [
        [240, 315], [360, 325], [385, 430], [230, 425]
      ],
      labelPos: [308, 378],
      towers: [
        { id: 't_a1', x: 275, y: 365, name: 'А-01 (Диспетчерская)' },
        { id: 't_a2', x: 345, y: 395, name: 'А-02 (ВПП-2)' }
      ],
      features: 'airport'
    }
  ];

  // Блоки конструктора сообщений (3 слота)
  const MESSAGE_BLOCKS = {
    slot1: [
      { id: 'storm', text: 'Внимание! Приближается шторм' },
      { id: 'smoke', text: 'Внимание! Химическое задымление' },
      { id: 'fire', text: 'Внимание! Пожарная опасность' },
      { id: 'flood', text: 'Внимание! Угроза подтопления' },
      { id: 'aviation', text: 'Внимание! Аварийная посадка' },
      { id: 'drill', text: 'Проверка системы оповещения' }
    ],
    slot2: [
      { id: 'shelter', text: 'Всем укрыться в помещениях' },
      { id: 'evacuate', text: 'Немедленно покинуть опасную зону' },
      { id: 'highground', text: 'Подняться на верхние этажи' },
      { id: 'calm', text: 'Сохраняйте спокойствие, это проверка' }
    ],
    slot3: [
      { id: 'windows', text: 'Закрыть окна и двери' },
      { id: 'mask', text: 'Надеть средства защиты дыхания' },
      { id: 'power', text: 'Отключить газ и электричество' },
      { id: 'clear_road', text: 'Освободить подъезды спецслужбам' },
      { id: 'no_action', text: 'Никаких действий не требуется' }
    ]
  };

  // Реальные угрозы, проверки и ложные вызовы
  const INCIDENTS = [
    // --- РЕАЛЬНЫЕ УГРОЗЫ ---
    {
      id: 'inc_port_storm',
      type: 'real',
      source: 'ГИДРОМЕТЦЕНТР',
      title: 'Штормовое предупреждение',
      text: 'На район ПОРТ надвигается мощный ураган со скоростью ветра до 32 м/с! Высока угроза обрушения конструкций. Немедленно оповестите жителей укрыться в помещениях и закрыть окна.',
      districts: ['port'],
      sirenMode: 'long',
      tvRequired: true,
      message: ['storm', 'shelter', 'windows'],
      hazardIcon: 'storm',
      weatherStorm: true
    },
    {
      id: 'inc_factory_smoke',
      type: 'real',
      source: 'ПОЖАРНАЯ ОХРАНА',
      title: 'Утечка едкого дыма',
      text: 'На химкомбинате в ЗАВОДСКОМ районе произошла утечка едкого дыма! Облако держится в пределах района. Сообщите о задымлении: всем укрыться в помещениях и надеть средства защиты дыхания.',
      districts: ['factory'],
      sirenMode: 'long',
      tvRequired: true,
      message: ['smoke', 'shelter', 'mask'],
      hazardIcon: 'smoke'
    },
    {
      id: 'inc_forest_fire',
      type: 'real',
      source: 'ЛЕСНАЯ ОХРАНА',
      title: 'Верховой лесной пожар',
      text: 'В ЛЕСНОМ районе вспыхнул крупный лесной пожар! Огонь быстро приближается к санаторию. Объявите пожарную опасность: немедленно покинуть опасную зону и освободить подъезды спецслужбам.',
      districts: ['forest'],
      sirenMode: 'long',
      tvRequired: true,
      message: ['fire', 'evacuate', 'clear_road'],
      hazardIcon: 'fire'
    },
    {
      id: 'inc_port_center_flood',
      type: 'real',
      source: 'МЧС / ВОДНЫЙ ПОСТ',
      title: 'Прорыв дамбы на заливе',
      text: 'Резкий подъём воды! Угроза подтопления охватывает ПОРТ и ЦЕНТР. Включите сирену в обоих районах, прикажите подняться на верхние этажи и отключить газ и электричество.',
      districts: ['port', 'center'],
      sirenMode: 'long',
      tvRequired: true,
      message: ['flood', 'highground', 'power'],
      hazardIcon: 'flood'
    },
    {
      id: 'inc_airport_emergency',
      type: 'real',
      source: 'АВИАДИСПЕТЧЕРСКАЯ',
      title: 'Аварийная посадка борта',
      text: 'В районе АЭРОПОРТ готовится аварийная посадка грузового самолёта с утечкой топлива. Требуется оповещение только в Аэропорту: покинуть опасную зону и освободить подъезды спецслужбам.',
      districts: ['airport'],
      sirenMode: 'long',
      tvRequired: true,
      message: ['aviation', 'evacuate', 'clear_road'],
      hazardIcon: 'plane'
    },
    {
      id: 'inc_res_storm',
      type: 'real',
      source: 'ГИДРОМЕТЦЕНТР',
      title: 'Шквалистый град и смерч',
      text: 'Грозовой фронт с крупным градом накрывает СПАЛЬНЫЙ район и ЦЕНТР! Предупредите население о шторме: всем укрыться в помещениях и закрыть окна и двери.',
      districts: ['residential', 'center'],
      sirenMode: 'long',
      tvRequired: true,
      message: ['storm', 'shelter', 'windows'],
      hazardIcon: 'storm',
      weatherStorm: true
    },
    {
      id: 'inc_factory_res_smoke',
      type: 'real',
      source: 'НИИ ЭКОЛОГИИ',
      title: 'Дрейф токсичного облака',
      text: 'Ветер снёс дымовой шлейф аварии с ЗАВОДСКОГО на СПАЛЬНЫЙ район! Задействуйте оба района: химическое задымление, всем укрыться в помещениях, закрыть окна и двери.',
      districts: ['factory', 'residential'],
      sirenMode: 'long',
      tvRequired: true,
      message: ['smoke', 'shelter', 'windows'],
      hazardIcon: 'smoke'
    },
    {
      id: 'inc_center_fire',
      type: 'real',
      source: 'ПОЖАРНАЯ ОХРАНА',
      title: 'Крупный пожар на складе',
      text: 'В ЦЕНТРЕ загорелся центральный продовольственный склад, существует угроза перехода огня на соседние кварталы. Пожарная опасность: немедленно покинуть опасную зону, отключить газ и электричество.',
      districts: ['center'],
      sirenMode: 'long',
      tvRequired: true,
      message: ['fire', 'evacuate', 'power'],
      hazardIcon: 'fire'
    },
    {
      id: 'inc_airport_forest_storm',
      type: 'real',
      source: 'ГИДРОМЕТЦЕНТР',
      title: 'Циклон с запада',
      text: 'Сильный штормовой фронт заходит на ЛЕСНОЙ район и АЭРОПОРТ. Объявите шторм в этих двух районах: укрыться в помещениях и отключить газ и электричество.',
      districts: ['forest', 'airport'],
      sirenMode: 'long',
      tvRequired: true,
      message: ['storm', 'shelter', 'power'],
      hazardIcon: 'storm',
      weatherStorm: true
    },

    // --- ПЛАНОВЫЕ ПРОВЕРКИ (Короткие гудки, ТВ не перехватывать!) ---
    {
      id: 'inc_drill_center',
      type: 'drill',
      source: 'ШТАБ ГО И ЧС',
      title: 'Плановая проверка сирен',
      text: 'По графику проводится техническая проверка громкоговорителей в районе ЦЕНТР. Подайте КОРОТКИЕ ГУДКИ, передайте текст о проверке (без действий). ТВ и радио перехватывать НЕ нужно!',
      districts: ['center'],
      sirenMode: 'short',
      tvRequired: false,
      message: ['drill', 'calm', 'no_action'],
      hazardIcon: 'drill'
    },
    {
      id: 'inc_drill_res',
      type: 'drill',
      source: 'ШТАБ ГО И ЧС',
      title: 'Тестовый прогон линии',
      text: 'Плановая проверка работоспособности вышек в СПАЛЬНОМ районе. Включите КОРОТКИЕ ГУДКИ и передайте спокойное сообщение о проверке. Перехват ТВ/Радио оставьте выключенным.',
      districts: ['residential'],
      sirenMode: 'short',
      tvRequired: false,
      message: ['drill', 'calm', 'no_action'],
      hazardIcon: 'drill'
    },
    {
      id: 'inc_drill_port_factory',
      type: 'drill',
      source: 'ИНЖЕНЕРНЫЙ ОТДЕЛ',
      title: 'Калибровка громкоговорителей',
      text: 'Проводится плановая проверка связи в районах ПОРТ и ЗАВОДСКОЙ. Нужны КОРОТКИЕ ГУДКИ и стандартное сообщение о проверке системы. Телевидение не прерывать!',
      districts: ['port', 'factory'],
      sirenMode: 'short',
      tvRequired: false,
      message: ['drill', 'calm', 'no_action'],
      hazardIcon: 'drill'
    },

    // --- ЛОЖНЫЕ ВЫЗОВЫ (РОЗЫГРЫШИ) ---
    {
      id: 'hoax_donut',
      type: 'hoax',
      source: 'НЕИЗВЕСТНЫЙ КАНАЛ',
      title: 'СРОЧНО!! Космическая угроза',
      text: 'Тревога! На ЦЕНТР города прямо сейчас летит гигантский летающий пончик с глазурью! Срочно включите все сирены, иначе он посыплет нас сахарной пудрой!',
      suspiciousWords: ['гигантский летающий пончик', 'сахарной пудрой'],
      districts: [],
      sirenMode: null,
      tvRequired: false,
      message: null
    },
    {
      id: 'hoax_squirrels',
      type: 'hoax',
      source: 'АНОНИМНЫЙ ЗВОНОК',
      title: 'Захват Лесного района',
      text: 'В ЛЕСНОМ районе говорящие белки захватили вышку с громкоговорителем и требуют три тонны грецких орехов! Немедленно эвакуируйте весь город!',
      suspiciousWords: ['говорящие белки', 'три тонны грецких орехов'],
      districts: [],
      sirenMode: null,
      tvRequired: false,
      message: null
    },
    {
      id: 'hoax_lunch',
      type: 'hoax',
      source: 'ВНУТРЕННЯЯ ЛИНИЯ',
      title: 'ЧП в столовой завода',
      text: 'В ЗАВОДСКОМ районе пропала котлета начальника смены! Подозревается кот Васька. Немедленно дайте протяжный ревун С-40 и перехватите телевидение!',
      suspiciousWords: ['пропала котлета', 'кот Васька'],
      districts: [],
      sirenMode: null,
      tvRequired: false,
      message: null
    },
    {
      id: 'hoax_teapots',
      type: 'hoax',
      source: 'РАДИОЛЮБИТЕЛЬ-99',
      title: 'Вторжение в Аэропорт',
      text: 'Над АЭРОПОРТОМ зависла флотилия марсианских свистящих чайников! Они закипают и собираются напоить диспетчеров чаем! Включайте тревогу!',
      suspiciousWords: ['марсианских свистящих чайников', 'напоить диспетчеров чаем'],
      districts: [],
      sirenMode: null,
      tvRequired: false,
      message: null
    },
    {
      id: 'hoax_kraken',
      type: 'hoax',
      source: 'РЫБАК ПЕТРОВИЧ',
      title: 'Чудовище в Порту',
      text: 'В ПОРТУ из воды вылез гигантский надувной утёнок высотой 20 метров и громко крякает! Срочно объявляйте эвакуацию и включайте все ревуны!',
      suspiciousWords: ['гигантский надувной утёнок', 'громко крякает'],
      districts: [],
      sirenMode: null,
      tvRequired: false,
      message: null
    }
  ];

  // Улучшения пульта
  const UPGRADES = [
    {
      id: 'loud_towers',
      name: 'Мощные голосовые вышки',
      cost: 250,
      icon: '📢',
      desc: '+6 секунд к таймеру реакции и +20% очков за успешное оповещение.',
      category: 'hardware'
    },
    {
      id: 'satellite_link',
      name: 'Спутниковая связь',
      cost: 350,
      icon: '🛰️',
      desc: 'В 2 раза меньше поломок на линии. Перезагрузка с пульта чинит даже обрывы кабеля!',
      category: 'hardware'
    },
    {
      id: 'backup_generator',
      name: 'Запасной генератор',
      cost: 300,
      icon: '⚡',
      desc: 'Рембригада добирается вдвое быстрее, а грозы не выводят из строя питание.',
      category: 'hardware'
    },
    {
      id: 'spam_filter',
      name: 'Анализатор помех (Анти-спам)',
      cost: 220,
      icon: '🔍',
      desc: 'Подсвечивает подозрительные фразы и помечает сомнительный источник в ложных вызовах.',
      category: 'hardware'
    },
    {
      id: 'siren_tornado',
      name: 'Сирена: Американская торнадо',
      cost: 200,
      icon: '🌪️',
      desc: 'Открывает легендарный двухтональный звук сирены торнадо (Thunderbolt) на пульте.',
      category: 'siren'
    },
    {
      id: 'siren_modern',
      name: 'Сирена: Современная цифровая',
      cost: 200,
      icon: '📡',
      desc: 'Открывает современный электронный сигнал сирены СГС-22 с чистым синтезом.',
      category: 'siren'
    }
  ];

  // Конфигурация смен (длительность в секундах, интервал событий, шанс поломки)
  const SHIFTS = [
    {
      number: 1,
      title: 'СМЕНА №1 — Вводное дежурство',
      duration: 300, // 5 минут
      baseResponseTime: 35, // чуть мягче в первую смену, дальше 30 сек
      incidentInterval: [14, 20],
      breakdownChance: 0.25,
      hoaxChance: 0.22,
      drillChance: 0.22
    },
    {
      number: 2,
      title: 'СМЕНА №2 — Штормовой фронт',
      duration: 360, // 6 минут
      baseResponseTime: 30,
      incidentInterval: [11, 17],
      breakdownChance: 0.42,
      hoaxChance: 0.25,
      drillChance: 0.18
    },
    {
      number: 3,
      title: 'СМЕНА №3 — Ночной аврал',
      duration: 420, // 7 минут
      baseResponseTime: 30,
      incidentInterval: [9, 14],
      breakdownChance: 0.55,
      hoaxChance: 0.28,
      drillChance: 0.15
    }
  ];

  // Сюжеты для мини-телевизора в обычном режиме
  const TV_PROGRAMS = [
    { channel: '1 КАНАЛ', title: 'МУЛЬТФИЛЬМ: «НУ, ПОГОДИ!»', color: '#2b5876', icon: '📺' },
    { channel: '2 КАНАЛ', title: 'ПРОГРАММА «ВРЕМЯ» — НОВОСТИ', color: '#2c3e50', icon: '📰' },
    { channel: '1 КАНАЛ', title: 'ПРОГНОЗ ПОГОДЫ НА ЗАВТРА', color: '#1e5749', icon: '⛅' },
    { channel: '3 КАНАЛ', title: '«В МИРЕ ЖИВОТНЫХ»', color: '#3b4d2b', icon: '🦊' }
  ];

  return {
    DISTRICTS,
    MESSAGE_BLOCKS,
    INCIDENTS,
    UPGRADES,
    SHIFTS,
    TV_PROGRAMS
  };
})();
