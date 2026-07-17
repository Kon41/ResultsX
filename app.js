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

  const officialLastChecked = $('officialLastChecked');
  const newsLastChecked = $('newsLastChecked');
  const newsSignalValue = $('newsSignalValue');
  const newsSourceLink = $('newsSourceLink');
  const enableNotifBtn = $('enableNotifBtn');
  const permissionStatus = $('permissionStatus');

  const alarmOverlay = $('alarmOverlay');
  const alarmOverlayTitle = $('alarmOverlayTitle');
  const alarmOverlayBody = $('alarmOverlayBody');
  const dismissAlarmBtn = $('dismissAlarmBtn');

  const DECLARED_FIRED_KEY = 'cbseResultWatch.declaredNotified';
  const NEWS_FIRED_KEY = 'cbseResultWatch.newsNotified';

  let audioCtx = null;
  let alarmLoopId = null;

  // ---------- Service worker ----------
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // Best-effort periodic background sync (installed PWA, Android Chrome only).
      // The real, reliable automation is the GitHub Actions job that updates
      // data.json every 3 hours — this is just an extra check in between.
      if ('periodicSync' in reg) {
        navigator.permissions.query({ name: 'periodic-background-sync' }).then((status) => {
          if (status.state === 'granted') {
            reg.periodicSync.register('check-result-status', { minInterval: 3 * 60 * 60 * 1000 }).catch(() => {});
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
    if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
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

  // ---------- Notification permission (the one unavoidable manual step —
  // browsers require a user gesture to grant this; it's a permission, not an alert) ----------
  function refreshPermissionLabel() {
    if (!('Notification' in window)) {
      permissionStatus.textContent = 'Notifications are not supported in this browser.';
      return;
    }
    const map = {
      granted: 'Notifications are enabled — you will be alerted automatically.',
      denied: 'Notifications are blocked — enable them in your browser/site settings to be alerted.',
      default: 'Tap to allow notifications so the automatic checks can alert you.'
    };
    permissionStatus.textContent = map[Notification.permission];
  }

  enableNotifBtn.addEventListener('click', async () => {
    if (!('Notification' in window)) return;
    await Notification.requestPermission();
    refreshPermissionLabel();
  });

  refreshPermissionLabel();

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

  function formatTimestamp(iso) {
    if (!iso) return 'Not yet run';
    const d = new Date(iso);
    if (isNaN(d)) return 'Not yet run';
    return d.toLocaleString(undefined, {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  }

  function renderData(data) {
    if (!data) {
      statusValue.textContent = 'Could not load data.json';
      statusMeta.textContent = 'Check your connection and reload the app.';
      return;
    }

    // ----- Official status -----
    if (data.resultDeclared) {
      statusValue.textContent = 'Result declared';
      statusValue.classList.add('declared');
      statusMeta.textContent = data.officialResultDate
        ? 'Official date on record: ' + data.officialResultDate
        : 'Marked as officially declared — check the official links below.';

      const alreadyNotified = localStorage.getItem(DECLARED_FIRED_KEY) === (data.officialResultDate || 'yes');
      if (!alreadyNotified) {
        localStorage.setItem(DECLARED_FIRED_KEY, data.officialResultDate || 'yes');
        fireNotification('CBSE Class 10 Second Board Result is OUT', 'Go to cbseresults.nic.in or DigiLocker to check your result.');
        showAlarmOverlay('Result Declared', 'The CBSE Class 10 Second Board result has been officially confirmed. Check the official links below.');
      }
    } else {
      statusValue.textContent = 'Not yet officially declared';
      statusValue.classList.remove('declared');
      statusMeta.textContent = 'Last verified against official sources on ' + data.lastChecked + '.';
    }
    officialLastChecked.textContent = data.lastChecked || '—';

    // ----- Automated trusted-news signal -----
    const news = data.newsSignal || {};
    newsLastChecked.textContent = formatTimestamp(news.lastChecked);

    if (news.detected) {
      newsSignalValue.textContent = 'Report detected: ' + (news.source || 'trusted outlet');
      newsSignalValue.classList.add('signal-detected');
      if (news.sourceUrl) {
        newsSourceLink.innerHTML = '<a href="' + news.sourceUrl + '" target="_blank" rel="noopener noreferrer">Open the news report →</a>';
      }

      const notifiedKey = news.detectedAt || 'yes';
      if (localStorage.getItem(NEWS_FIRED_KEY) !== notifiedKey && !data.resultDeclared) {
        localStorage.setItem(NEWS_FIRED_KEY, notifiedKey);
        fireNotification('Possible CBSE result news — not yet official', (news.source || 'A trusted outlet') + ' is reporting on the result. Verify at an official source before relying on it.');
        showAlarmOverlay('Trusted News Signal', (news.source || 'A trusted news outlet') + ' appears to be reporting on the result. This is not an official CBSE confirmation yet — check the official links below to be sure.');
      }
    } else {
      newsSignalValue.textContent = 'No report detected yet';
      newsSignalValue.classList.remove('signal-detected');
      newsSourceLink.textContent = '';
    }

    // ----- Countdown / window -----
    const win = data.expectedResultWindow;
    if (win) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const start = new Date(win.earliest);
      const end = new Date(win.latest);

      if (today < start) {
        countdownNumber.textContent = daysBetween(today, start);
        countdownUnit.textContent = 'days until the expected window opens';
      } else if (today > end) {
        countdownNumber.textContent = '—';
        countdownUnit.textContent = 'expected window has passed — awaiting official confirmation';
      } else {
        countdownNumber.textContent = daysBetween(today, end);
        countdownUnit.textContent = 'days left in the expected window';
      }

      const fmt = (s) => new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      windowRange.textContent = fmt(win.earliest) + ' — ' + fmt(win.latest);
      windowNote.textContent = win.note || '';
    }

    // ----- Sources -----
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

    // ----- Statements -----
    statementsList.innerHTML = '';
    (win && win.statements || []).forEach((st) => {
      const div = document.createElement('div');
      div.className = 'statement';
      div.innerHTML =
        '<p class="statement-source">' + st.source + '</p>' +
        '<p class="statement-text">' + st.statement + '</p>' +
        '<p class="statement-reliability">' + st.reliability + '</p>';
      statementsList.appendChild(div);
    });

    lastCheckedEl.textContent = 'Data last verified: ' + data.lastChecked;
  }

  async function refreshAll() {
    const data = await loadData();
    renderData(data);
  }

  // ---------- Init ----------
  refreshAll();

  // Re-pull data.json every 5 minutes so the app reflects the GitHub Actions
  // checks (every 3 hours) as soon as possible, entirely on its own.
  setInterval(refreshAll, 5 * 60 * 1000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshAll();
  });
})();
