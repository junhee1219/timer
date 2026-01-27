const App = (function() {
  const TYPE_LABELS = {
    simple: '기본',
    interval: '인터벌',
    pomodoro: '뽀모도로',
    stopwatch: '스톱워치'
  };

  const SEGMENT_COLORS = ['#dc3545', '#28a745', '#4A90D9', '#ffc107', '#6f42c1', '#fd7e14'];
  const CIRCLE_CIRCUMFERENCE = 565.48;

  let timer = null;
  let wakeLock = null;
  let editingPreset = null;
  let currentType = 'simple';
  let segments = [];
  let dialogConfirmCallback = null;

  const screens = {};
  const elements = {};

  function init() {
    timer = new TimerEngine();

    screens.home = document.getElementById('home');
    screens.timer = document.getElementById('timer');
    screens['preset-editor'] = document.getElementById('preset-editor');
    screens.settings = document.getElementById('settings');

    cacheElements();
    applyTheme(Storage.getSettings().theme);
    setupTimerCallbacks();
    setupEventListeners();
    setupHistoryNavigation();
    renderHome();
    renderGreeting();
  }

  function cacheElements() {
    elements.presetsList = document.getElementById('presets-list');
    elements.timerTitle = document.getElementById('timer-title');
    elements.timerPhase = document.getElementById('timer-phase');
    elements.timerTime = document.getElementById('timer-time');
    elements.timerProgress = document.getElementById('timer-progress');
    elements.timerInfo = document.getElementById('timer-info');
    elements.playBtn = document.getElementById('timer-play-btn');
    elements.iconPlay = document.querySelector('#timer-play-btn .icon-play');
    elements.iconPause = document.querySelector('#timer-play-btn .icon-pause');
    elements.skipBtn = document.getElementById('timer-skip-btn');
    elements.lapBtn = document.getElementById('timer-lap-btn');
    elements.lapTimes = document.getElementById('lap-times');
    elements.lapTimesList = document.getElementById('lap-times-list');
    elements.editorTitle = document.getElementById('editor-title');
    elements.presetName = document.getElementById('preset-name');
    elements.deleteBtn = document.getElementById('delete-preset-btn');
    elements.segmentsList = document.getElementById('segments-list');
    elements.toast = document.getElementById('toast');
    elements.dialogOverlay = document.getElementById('dialog-overlay');
  }

  function setupTimerCallbacks() {
    timer.onTick = updateTimerDisplay;
    timer.onPhaseChange = (state) => {
      updateTimerDisplay(state);
      elements.timerPhase.animate([
        { opacity: 0, transform: 'translateY(-10px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 300, easing: 'ease-out' });
    };
    timer.onComplete = (state) => {
      updateControls('idle');
      elements.timerPhase.textContent = '완료!';
      elements.timerInfo.textContent = '수고했어요';
    };
    timer.onLap = renderLapTimes;
  }

  function setupEventListeners() {
    // Home
    document.getElementById('add-preset-btn').addEventListener('click', () => {
      openEditor(null);
      showScreen('preset-editor');
    });

    document.getElementById('settings-btn').addEventListener('click', () => {
      loadSettings();
      showScreen('settings');
    });

    // 홈 화면 빈 곳 터치하면 열린 스와이프 닫기
    document.querySelector('.home-content').addEventListener('touchstart', (e) => {
      if (openedCard && !e.target.closest('.preset-card-wrapper')) {
        openedCard.closeSwipe();
        e.preventDefault();
      }
    }, { passive: false });

    // Nickname
    document.getElementById('greeting').addEventListener('click', openNicknameEditor);
    document.getElementById('nickname-edit-btn').addEventListener('click', openNicknameEditor);
    document.getElementById('nickname-save-btn').addEventListener('click', saveNickname);
    document.getElementById('nickname-cancel-btn').addEventListener('click', () => {
      document.getElementById('nickname-modal').classList.remove('show');
    });
    document.getElementById('nickname-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveNickname();
    });

    // Timer
    document.getElementById('timer-play-btn').addEventListener('click', () => {
      const state = timer.toggle();
      updateControls(state);
      if (state === 'running') requestWakeLock();
    });

    document.getElementById('timer-stop-btn').addEventListener('click', () => {
      showDialog({
        title: '타이머 중지',
        message: '타이머를 중지하고 홈으로 돌아갈까요?',
        onConfirm: () => {
          timer.stop();
          releaseWakeLock();
          showScreen('home');
        }
      });
    });

    document.getElementById('timer-skip-btn').addEventListener('click', () => timer.skip());
    document.getElementById('timer-lap-btn').addEventListener('click', () => timer.lap());

    // 원형 프로그레스 드래그로 시간 조절
    setupCircleDrag();

    document.getElementById('timer-back-btn').addEventListener('click', () => {
      if (timer.state === 'running' || timer.state === 'paused') {
        showDialog({
          title: '타이머 중지',
          message: '타이머를 중지하고 홈으로 돌아갈까요?',
          onConfirm: () => {
            timer.stop();
            releaseWakeLock();
            showScreen('home');
          }
        });
      } else {
        showScreen('home');
      }
    });

    // Editor
    document.getElementById('editor-save-btn').addEventListener('click', savePreset);
    document.getElementById('editor-cancel-btn').addEventListener('click', () => showScreen('home'));

    document.getElementById('type-tabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.type-tab');
      if (tab) setType(tab.dataset.type);
    });

    document.getElementById('add-segment-btn').addEventListener('click', addSegment);

    document.getElementById('delete-preset-btn').addEventListener('click', () => {
      showDialog({
        title: '타이머 삭제',
        message: '정말 이 타이머를 삭제할까요?',
        onConfirm: () => {
          Storage.deletePreset(editingPreset.id);
          showToast('타이머가 삭제됐어요');
          renderHome();
          showScreen('home');
        }
      });
    });

    // Steppers
    document.querySelectorAll('.stepper-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        if (!target) return;
        const dir = btn.dataset.dir === 'up' ? 1 : -1;
        const min = parseInt(target.min) || 0;
        const max = parseInt(target.max) || 999;
        const current = parseInt(target.value) || 0;
        target.value = Math.max(min, Math.min(max, current + dir));
      });
    });

    // Settings
    document.getElementById('settings-back-btn').addEventListener('click', () => showScreen('home'));

    document.getElementById('setting-theme').addEventListener('change', (e) => {
      Storage.updateSetting('theme', e.target.value);
      applyTheme(e.target.value);
    });

    document.getElementById('setting-wake-lock').addEventListener('change', (e) => {
      Storage.updateSetting('keepScreenOn', e.target.checked);
    });

    document.getElementById('setting-circle-drag').addEventListener('change', (e) => {
      Storage.updateSetting('circleDragEnabled', e.target.checked);
    });

    document.getElementById('reset-presets-btn').addEventListener('click', () => {
      showDialog({
        title: '프리셋 초기화',
        message: '모든 타이머를 기본값으로 되돌릴까요?',
        onConfirm: () => {
          Storage.resetPresets();
          showToast('프리셋이 초기화됐어요');
          renderHome();
        }
      });
    });

    document.getElementById('reset-all-btn').addEventListener('click', () => {
      showDialog({
        title: '모든 데이터 삭제',
        message: '모든 설정과 타이머가 삭제돼요. 정말 삭제할까요?',
        onConfirm: () => {
          Storage.resetAll();
          showToast('모든 데이터가 삭제됐어요');
          applyTheme('system');
          loadSettings();
          renderHome();
        }
      });
    });

    // Dialog
    document.getElementById('dialog-cancel').addEventListener('click', hideDialog);
    document.getElementById('dialog-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) hideDialog();
    });
    document.getElementById('dialog-confirm').addEventListener('click', () => {
      const callback = dialogConfirmCallback;
      hideDialog();
      if (callback) callback();
    });
  }

  // Screen management
  function showScreen(screenId, pushState = true) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    if (screens[screenId]) screens[screenId].classList.add('active');

    if (pushState && screenId !== 'home') {
      history.pushState({ screen: screenId }, '', `#${screenId}`);
    } else if (pushState && screenId === 'home') {
      history.pushState({ screen: 'home' }, '', window.location.pathname);
    }
  }

  function setupHistoryNavigation() {
    window.addEventListener('popstate', (e) => {
      const screenId = e.state?.screen || 'home';

      if (screenId === 'home' && (timer.state === 'running' || timer.state === 'paused')) {
        timer.stop();
        releaseWakeLock();
      }

      showScreen(screenId, false);
    });

    history.replaceState({ screen: 'home' }, '', window.location.pathname);
  }

  // Home
  let openedCard = null;
  let dragState = {
    isDragging: false,
    draggedEl: null,
    draggedIndex: -1,
    placeholder: null,
    startY: 0,
    currentY: 0,
    longPressTimer: null
  };

  function renderHome() {
    const presets = Storage.getPresets();
    elements.presetsList.innerHTML = '';
    openedCard = null;

    if (presets.length === 0) {
      elements.presetsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⏱️</div>
          <div class="empty-state-title">아직 타이머가 없어요</div>
          <div>아래 + 버튼을 눌러 첫 타이머를 만들어보세요</div>
        </div>
      `;
      return;
    }

    presets.forEach((preset, index) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'preset-card-wrapper';
      wrapper.dataset.index = index;

      wrapper.innerHTML = `
        <div class="preset-card-actions right">
          <button class="preset-card-action edit" aria-label="수정">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        </div>
        <div class="preset-card-actions left">
          <button class="preset-card-action delete" aria-label="삭제">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
        <div class="preset-card">
          <div class="preset-info">
            <div class="preset-name">
              <span class="preset-type-badge ${preset.type}">${TYPE_LABELS[preset.type]}</span>
              ${preset.name}
            </div>
            <div class="preset-detail">${getPresetDetail(preset)}</div>
          </div>
          <svg class="preset-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </div>
      `;

      const card = wrapper.querySelector('.preset-card');
      const editBtn = wrapper.querySelector('.edit');
      const deleteBtn = wrapper.querySelector('.delete');

      let startX = 0;
      let currentX = 0;
      let isDragging = false;
      let isOpen = null; // 'left', 'right', or null
      let swipeStarted = false; // 좌우 스와이프 시작 여부

      function closeSwipe() {
        card.style.transition = 'transform 0.2s ease';
        card.style.transform = '';
        isOpen = null;
        openedCard = null;
      }

      card.addEventListener('touchstart', (e) => {
        // 드래그 중이면 무시
        if (dragState.isDragging) return;

        // 다른 카드가 열려있으면 닫고 현재 터치 무시
        if (openedCard && openedCard !== wrapper) {
          openedCard.closeSwipe();
          e.preventDefault();
          return;
        }

        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isDragging = true;
        card.style.transition = 'none';

        // 롱프레스 감지 (500ms)
        dragState.longPressTimer = setTimeout(() => {
          if (isDragging && Math.abs(currentX) < 10) {
            startDrag(wrapper, index, e.touches[0].clientY);
            isDragging = false;
          }
        }, 500);
      }, { passive: false });

      const SWIPE_THRESHOLD = 70;
      let startY = 0;

      card.addEventListener('touchmove', (e) => {
        // 드래그 모드
        if (dragState.isDragging) {
          e.preventDefault();
          handleDragMove(e.touches[0].clientY);
          return;
        }

        if (!isDragging) return;

        const diffX = e.touches[0].clientX - startX;
        const diffY = e.touches[0].clientY - startY;

        // 수직 이동이 크면 롱프레스 취소
        if (Math.abs(diffY) > 10) {
          clearTimeout(dragState.longPressTimer);
        }

        // 좌우 스와이프 데드존 (20px 이상 움직여야 스와이프 시작)
        const DEADZONE = 20;
        if (!swipeStarted && !isOpen && Math.abs(diffX) < DEADZONE) {
          return;
        }
        swipeStarted = true;

        if (isOpen === 'left') {
          currentX = Math.max(-SWIPE_THRESHOLD, Math.min(0, diffX - SWIPE_THRESHOLD));
        } else if (isOpen === 'right') {
          currentX = Math.max(0, Math.min(SWIPE_THRESHOLD, diffX + SWIPE_THRESHOLD));
        } else {
          // 데드존 이후부터 움직이도록 조정
          const adjustedDiff = diffX > 0 ? diffX - DEADZONE : diffX + DEADZONE;
          currentX = Math.max(-SWIPE_THRESHOLD, Math.min(SWIPE_THRESHOLD, adjustedDiff));
        }

        card.style.transform = `translateX(${currentX}px)`;
      }, { passive: false });

      card.addEventListener('touchend', () => {
        clearTimeout(dragState.longPressTimer);

        if (dragState.isDragging) {
          endDrag();
          return;
        }

        isDragging = false;
        swipeStarted = false;
        card.style.transition = 'transform 0.2s ease';

        if (currentX > 35) {
          card.style.transform = `translateX(${SWIPE_THRESHOLD}px)`;
          isOpen = 'right';
          openedCard = wrapper;
          openedCard.closeSwipe = closeSwipe;
        } else if (currentX < -35) {
          card.style.transform = `translateX(-${SWIPE_THRESHOLD}px)`;
          isOpen = 'left';
          openedCard = wrapper;
          openedCard.closeSwipe = closeSwipe;
        } else {
          card.style.transform = '';
          isOpen = null;
        }
        currentX = 0;
      });

      // 수정 버튼 클릭
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeSwipe();
        openEditor(preset);
        showScreen('preset-editor');
      });

      // 삭제 버튼 클릭
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeSwipe();
        showDialog({
          title: '타이머 삭제',
          message: `"${preset.name}"을(를) 삭제할까요?`,
          onConfirm: () => {
            Storage.deletePreset(preset.id);
            showToast('타이머가 삭제됐어요');
            renderHome();
          }
        });
      });

      // 카드 클릭 - 타이머 시작 (스와이프 중이 아닐 때만)
      card.addEventListener('click', () => {
        if (isOpen) {
          closeSwipe();
        } else {
          playPreset(preset);
        }
      });

      elements.presetsList.appendChild(wrapper);
    });
  }

  function startDrag(wrapper, index, clientY) {
    dragState.isDragging = true;
    dragState.draggedEl = wrapper;
    dragState.draggedIndex = index;
    dragState.startY = clientY;
    dragState.currentY = clientY;

    // 플레이스홀더 생성
    dragState.placeholder = document.createElement('div');
    dragState.placeholder.className = 'preset-card-placeholder';
    dragState.placeholder.style.height = wrapper.offsetHeight + 'px';

    // 드래그 중인 카드 스타일
    const rect = wrapper.getBoundingClientRect();
    wrapper.classList.add('dragging');
    wrapper.style.position = 'fixed';
    wrapper.style.top = rect.top + 'px';
    wrapper.style.left = rect.left + 'px';
    wrapper.style.width = rect.width + 'px';
    wrapper.style.zIndex = '1000';

    // 플레이스홀더 삽입
    wrapper.parentNode.insertBefore(dragState.placeholder, wrapper);

    // 진동 피드백
    if (navigator.vibrate) navigator.vibrate(50);
  }

  function handleDragMove(clientY) {
    if (!dragState.isDragging) return;

    const diff = clientY - dragState.startY;
    dragState.draggedEl.style.top = (dragState.draggedEl.getBoundingClientRect().top - dragState.currentY + clientY) + 'px';
    dragState.currentY = clientY;

    // 다른 카드들과 위치 비교해서 플레이스홀더 이동
    const cards = elements.presetsList.querySelectorAll('.preset-card-wrapper:not(.dragging)');
    const placeholderRect = dragState.placeholder.getBoundingClientRect();

    cards.forEach((card, i) => {
      const cardRect = card.getBoundingClientRect();
      const cardMiddle = cardRect.top + cardRect.height / 2;

      if (clientY < cardMiddle && placeholderRect.top > cardRect.top) {
        card.parentNode.insertBefore(dragState.placeholder, card);
      } else if (clientY > cardMiddle && placeholderRect.top < cardRect.top) {
        card.parentNode.insertBefore(dragState.placeholder, card.nextSibling);
      }
    });
  }

  function endDrag() {
    if (!dragState.isDragging) return;

    // 새 위치 계산
    const cards = Array.from(elements.presetsList.querySelectorAll('.preset-card-wrapper:not(.dragging)'));
    const placeholderIndex = cards.findIndex((card, i) => {
      const next = cards[i];
      if (!next) return true;
      return dragState.placeholder.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING;
    });

    let newIndex = 0;
    const children = Array.from(elements.presetsList.children);
    children.forEach((child, i) => {
      if (child === dragState.placeholder) newIndex = i;
    });

    // 드래그 중인 카드 원위치 스타일 제거
    dragState.draggedEl.classList.remove('dragging');
    dragState.draggedEl.style.position = '';
    dragState.draggedEl.style.top = '';
    dragState.draggedEl.style.left = '';
    dragState.draggedEl.style.width = '';
    dragState.draggedEl.style.zIndex = '';

    // 플레이스홀더를 드래그된 카드로 교체
    dragState.placeholder.parentNode.insertBefore(dragState.draggedEl, dragState.placeholder);
    dragState.placeholder.remove();

    // 프리셋 순서 업데이트
    if (dragState.draggedIndex !== newIndex) {
      const presets = Storage.getPresets();
      const [moved] = presets.splice(dragState.draggedIndex, 1);
      presets.splice(newIndex, 0, moved);
      Storage.savePresets(presets);
      showToast('순서가 변경됐어요');
    }

    // 상태 초기화
    dragState.isDragging = false;
    dragState.draggedEl = null;
    dragState.draggedIndex = -1;
    dragState.placeholder = null;
  }

  function getPresetDetail(preset) {
    switch (preset.type) {
      case 'simple':
        return formatDuration(preset.config.duration);
      case 'interval':
        return `${preset.config.segments.map(s => s.name).join(' → ')} × ${preset.config.cycles}회`;
      case 'pomodoro':
        return `${preset.config.focusDuration / 60}분 집중 / ${preset.config.shortBreakDuration / 60}분 휴식`;
      case 'stopwatch':
        return '경과 시간 측정';
      default:
        return '';
    }
  }

  function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    let parts = [];
    if (h > 0) parts.push(`${h}시간`);
    if (m > 0) parts.push(`${m}분`);
    if (s > 0) parts.push(`${s}초`);

    return parts.length > 0 ? parts.join(' ') : '0초';
  }

  // Timer
  function playPreset(preset) {
    timer.load(preset);
    elements.timerTitle.textContent = preset.name;

    const isStopwatch = preset.type === 'stopwatch';
    const isSimple = preset.type === 'simple';
    elements.skipBtn.style.display = (isStopwatch || isSimple) ? 'none' : '';
    elements.lapBtn.style.display = isStopwatch ? '' : 'none';
    elements.lapTimes.style.display = 'none';
    elements.lapTimesList.innerHTML = '';

    // 초기 상태 설정 (원 비어있음)
    elements.timerProgress.style.strokeDashoffset = CIRCLE_CIRCUMFERENCE + '';

    updateTimerDisplay(timer.getState());
    updateControls('idle');
    showScreen('timer');
  }

  function updateTimerDisplay(state) {
    const isStopwatch = state.preset?.type === 'stopwatch';
    elements.timerTime.textContent = timer.formatTime(state.currentTime, isStopwatch);

    if (state.preset?.type === 'stopwatch') {
      elements.timerProgress.style.strokeDashoffset = '0';
    } else {
      const offset = CIRCLE_CIRCUMFERENCE * (1 - state.progress);
      elements.timerProgress.style.strokeDashoffset = offset + '';
    }

    elements.timerProgress.style.stroke = state.segmentColor;
    elements.timerPhase.style.color = state.segmentColor;
    elements.timerPhase.textContent = state.segmentName;

    let info = '';
    switch (state.preset?.type) {
      case 'simple':
        if (state.state === 'idle') {
          info = '시작 버튼을 눌러주세요';
        } else if (state.currentTime <= 0) {
          info = '완료!';
        }
        break;
      case 'interval': {
        const segments = state.preset.config.segments;
        const nextIdx = (state.currentSegmentIndex + 1) % segments.length;
        const nextName = segments[nextIdx].name;
        info = `사이클 ${state.currentCycle + 1}/${state.preset.config.cycles} · 다음: ${nextName}`;
        break;
      }
      case 'pomodoro': {
        const currentSeg = timer.segments[state.currentSegmentIndex];
        let nextInfo = '';
        if (currentSeg?.isFocus) {
          nextInfo = '다음: 휴식';
        } else if (currentSeg?.isBreak) {
          nextInfo = '다음: 집중';
        } else if (currentSeg?.isLongBreak) {
          nextInfo = '사이클 완료 후 다시 시작';
        }
        const focusCount = Math.floor(state.currentSegmentIndex / 2) + 1;
        info = `${focusCount}번째 · ${nextInfo}`;
        break;
      }
      case 'stopwatch':
        if (state.lapTimes.length > 0) {
          info = `랩 ${state.lapTimes.length}개 기록됨`;
        } else if (state.state === 'idle') {
          info = '시작 버튼을 눌러주세요';
        } else {
          info = '랩 버튼으로 기록하세요';
        }
        break;
    }
    elements.timerInfo.textContent = info;
  }

  function updateControls(state) {
    if (state === 'running') {
      elements.iconPlay.style.display = 'none';
      elements.iconPause.style.display = '';
    } else {
      elements.iconPlay.style.display = '';
      elements.iconPause.style.display = 'none';
    }
  }

  function renderLapTimes(lapTimes) {
    elements.lapTimes.style.display = '';
    elements.lapTimesList.innerHTML = lapTimes.map(lap => `
      <li class="lap-item">
        <span class="lap-item-number">랩 ${lap.number}</span>
        <span>${timer.formatTime(lap.time, true)}</span>
      </li>
    `).reverse().join('');
  }

  // Editor
  function openEditor(preset) {
    editingPreset = preset;

    if (preset) {
      elements.editorTitle.textContent = '타이머 편집';
      elements.deleteBtn.style.display = '';
      loadPresetToEditor(preset);
    } else {
      elements.editorTitle.textContent = '새 타이머';
      elements.deleteBtn.style.display = 'none';
      resetEditor();
    }
  }

  function resetEditor() {
    elements.presetName.value = '';
    setType('simple');

    document.getElementById('simple-hours').value = 0;
    document.getElementById('simple-minutes').value = 5;
    document.getElementById('simple-seconds').value = 0;

    segments = [
      { name: '운동', duration: 30, color: SEGMENT_COLORS[0] },
      { name: '휴식', duration: 10, color: SEGMENT_COLORS[1] }
    ];
    renderSegments();
    document.getElementById('interval-cycles').value = 3;

    document.getElementById('pomodoro-focus').value = 25;
    document.getElementById('pomodoro-short-break').value = 5;
    document.getElementById('pomodoro-long-break').value = 15;
    document.getElementById('pomodoro-cycles').value = 4;
  }

  function loadPresetToEditor(preset) {
    elements.presetName.value = preset.name;
    setType(preset.type);

    switch (preset.type) {
      case 'simple':
        const total = preset.config.duration;
        document.getElementById('simple-hours').value = Math.floor(total / 3600);
        document.getElementById('simple-minutes').value = Math.floor((total % 3600) / 60);
        document.getElementById('simple-seconds').value = total % 60;
        break;

      case 'interval':
        segments = preset.config.segments.map(s => ({ ...s }));
        renderSegments();
        document.getElementById('interval-cycles').value = preset.config.cycles;
        break;

      case 'pomodoro':
        document.getElementById('pomodoro-focus').value = preset.config.focusDuration / 60;
        document.getElementById('pomodoro-short-break').value = preset.config.shortBreakDuration / 60;
        document.getElementById('pomodoro-long-break').value = preset.config.longBreakDuration / 60;
        document.getElementById('pomodoro-cycles').value = preset.config.cyclesBeforeLongBreak;
        break;
    }
  }

  function setType(type) {
    currentType = type;
    document.querySelectorAll('.type-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.type === type);
    });
    document.getElementById('config-simple').style.display = type === 'simple' ? '' : 'none';
    document.getElementById('config-interval').style.display = type === 'interval' ? '' : 'none';
    document.getElementById('config-pomodoro').style.display = type === 'pomodoro' ? '' : 'none';
    document.getElementById('config-stopwatch').style.display = type === 'stopwatch' ? '' : 'none';
  }

  function addSegment() {
    segments.push({
      name: `구간 ${segments.length + 1}`,
      duration: 30,
      color: SEGMENT_COLORS[segments.length % SEGMENT_COLORS.length]
    });
    renderSegments();
  }

  function renderSegments() {
    elements.segmentsList.innerHTML = segments.map((seg, i) => `
      <div class="segment-item" data-index="${i}">
        <div class="segment-color" style="background: ${seg.color}"></div>
        <input type="text" class="segment-name-input" value="${seg.name}" placeholder="구간 이름">
        <div class="segment-time">
          <input type="number" class="segment-time-input" value="${seg.duration}" min="1" max="3600">
          <span class="segment-time-label">초</span>
        </div>
        <button class="segment-delete-btn" aria-label="삭제">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `).join('');

    elements.segmentsList.querySelectorAll('.segment-item').forEach((item, i) => {
      item.querySelector('.segment-name-input').addEventListener('input', (e) => {
        segments[i].name = e.target.value;
      });
      item.querySelector('.segment-time-input').addEventListener('input', (e) => {
        segments[i].duration = parseInt(e.target.value) || 1;
      });
      item.querySelector('.segment-delete-btn').addEventListener('click', () => {
        if (segments.length <= 1) {
          showToast('최소 1개의 구간이 필요해요');
          return;
        }
        segments.splice(i, 1);
        renderSegments();
      });
    });
  }

  function getDefaultPresetName() {
    const now = new Date();
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const day = days[now.getDay()];
    const hour = now.getHours();
    const minute = now.getMinutes().toString().padStart(2, '0');
    return `${month}/${date}(${day}) ${hour}:${minute}`;
  }

  function savePreset() {
    let name = elements.presetName.value.trim();
    if (!name) {
      name = getDefaultPresetName();
    }

    if (currentType === 'simple') {
      const h = parseInt(document.getElementById('simple-hours').value) || 0;
      const m = parseInt(document.getElementById('simple-minutes').value) || 0;
      const s = parseInt(document.getElementById('simple-seconds').value) || 0;
      if (h + m + s === 0) {
        showToast('시간을 설정해주세요');
        return;
      }
    }

    const presetData = {
      name,
      type: currentType,
      config: buildConfig()
    };

    if (editingPreset) {
      Storage.updatePreset(editingPreset.id, presetData);
      showToast('타이머가 수정됐어요');
    } else {
      Storage.createPreset(presetData);
      showToast('새 타이머가 만들어졌어요');
    }

    renderHome();
    showScreen('home');
  }

  function buildConfig() {
    switch (currentType) {
      case 'simple':
        const h = parseInt(document.getElementById('simple-hours').value) || 0;
        const m = parseInt(document.getElementById('simple-minutes').value) || 0;
        const s = parseInt(document.getElementById('simple-seconds').value) || 0;
        return { duration: h * 3600 + m * 60 + s };

      case 'interval':
        return {
          segments: segments.map(s => ({ ...s })),
          cycles: parseInt(document.getElementById('interval-cycles').value) || 1
        };

      case 'pomodoro':
        return {
          focusDuration: (parseInt(document.getElementById('pomodoro-focus').value) || 25) * 60,
          shortBreakDuration: (parseInt(document.getElementById('pomodoro-short-break').value) || 5) * 60,
          longBreakDuration: (parseInt(document.getElementById('pomodoro-long-break').value) || 15) * 60,
          cyclesBeforeLongBreak: parseInt(document.getElementById('pomodoro-cycles').value) || 4
        };

      case 'stopwatch':
        return {};

      default:
        return {};
    }
  }

  // Settings
  function loadSettings() {
    const settings = Storage.getSettings();
    document.getElementById('setting-theme').value = settings.theme;
    document.getElementById('setting-wake-lock').checked = settings.keepScreenOn;
    document.getElementById('setting-circle-drag').checked = settings.circleDragEnabled;
  }

  function applyTheme(theme) {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }

  // Nickname
  function renderGreeting() {
    const nickname = Storage.getNickname();
    const greetingEl = document.getElementById('greeting');
    if (nickname) {
      greetingEl.textContent = `${nickname}님, 안녕하세요`;
      greetingEl.style.display = '';
    } else {
      greetingEl.style.display = 'none';
    }
  }

  function openNicknameEditor() {
    const current = Storage.getNickname();
    const input = document.getElementById('nickname-input');
    input.value = current;
    document.getElementById('nickname-modal').classList.add('show');
    input.focus();
  }

  function saveNickname() {
    const input = document.getElementById('nickname-input');
    Storage.setNickname(input.value.trim());
    document.getElementById('nickname-modal').classList.remove('show');
    renderGreeting();
    showToast(input.value.trim() ? '닉네임이 저장됐어요' : '닉네임이 삭제됐어요');
  }

  // Utils
  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    setTimeout(() => elements.toast.classList.remove('show'), 2500);
  }

  function showDialog({ title, message, onConfirm }) {
    document.getElementById('dialog-title').textContent = title;
    document.getElementById('dialog-message').textContent = message;
    elements.dialogOverlay.classList.add('show');
    dialogConfirmCallback = onConfirm;
  }

  function hideDialog() {
    elements.dialogOverlay.classList.remove('show');
    dialogConfirmCallback = null;
  }

  // 원형 프로그레스 드래그
  function setupCircleDrag() {
    const timerDisplay = document.querySelector('.timer-display');
    const progressCircle = document.getElementById('timer-progress');
    let isDragging = false;

    function getAngleFromEvent(e) {
      const rect = timerDisplay.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const deltaX = clientX - centerX;
      const deltaY = clientY - centerY;

      // 각도 계산 (12시 방향이 0, 시계방향으로 증가)
      let angle = Math.atan2(deltaX, -deltaY) * (180 / Math.PI);
      if (angle < 0) angle += 360;

      return angle / 360; // 0~1 사이의 progress 값으로 변환
    }

    function handleDragStart(e) {
      if (timer.preset?.type === 'stopwatch') return;
      if (!Storage.getSettings().circleDragEnabled) return;
      isDragging = true;
      handleDrag(e);
    }

    function handleDrag(e) {
      if (!isDragging) return;
      e.preventDefault();
      const progress = getAngleFromEvent(e);
      timer.seek(progress);
    }

    function handleDragEnd() {
      if (!isDragging) return;
      isDragging = false;
    }

    timerDisplay.addEventListener('touchstart', handleDragStart, { passive: false });
    document.addEventListener('touchmove', handleDrag, { passive: false });
    document.addEventListener('touchend', handleDragEnd);
    document.addEventListener('touchcancel', handleDragEnd);

    // 마우스 지원 (데스크톱 테스트용)
    timerDisplay.addEventListener('mousedown', handleDragStart);
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', handleDragEnd);
  }

  async function requestWakeLock() {
    if (!Storage.getSettings().keepScreenOn) return;
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) {}
  }

  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release();
      wakeLock = null;
    }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
