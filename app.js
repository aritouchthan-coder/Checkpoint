const API_URL = 'https://script.google.com/macros/s/AKfycbzGsn-l3LDdMwghjJ58C2B-IVpZ8_lXRFfQwyEEYv4kFSp4Q_hcOFv7d0--8rvitKVaWg/exec';

const $ = id => document.getElementById(id);

let currentUser = '';
let pointsCache = [];
let logsCache = [];

let codeReader;
let scanning = false;
let busy = false;

function api(action, params = {}) {
  return new Promise((resolve, reject) => {
    const cb = 'cb_' + Date.now();

    const query = new URLSearchParams({
      action,
      callback: cb,
      ...params
    });

    const script = document.createElement('script');
    script.src = API_URL + '?' + query;

    window[cb] = data => {
      resolve(data);
      delete window[cb];
      script.remove();
    };

    script.onerror = reject;

    document.body.appendChild(script);
  });
}

function playBeep() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.frequency.value = 1200;
  gain.gain.value = 0.2;

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + 0.15);
}

function getToday() {
  const now = new Date();

  if (now.getHours() < 10) {
    now.setDate(now.getDate() - 1);
  }

  const y = now.getFullYear();
  const m = String(now.getMonth()+1).padStart(2,'0');
  const d = String(now.getDate()).padStart(2,'0');

  return `${y}-${m}-${d}`;
}

function setupDailyReload() {
  function next() {
    const now = new Date();
    const target = new Date();

    target.setHours(11,0,0,0);

    if (now > target) {
      target.setDate(target.getDate()+1);
    }

    return target - now;
  }

  setTimeout(() => {
    alert('🔄 ระบบจะรีเซ็ตตอนนี้');
    location.reload();
  }, next());
}

async function loadUsers() {
  const users = await api('getUsers');

  $('loginUser').innerHTML =
    '<option value="">เลือก</option>' +
    users.map(u => `<option value="${u.username}">${u.username}</option>`).join('');
}

async function loadPoints() {
  pointsCache = await api('getPoints');
}

async function loadLogs() {
  logsCache = await api('getLogs');
}

async function renderDashboard() {
  await loadPoints();
  await loadLogs();

  const today = getToday();

  let done = 0;

  let html = `
    <tr>
      <th>ID</th>
      <th>จุด</th>
      <th>สถานะ</th>
    </tr>
  `;

  pointsCache.forEach(p => {
    const logs = logsCache.filter(l =>
      l.workDate === today && l.pointId === p.id
    );

    if (logs.length) done++;

    html += `
      <tr>
        <td>${p.id}</td>
        <td>${p.name}</td>
        <td class="${logs.length ? 'done':'not'}">
          ${logs.length ? '✔':'✖'}
        </td>
      </tr>
    `;
  });

  $('dashboardTable').innerHTML = html;
  $('totalPoints').textContent = pointsCache.length;
  $('donePoints').textContent = done;
  $('notDonePoints').textContent = pointsCache.length - done;
}

async function saveScan(code) {
  if (busy) return;
  busy = true;

  const res = await api('saveScan', {
    username: currentUser,
    barcode: code
  });

  if (res.status === 'success') {
    playBeep();
    alert('✅ ' + res.point);
  } else {
    alert(res.message);
  }

  await renderDashboard();

  busy = false;
}

async function startScan() {
  if (scanning) return;

  codeReader = new ZXing.BrowserMultiFormatReader();

  scanning = true;

  await codeReader.decodeFromVideoDevice(null, 'preview', result => {
    if (result) {
      saveScan(result.text);
    }
  });
}

function stopScan() {
  if (codeReader) codeReader.reset();
  scanning = false;
}

document.addEventListener('DOMContentLoaded', async () => {

  setupDailyReload(); // 🔥 รีเซ็ต 11:00

  await loadUsers();

  $('confirmUserBtn').onclick = async () => {
    const user = $('loginUser').value;

    if (!user) return;

    currentUser = user;

    $('lockedUserPill').textContent = user;
    $('loginCard').classList.add('hidden');
    $('app').classList.remove('hidden');

    await renderDashboard();
  };

  $('startBtn').onclick = startScan;
  $('stopBtn').onclick = stopScan;
});
