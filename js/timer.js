const TimerEngine = (function() {
  class Timer {
    constructor() {
      this.preset = null;
      this.state = 'idle';
      this.currentTime = 0;
      this.totalTime = 0;
      this.intervalId = null;
      this.lastTick = null;
      this.currentSegmentIndex = 0;
      this.currentCycle = 0;
      this.segments = [];
      this.lapTimes = [];
      this.lastLapTime = 0;

      this.onTick = null;
      this.onPhaseChange = null;
      this.onComplete = null;
      this.onLap = null;
    }

    load(preset) {
      this.preset = preset;
      this.state = 'idle';
      this.currentSegmentIndex = 0;
      this.currentCycle = 0;
      this.lapTimes = [];
      this.lastLapTime = 0;

      switch (preset.type) {
        case 'simple':
          this.totalTime = preset.config.duration;
          this.currentTime = this.totalTime;
          this.segments = [{ name: '타이머', duration: this.totalTime, color: '#4A90D9' }];
          break;

        case 'interval':
          this.segments = preset.config.segments.map(s => ({ ...s }));
          this.currentTime = this.segments[0].duration;
          this.totalTime = this.segments[0].duration;
          break;

        case 'pomodoro':
          this.segments = this.buildPomodoroSegments(preset.config);
          this.currentTime = this.segments[0].duration;
          this.totalTime = this.segments[0].duration;
          break;

        case 'stopwatch':
          this.currentTime = 0;
          this.totalTime = 0;
          this.segments = [{ name: '스톱워치', duration: 0, color: '#4A90D9' }];
          break;
      }
    }

    buildPomodoroSegments(config) {
      const segments = [];
      const { focusDuration, shortBreakDuration, longBreakDuration, cyclesBeforeLongBreak } = config;

      for (let i = 0; i < cyclesBeforeLongBreak; i++) {
        segments.push({ name: '집중', duration: focusDuration, color: '#4A90D9', isFocus: true });
        if (i < cyclesBeforeLongBreak - 1) {
          segments.push({ name: '짧은 휴식', duration: shortBreakDuration, color: '#28a745', isBreak: true });
        } else {
          segments.push({ name: '긴 휴식', duration: longBreakDuration, color: '#6f42c1', isLongBreak: true });
        }
      }
      return segments;
    }

    start() {
      if (this.state === 'running') return;
      this.state = 'running';
      this.lastTick = Date.now();
      this.intervalId = setInterval(() => this.tick(), 10);
    }

    tick() {
      const now = Date.now();
      const delta = (now - this.lastTick) / 1000;
      this.lastTick = now;

      if (this.preset.type === 'stopwatch') {
        this.currentTime += delta;
        this.onTick?.(this.getState());
        return;
      }

      this.currentTime -= delta;

      if (this.currentTime <= 0) {
        this.currentTime = 0;
        this.handleSegmentComplete();
      }

      this.onTick?.(this.getState());
    }

    handleSegmentComplete() {
      this.playNotification();

      if (this.preset.type === 'simple') {
        this.complete();
        return;
      }

      if (this.preset.type === 'interval') {
        this.currentSegmentIndex++;
        if (this.currentSegmentIndex >= this.segments.length) {
          this.currentCycle++;
          if (this.currentCycle >= this.preset.config.cycles) {
            this.complete();
            return;
          }
          this.currentSegmentIndex = 0;
        }
        const nextSegment = this.segments[this.currentSegmentIndex];
        this.currentTime = nextSegment.duration;
        this.totalTime = nextSegment.duration;
        this.onPhaseChange?.(this.getState());
        return;
      }

      if (this.preset.type === 'pomodoro') {
        this.currentSegmentIndex++;
        if (this.currentSegmentIndex >= this.segments.length) {
          this.currentCycle++;
          this.currentSegmentIndex = 0;
        }
        const nextSegment = this.segments[this.currentSegmentIndex];
        this.currentTime = nextSegment.duration;
        this.totalTime = nextSegment.duration;
        this.onPhaseChange?.(this.getState());
      }
    }

    pause() {
      if (this.state !== 'running') return;
      this.state = 'paused';
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    toggle() {
      if (this.state === 'running') {
        this.pause();
      } else {
        this.start();
      }
      return this.state;
    }

    stop() {
      this.state = 'idle';
      clearInterval(this.intervalId);
      this.intervalId = null;
      if (this.preset) {
        this.load(this.preset);
      }
    }

    skip() {
      if (!this.preset || this.preset.type === 'simple' || this.preset.type === 'stopwatch') return;
      this.handleSegmentComplete();
      this.onTick?.(this.getState());
    }

    lap() {
      if (this.preset.type !== 'stopwatch') return;
      const lapTime = this.currentTime - this.lastLapTime;
      this.lapTimes.push({
        number: this.lapTimes.length + 1,
        time: lapTime,
        total: this.currentTime
      });
      this.lastLapTime = this.currentTime;
      this.onLap?.(this.lapTimes);
    }

    seek(progress) {
      if (!this.preset || this.preset.type === 'stopwatch') return;
      // progress: 0 = 시작, 1 = 끝
      const clampedProgress = Math.max(0, Math.min(1, progress));
      this.currentTime = this.totalTime * (1 - clampedProgress);
      this.onTick?.(this.getState());
    }

    getCurrentSegmentTotalTime() {
      return this.totalTime;
    }

    complete() {
      this.state = 'idle';
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.onComplete?.(this.getState());
    }

    playNotification() {
      // 진동만 사용 (iOS에서는 지원 안 됨)
      if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
    }

    getState() {
      const segment = this.segments[this.currentSegmentIndex] || {};
      return {
        preset: this.preset,
        state: this.state,
        currentTime: this.currentTime,
        totalTime: this.totalTime,
        progress: this.totalTime > 0 ? 1 - (this.currentTime / this.totalTime) : 0,
        segmentName: segment.name || '',
        segmentColor: segment.color || '#4A90D9',
        currentSegmentIndex: this.currentSegmentIndex,
        totalSegments: this.segments.length,
        currentCycle: this.currentCycle,
        lapTimes: this.lapTimes
      };
    }

    formatTime(seconds, showCentiseconds = false) {
      const absSeconds = Math.abs(seconds);
      const h = Math.floor(absSeconds / 3600);
      const m = Math.floor((absSeconds % 3600) / 60);
      const s = Math.floor(absSeconds % 60);
      const cs = Math.floor((absSeconds % 1) * 100);

      if (showCentiseconds) {
        if (h > 0) {
          return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
        }
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
      }

      if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      }
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
  }

  return Timer;
})();
