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
    playAlarmBeep();
    alarmLoopId = setInterval(playAlarmBeep, 900);
    if (navigator.vibrate) {
      navigator.vibrate([300, 150, 300, 150, 300]);
    }
  }

  function stopAlarmLoop() {
    if (alarmLoopId) clearInterval(alarmLoopId);
    alarmLoopId = null;
  }

  function showAlarmOverlay(title, body) {
    alarmOverlayTitle.textContent = title;
    alarmOverlayBody.textContent = body;
    alarmOverlay.hidden = false;
    startAlarmLoop();
  }

  dismissAlarmBtn.addEventListener('click', () => {
    alarmOverlay.hidden = true;
    stopAlarmLoop();
  });

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
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? raw : null;
  }

  function saveAlarm(isoLocal) {
    localStorage.setItem(STORAGE_KEY, isoLocal);
    localStorage.removeItem(FIRED_KEY);
  }

  function clearAlarm() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(FIRED_KEY);
    alarmInput.value = '';
    alarmStatus.textContent = 'No alarm set.';
  }

  function describeAlarm(isoLocal) {
    const d = new Date(isoLocal);
    if (isNaN(d)) return 'No alarm set.';
    return 'Alarm set for ' + d.toLocaleString(undefined, {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }) + '.';
  }

  saveAlarmBtn.addEventListener('click', () => {
    if (!alarmInput.value) {
      alarmStatus.textContent = 'Pick a date and time first.';
      return;
    }
    saveAlarm(alarmInput.value);
    alarmStatus.textContent = describeAlarm(alarmInput.value);
  });

  clearAlarmBtn.addEventListener('click', clearAlarm);

  function initAlarmUI() {
    const stored = loadAlarm();
    if (stored) {
      alarmInput.value = stored;
      alarmStatus.textContent = describeAlarm(stored);
    }
  }

  function checkAlarm() {
    const stored = loadAlarm();
    if (!stored) return;
    const target = new Date(stored).getTime();
    const now = Date.now();
    const alreadyFired = localStorage.getItem(FIRED_KEY) === stored;
    if (now >= target && !alreadyFired) {
      localStorage.setItem(FIRED_KEY, stored);
      fireNotification('Your CBSE result alarm is ringing', 'The time you set has arrived — check the official result links in the app.');
      showAlarmOverlay('Alarm', 'The time you set has arrived. Check the official result links below.');
    }
  }

  // ---------- Data loading (network-first, cache-busted) ----------
  async function loadData() {
    try {
      const res = await fetch('data.json?ts=' + Date.now(), { cache: 'no-store' });
      return await res.json();
    } catch (e) {
      try {
        const res = await fetch('data.json');
        return await res.json();
      } catch (e2) {
        return null;
      }
    }
  }

  function daysBetween(a, b) {
    const MS = 24 * 60 * 60 * 1000;
    return Math.round((b - a) / MS);
  }

  function renderData(data) {
    if (!data) {
      statusValue.textContent = 'Could not load data.json';
      statusMeta.textContent = 'Check your connection and reload the app.';
      return;
    }

    // Status
    if (data.resultDeclared) {
      statusValue.textContent = 'Result declared';
      statusValue.classList.add('declared');
      statusMeta.textContent = data.officialResultDate
        ? 'Official date on record: ' + data.officialResultDate
        : 'Marked as declared — check the official links below.';

      const alreadyNotified = localStorage.getItem(DECLARED_FIRED_KEY) === (data.officialResultDate || 'yes');
      if (!alreadyNotified) {
        localStorage.setItem(DECLARED_FIRED_KEY, data.officialResultDate || 'yes');
        fireNotification('CBSE Class 10 Second Board Result is OUT', 'Go to cbseresults.nic.in or DigiLocker to check your result.');
        showAlarmOverlay('Result Declared', 'The CBSE Class 10 Second Board result has been marked as declared. Check the official links below.');
      }
    } else {
      statusValue.textContent = 'Not yet officially declared';
      statusMeta.textContent = 'Last verified against official sources on ' + data.lastChecked + '.';
    }

    // Countdown / window
    const win = data.expectedResultWindow;
    if (win) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const start = new Date(win.earliest);
      const end = new Date(win.latest);

      if (today < start) {
        const d = daysBetween(today, start);
        countdownNumber.textContent = d;
        countdownUnit.textContent = 'days until the expected window opens';
      } else if (today > end) {
        countdownNumber.textContent = '—';
        countdownUnit.textContent = 'expected window has passed — awaiting official confirmation';
      } else {
        const d = daysBetween(today, end);
        countdownNumber.textContent = d;
        countdownUnit.textContent = 'days left in the expected window';
      }

      const fmt = (s) => new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      windowRange.textContent = fmt(win.earliest) + ' — ' + fmt(win.latest);
      windowNote.textContent = win.note || '';
    }

    // Sources
    sourceList.innerHTML = '';
    (data.officialSources || []).forEach((s) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = s.name;
      li.appendChild(a);
      sourceList.appendChild(li);
    });

    // Statements
    statementsList.innerHTML = '';
    (win && win.statements || []).forEach((st) => {
      const div = document.createElement('div');
      div.className = 'statement';
      div.innerHTML = `
        <p class="statement-source">${st.source}</p>
        <p class="statement-text">${st.statement}</p>
        <p class="statement-reliability">${st.reliability}</p>
      `;
      statementsList.appendChild(div);
    });

    lastCheckedEl.textContent = 'Data last verified: ' + data.lastChecked;
  }

  async function refreshAll() {
    const data = await loadData();
    renderData(data);
    checkAlarm();
  }

  // ---------- Init ----------
  initAlarmUI();
  refreshAll();

  // Recheck alarm every 20s while the app is open, and re-pull data.json
  // every 5 minutes in case the maintainer has marked the result as declared.
  checkIntervalId = setInterval(checkAlarm, 20 * 1000);
  setInterval(refreshAll, 5 * 60 * 1000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshAll();
  });
})();
