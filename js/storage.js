const Storage = (function() {
  const KEYS = {
    PRESETS: 'timer_presets',
    SETTINGS: 'timer_settings',
    NICKNAME: 'timer_nickname'
  };

  const DEFAULT_PRESETS = [
    {
      id: 'default-pomodoro',
      name: '뽀모도로 25/5',
      type: 'pomodoro',
      createdAt: new Date().toISOString(),
      config: {
        focusDuration: 25 * 60,
        shortBreakDuration: 5 * 60,
        longBreakDuration: 15 * 60,
        cyclesBeforeLongBreak: 4
      },
      notification: { soundEnabled: true, vibrationEnabled: true }
    },
    {
      id: 'default-5min',
      name: '5분 타이머',
      type: 'simple',
      createdAt: new Date().toISOString(),
      config: { duration: 5 * 60 },
      notification: { soundEnabled: true, vibrationEnabled: true }
    },
    {
      id: 'default-10min',
      name: '10분 타이머',
      type: 'simple',
      createdAt: new Date().toISOString(),
      config: { duration: 10 * 60 },
      notification: { soundEnabled: true, vibrationEnabled: true }
    },
    {
      id: 'default-hiit',
      name: 'HIIT 30/10',
      type: 'interval',
      createdAt: new Date().toISOString(),
      config: {
        segments: [
          { name: '운동', duration: 30, color: '#dc3545' },
          { name: '휴식', duration: 10, color: '#28a745' }
        ],
        cycles: 8
      },
      notification: { soundEnabled: true, vibrationEnabled: true }
    }
  ];

  const DEFAULT_SETTINGS = {
    theme: 'system',
    keepScreenOn: true,
    defaultSoundEnabled: true,
    defaultVibrationEnabled: true,
    circleDragEnabled: true
  };

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  function getPresets() {
    const data = localStorage.getItem(KEYS.PRESETS);
    if (!data) {
      savePresets(DEFAULT_PRESETS);
      return DEFAULT_PRESETS;
    }
    return JSON.parse(data);
  }

  function savePresets(presets) {
    localStorage.setItem(KEYS.PRESETS, JSON.stringify(presets));
  }

  function getPreset(id) {
    return getPresets().find(p => p.id === id);
  }

  function createPreset(presetData) {
    const presets = getPresets();
    const newPreset = {
      ...presetData,
      id: generateId(),
      createdAt: new Date().toISOString()
    };
    presets.push(newPreset);
    savePresets(presets);
    return newPreset;
  }

  function updatePreset(id, updates) {
    const presets = getPresets();
    const index = presets.findIndex(p => p.id === id);
    if (index === -1) return null;

    presets[index] = {
      ...presets[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    savePresets(presets);
    return presets[index];
  }

  function deletePreset(id) {
    const presets = getPresets();
    savePresets(presets.filter(p => p.id !== id));
  }

  function resetPresets() {
    savePresets(DEFAULT_PRESETS);
    return DEFAULT_PRESETS;
  }

  function getSettings() {
    const data = localStorage.getItem(KEYS.SETTINGS);
    if (!data) {
      saveSettings(DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  }

  function saveSettings(settings) {
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
  }

  function updateSetting(key, value) {
    const settings = getSettings();
    settings[key] = value;
    saveSettings(settings);
    return settings;
  }

  function resetAll() {
    localStorage.removeItem(KEYS.PRESETS);
    localStorage.removeItem(KEYS.SETTINGS);
    localStorage.removeItem(KEYS.NICKNAME);
  }

  function getNickname() {
    return localStorage.getItem(KEYS.NICKNAME) || '';
  }

  function setNickname(name) {
    if (name) {
      localStorage.setItem(KEYS.NICKNAME, name);
    } else {
      localStorage.removeItem(KEYS.NICKNAME);
    }
  }

  return {
    getPresets,
    savePresets,
    getPreset,
    createPreset,
    updatePreset,
    deletePreset,
    resetPresets,
    getSettings,
    saveSettings,
    updateSetting,
    resetAll,
    generateId,
    getNickname,
    setNickname
  };
})();
