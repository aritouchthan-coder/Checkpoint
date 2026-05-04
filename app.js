const USERS = [
  { username: 'user1', name: 'พนักงาน 1', role: 'staff' },
  { username: 'user2', name: 'พนักงาน 2', role: 'staff' }
];

const POINTS = [
  { id: 'P001', name: 'จุดตรวจ 1', barcode: 'P001' },
  { id: 'P002', name: 'จุดตรวจ 2', barcode: 'P002' },
  { id: 'P003', name: 'จุดตรวจ 3', barcode: 'P003' }
];

const $ = id => document.getElementById(id);

let codeReader = null;
let scanning = false;
let busy = false;
let currentUser = '';

function getWorkDate() {
  const now = new Date();

  if (now.getHours() < 10) {
    now.setDate(now.getDate() - 1);
  }

  return now.toISOString().slice(0, 10);
}

function getLogs() {
  return JSON.parse(localStorage.getItem('checkpoint_logs') || '[]');
}

function saveLogs(logs) {
  localStorage.setItem('checkpoint_logs', JSON.stringify(logs));
}

function getScanStatus(username) {
  const workDate = getWorkDate();
  const logs = getLogs();
  const scanned = {};

  logs.forEach(log => {
    if (log.workDate === workDate && log.username === username) {
      scanned[log.pointId] = true;
    }
  });

  return scanned;
}

function loadUsers() {
  const select = $('loginUser');

  select.innerHTML = '<option value="">— เลือกชื่อ —</option>';

  USERS.forEach(user => {
    const opt = document.createElement('option');
    opt.value = user.username;
    opt.textContent = user.username;
    select.appendChild(opt);
  });
}

function enterAppWithUser(username) {
  currentUser = username;
  localStorage.setItem('checkpoint_user', username);

  $('lockedUserPill').textContent = username;
  $('loginCard').classList.add('hidden');
  $('app').classList.remove('hidden');

  renderStatus();
}

function renderStatus() {
  const scanned = getScanStatus(currentUser);

  let html = `
    <tr>
      <th>จุด</th>
      <th>สถานะ</th>
    </tr>
  `;

  POINTS.forEach(point => {
    const ok = scanned[point.id] === true;

    html += `
      <tr>
        <td>${point.name}</td>
        <td class="${ok ? 'done' : 'not'}">
          ${ok ? '✔ สแกนแล้ว' : '✖ ยังไม่สแกน'}
        </td>
      </tr>
    `;
  });

  $('statusTable').innerHTML = html;
}

function saveScan(barcode) {
  if (busy) return;

  busy = true;

  const code = String(barcode || '').trim();
  const point = POINTS.find(p => p.barcode === code);

  if (!point) {
    showResult('❌ ไม่พบ QR นี้ในระบบ: ' + code);
    busy = false;
    return;
  }

  const logs = getLogs();
  const workDate = getWorkDate();

  const duplicate = logs.some(log =>
    log.workDate === workDate &&
    log.username === currentUser &&
    log.pointId === point.id
  );

  if (duplicate) {
    showResult('⚠️ จุดนี้สแกนแล้ว: ' + point.name);
    busy = false;
    return;
  }

  logs.push({
    workDate,
    timestamp: new Date().toLocaleString('th-TH'),
    username: currentUser,
    pointId: point.id,
    pointName: point.name,
    status: 'scanned'
  });

  saveLogs(logs);

  showResult('✅ บันทึกแล้ว: ' + point.name);
  $('manualBarcode').value = '';
  renderStatus();

  setTimeout(() => {
    busy = false;
  }, 1200);
}

function showResult(message) {
  $('scanResult').textContent = message;
  $('manualMsg').textContent = message;
}

async function startScan() {
  if (scanning) return;

  if (!window.ZXing) {
    showResult('กำลังโหลดระบบสแกน...');
    return;
  }

  codeReader = new ZXing.BrowserMultiFormatReader();

  scanning = true;
  $('startBtn').disabled = true;
  $('stopBtn').disabled = false;
  $('status').textContent = '📷 กำลังสแกน...';

  try {
    await codeReader.decodeFromVideoDevice(null, 'preview', (result) => {
      if (result && result.text) {
        saveScan(result.text.trim());
      }
    });
  } catch (err) {
    showResult('❌ เปิดกล้องไม่สำเร็จ: ' + err.message);
    stopScan();
  }
}

function stopScan() {
  try {
    if (codeReader) codeReader.reset();
  } catch (e) {}

  scanning = false;
  $('startBtn').disabled = false;
  $('stopBtn').disabled = true;
  $('status').textContent = 'หยุดสแกน';
}

document.addEventListener('DOMContentLoaded', () => {
  loadUsers();

  $('confirmUserBtn').addEventListener('click', () => {
    const username = $('loginUser').value;

    if (!username) {
      $('loginMsg').textContent = 'กรุณาเลือกผู้ใช้งาน';
      return;
    }

    enterAppWithUser(username);
  });

  $('changeUserBtn').addEventListener('click', () => {
    stopScan();
    localStorage.removeItem('checkpoint_user');
    $('app').classList.add('hidden');
    $('loginCard').classList.remove('hidden');
  });

  $('startBtn').addEventListener('click', startScan);
  $('stopBtn').addEventListener('click', stopScan);

  $('manualSubmitBtn').addEventListener('click', () => {
    saveScan($('manualBarcode').value);
  });

  $('manualBarcode').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      saveScan($('manualBarcode').value);
    }
  });

  const savedUser = localStorage.getItem('checkpoint_user');

  if (savedUser) {
    enterAppWithUser(savedUser);
  }
});
