(() => {
  const $ = (id) => document.getElementById(id);

  const statusValue = $('statusValue');
  const statusMeta = $('statusMeta');
  const countdownNumber = $('countdownNumber');
  const countdownUnit = document.querySelector('.countdown-unit');
  const windowRange = $('windowRange');
  const windowNote = $('windowNote');
  const sourceList = $('sourceList');
  const statementsList = $('statementsList');
  const lastCheckedEl = $('lastChecked');

  const alarmInput = $('alarmInput');
  const saveAlarmBtn = $('saveAlarmBtn');
  const clearAlarmBtn = $('clearAlarmBtn');
  const alarmStatus = $('alarmStatus');
  const enableNotifBtn = $('enableNotifBtn');
  const testAlarmBtn = $('testAlarmBtn');
  const permissionStatus = $('permissionStatus');

  const alarmOverlay = $('alarmOverlay');
  const alarmOverlayTitle = $('alarmOverlayTitle');
  const alarmOverlayBody = $('alarmOverlayBody');
  const dismissAlarmBtn = $('dismissAlarmBtn');

  const STORAGE_KEY = 'cbseResultWatch.alarm';
  const FIRED_KEY = 'cbseResultWatch.alarmFiredFor';
  const DECLARED_FIRED_KEY = 'cbseResultWatch.declaredNotified';

  let audioCtx = null;
  let alarmLoopId = null;
  let checkIntervalId = null;

  // ---------- Service worker ----------
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // Best-effort periodic background sync (installed PWA, Android Chrome only)
      if ('periodicSync' in reg) {
        navigator.permissions.query({ name: 'periodic-background-sync' }).then((status) => {
          if (status.state === 'granted') {
            reg.periodicSync.register('check-result-status', { minInterval: 12 * 60 * 60 * 1000 }).catch(() => {});
          }
        }).catch(() => {});
      }
    }).catch(() => {});
  }

  // ---------- Sound ----------
  function playAlarmBeep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.4);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.45);
    } catch (e) { /* audio not available */ }
  }

  function startAlarmLoop() {
    // Prevent interval stacking (ghost loops) by stopping any existing loop first
    stopAlarmLoop();
    playAlarmBeep();
    alarmLoopId = setInterval(playAlarmBeep, 900);
    if (navigator.vibrate) {
      navigator.vibrate([300, 150, 300, 150, 300]);
    }
  }

  function stopAlarmLoop() {
    if (alarmLoopId) {
      clearInterval(alarmLoopId);
      alarmLoopId = null;
    }
    if (navigator.vibrate) {
      navigator.vibrate(0); // Kill vibration immediately
    }
  }

  function showAlarmOverlay(title, body) {
    alarmOverlayTitle.textContent = title;
    alarmOverlayBody.textContent = body;
    // Force CSS display so it renders properly without specificity conflicts
    alarmOverlay.style.removeProperty('display');
    alarmOverlay.style.display = 'flex';
    alarmOverlay.hidden = false;
    startAlarmLoop();
  }

  // Bulletproof dismiss handler
  function dismissAlarm() {
    // 1. Force inline CSS hiding to override any style.css rules
    alarmOverlay.style.setProperty('display', 'none', 'important');
    alarmOverlay.hidden = true;

    // 2. Stop audio oscillator loop and vibration immediately
    stopAlarmLoop();
    if (audioCtx && audioCtx.state !== 'closed') {
      try { audioCtx.suspend(); } catch (e) { /* ignore */ }
    }

    // 3. Automatically wipe expired alarms from localStorage so it never re-rings
    const stored = loadAlarm();
    if (stored && Date.now() >= new Date(stored).getTime()) {
      clearAlarm();
    } else {
      localStorage.removeItem(FIRED_KEY);
    }
  }

  dismissAlarmBtn.addEventListener('click', dismissAlarm);

  function fireNotification(title, body) {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, {
          body,
          icon: 'icons/icon-192.png',
          badge: 'icons/icon-192.png',
          vibrate: [300, 150, 300],
          requireInteraction: true,
          tag: 'cbse-result-alarm'
        });
      });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: 'icons/icon-192.png' });
    }
  }

  // ---------- Notification permission ----------
  function refreshPermissionLabel() {
    if (!('Notification' in window)) {
      permissionStatus.textContent = 'Notifications are not supported in this browser.';
      return;
    }
    const map = {
      granted: 'Notifications are enabled.',
      denied: 'Notifications are blocked — enable them in your browser/site settings.',
      default: 'Notifications not yet enabled.'
    };
    permissionStatus.textContent = map[Notification.permission];
  }

  enableNotifBtn.addEventListener('click', async () => {
    if (!('Notification' in window)) return;
    await Notification.requestPermission();
    refreshPermissionLabel();
  });

  testAlarmBtn.addEventListener('click', () => {
    fireNotification('Test alarm — CBSE Result Watch', 'This is what you will see when your alarm rings.');
    showAlarmOverlay('Test Alarm', 'This is a test. Your real alarm will look like this.');
  });

  refreshPermissionLabel();

  // ---------- Alarm scheduling ----------
  function loadAlarm() {
    const raw = localStorage.getItem(STORAGE
