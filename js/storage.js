const Storage = (function() {
  const KEYS = {
    PRESETS: 'timer_presets',
    SETTINGS: 'timer_settings',
    NICKNAME: 'timer_nickname',
    RECORDS: 'timer_records'
  };

  const DEFAULT_PRESETS = [
    {
      id: 'default-suyu',
      name: '수유',
      type: 'interval',
      createdAt: new Date().toISOString(),
      config: {
        segments: [
          { name: '수유', duration: 15 * 60, color: '#E91E63' },
          { name: '휴식', duration: 10 * 60, color: '#4CAF50' },
          { name: '수유', duration: 15 * 60, color: '#E91E63' },
          { name: '휴식', duration: 10 * 60, color: '#4CAF50' }
        ],
        cycles: 1
      },
      notification: { soundEnabled: true, vibrationEnabled: true }
    },
    {
      id: 'default-yuchuk',
      name: '유축',
      type: 'interval',
      createdAt: new Date().toISOString(),
      config: {
        segments: [
          { name: '유축', duration: 5 * 60, color: '#2196F3' },
          { name: '휴식', duration: 1 * 60, color: '#4CAF50' }
        ],
        cycles: 6
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
    localStorage.removeItem(KEYS.RECORDS);
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

  // Records
  function categorizePreset(name) {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('수유') || lowerName.includes('젖') || lowerName.includes('먹이')) {
      return 'feeding';
    }
    if (lowerName.includes('유축') || lowerName.includes('펌프')) {
      return 'pumping';
    }
    return 'other';
  }

  function getRecords() {
    const data = localStorage.getItem(KEYS.RECORDS);
    return data ? JSON.parse(data) : [];
  }

  function saveRecords(records) {
    localStorage.setItem(KEYS.RECORDS, JSON.stringify(records));
  }

  function addRecord(record) {
    const records = getRecords();
    const newRecord = {
      id: 'record_' + generateId(),
      ...record,
      category: categorizePreset(record.presetName)
    };
    records.push(newRecord);
    saveRecords(records);
    return newRecord;
  }

  function deleteRecord(id) {
    const records = getRecords();
    saveRecords(records.filter(r => r.id !== id));
  }

  function getRecordsByDate(date) {
    const records = getRecords();
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    return records.filter(r => {
      const recordDate = new Date(r.startedAt);
      return recordDate >= targetDate && recordDate < nextDate;
    }).sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));
  }

  function getTodayRecords() {
    return getRecordsByDate(new Date());
  }

  function getDailySummary(date = new Date()) {
    const records = getRecordsByDate(date);
    const summary = {
      feeding: { count: 0, duration: 0 },
      pumping: { count: 0, duration: 0 },
      other: { count: 0, duration: 0 },
      totalDuration: 0
    };

    records.forEach(r => {
      if (summary[r.category]) {
        summary[r.category].count++;
        summary[r.category].duration += r.duration;
      }
      summary.totalDuration += r.duration;
    });

    return summary;
  }

  function clearRecords() {
    localStorage.removeItem(KEYS.RECORDS);
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
    setNickname,
    categorizePreset,
    getRecords,
    addRecord,
    deleteRecord,
    getRecordsByDate,
    getTodayRecords,
    getDailySummary,
    clearRecords
  };
})();
