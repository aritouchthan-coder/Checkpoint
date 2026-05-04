const API_URL = 'PUT_YOUR_APPS_SCRIPT_EXEC_URL_HERE';
const ADMIN_PASSWORD = '1234';

const $ = id => document.getElementById(id);

let currentUser = '';
let usersCache = [];
let pointsCache = [];
let logsCache = [];
let codeReader = null;
let scanning = false;
let busy = false;

function api(action, params = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = 'jsonp_' + Date.now() + '_' + Math.floor(Math.random() * 100000);

    const query = new URLSearchParams({
      action,
      callback: callbackName,
      ...params
    });

    const script = document.createElement('script');
    script.src = API_URL + '?' + query.toString();

    window[callbackName] = data => {
      resolve(data);
      delete window[callbackName];
      script.remove();
    };

    script.onerror = () => {
      delete window[callbackName];
      script.remove();
      reject(new Error('เชื่อมต่อ API ไม่สำเร็จ'));
    };

    document.body.appendChild(script);
  });
}

async function loadUsers() {
  const select = $('loginUser');

  try {
    usersCache = await api('getUsers');

    select.innerHTML = '<option value="">— เลือกชื่อ —</option>';

    usersCache.forEach(user => {
      const opt = document.createElement('option');
      opt.value = user.username;
      opt.textContent = `${user.username} (${user.role || '-'})`;
      select.appendChild(opt);
    });

  } catch (err) {
    select.innerHTML = '<option value="">โหลดรายชื่อไม่สำเร็จ</option>';
    $('loginMsg').textContent = err.message;
  }
}

async function loadPoints() {
  pointsCache = await api('getPoints');
}

async function loadLogs() {
  logsCache = await api('getLogs');
}

async function loadScanStatus() {
  return await api('getScanStatus', {
    username: currentUser
  });
}

async function enterAppWithUser(username) {
  currentUser = username;
  localStorage.setItem('checkpoint_user', username);

  $('lockedUserPill').textContent = username;
  $('loginCard').classList.add('hidden');
  $('app').classList.remove('hidden');

  await refreshAll();
}

async function refreshAll() {
  try {
    await loadPoints();
    await loadLogs();
    await renderStatus();

    if (!$('adminPanel').classList.contains('hidden')) {
      await renderAdmin();
    }
  } catch (err) {
    showResult('โหลดข้อมูลไม่สำเร็จ: ' + err.message);
  }
}

async function renderStatus() {
  const scanned = await loadScanStatus();

  let html = `
    <tr>
      <th>จุด</th>
      <th>สถานะ</th>
    </tr>
  `;

  pointsCache.forEach(point => {
    const ok = scanned[point.id] === true;

    html += `
      <tr>
        <td>${escapeHtml(point.name)}</td>
        <td class="${ok ? 'done' : 'not'}">
          ${ok ? '✔ สแกนแล้ว' : '✖ ยังไม่สแกน'}
        </td>
      </tr>
    `;
  });

  $('statusTable').innerHTML = html;
}

async function saveScan(barcode) {
  if (busy) return;

  busy = true;

  const code = String(barcode || '').trim();

  if (!currentUser) {
    showResult('❌ ไม่พบผู้ใช้งาน');
    busy = false;
    return;
  }

  if (!code) {
    showResult('❌ กรุณาใส่ Barcode');
    busy = false;
    return;
  }

  showResult('กำลังบันทึก... ' + code);

  try {
    const res = await api('saveScan', {
      username: currentUser,
      barcode: code
    });

    if (res.status === 'success') {
      showResult('✅ บันทึกแล้ว: ' + res.point);
      $('manualBarcode').value = '';
    } else if (res.status === 'duplicate') {
      showResult('⚠️ จุดนี้สแกนแล้ว: ' + res.point);
    } else {
      showResult('❌ ' + res.message);
    }

    await refreshAll();

  } catch (err) {
    showResult('❌ บันทึกไม่สำเร็จ: ' + err.message);
  }

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

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showResult('❌ Browser นี้ไม่รองรับกล้อง');
    return;
  }

  codeReader = new ZXing.BrowserMultiFormatReader();

  scanning = true;
  $('startBtn').disabled = true;
  $('stopBtn').disabled = false;
  $('status').textContent = '📷 กำลังสแกน...';

  try {
    await codeReader.decodeFromVideoDevice(null, 'preview', result => {
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

async function renderAdmin() {
  await loadUsers();
  await loadPoints();
  await loadLogs();

  $('usersTable').innerHTML = `
    <tr>
      <th>Username</th>
      <th>Name</th>
      <th>Role</th>
      <th>Action</th>
    </tr>
    ${usersCache.map(u => `
      <tr>
        <td>${escapeHtml(u.username)}</td>
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.role)}</td>
        <td>
          <button class="small-btn" onclick="editUser('${escapeAttr(u.username)}')">แก้ไข</button>
          <button class="small-btn danger" onclick="deleteUser('${escapeAttr(u.username)}')">ลบ</button>
        </td>
      </tr>
    `).join('')}
  `;

  $('pointsTable').innerHTML = `
    <tr>
      <th>ID</th>
      <th>Name</th>
      <th>Barcode</th>
      <th>Action</th>
    </tr>
    ${pointsCache.map(p => `
      <tr>
        <td>${escapeHtml(p.id)}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.barcode)}</td>
        <td>
          <button class="small-btn" onclick="editPoint('${escapeAttr(p.id)}')">แก้ไข</button>
          <button class="small-btn danger" onclick="deletePoint('${escapeAttr(p.id)}')">ลบ</button>
        </td>
      </tr>
    `).join('')}
  `;

  $('logsTable').innerHTML = `
    <tr>
      <th>Date</th>
      <th>Time</th>
      <th>User</th>
      <th>Point</th>
      <th>Barcode</th>
      <th>Status</th>
    </tr>
    ${logsCache.map(l => `
      <tr>
        <td>${escapeHtml(l.workDate)}</td>
        <td>${escapeHtml(l.timestamp)}</td>
        <td>${escapeHtml(l.username)}</td>
        <td>${escapeHtml(l.pointName)}</td>
        <td>${escapeHtml(l.barcode)}</td>
        <td>${escapeHtml(l.status)}</td>
      </tr>
    `).join('')}
  `;
}

function editUser(username) {
  const user = usersCache.find(u => u.username === username);
  if (!user) return;

  $('adminUsername').value = user.username;
  $('adminName').value = user.name;
  $('adminRole').value = user.role;
}

async function deleteUser(username) {
  if (!confirm('ลบ user นี้?')) return;

  const res = await api('deleteUser', { username });
  alert(res.message || 'สำเร็จ');

  if (currentUser === username) {
    localStorage.removeItem('checkpoint_user');
    location.reload();
    return;
  }

  await renderAdmin();
}

function editPoint(id) {
  const point = pointsCache.find(p => p.id === id);
  if (!point) return;

  $('adminPointId').value = point.id;
  $('adminPointName').value = point.name;
  $('adminBarcode').value = point.barcode;
}

async function deletePoint(id) {
  if (!confirm('ลบ point นี้?')) return;

  const res = await api('deletePoint', { id });
  alert(res.message || 'สำเร็จ');

  await refreshAll();
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return String(value || '')
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'");
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadUsers();

  $('confirmUserBtn').addEventListener('click', async () => {
    const username = $('loginUser').value;

    if (!username) {
      $('loginMsg').textContent = 'กรุณาเลือกผู้ใช้งาน';
      return;
    }

    await enterAppWithUser(username);
  });

  $('changeUserBtn').addEventListener('click', () => {
    stopScan();
    localStorage.removeItem('checkpoint_user');

    $('app').classList.add('hidden');
    $('loginCard').classList.remove('hidden');
    $('adminPanel').classList.add('hidden');
  });

  $('adminBtn').addEventListener('click', async () => {
    const panel = $('adminPanel');

    if (!panel.classList.contains('hidden')) {
      panel.classList.add('hidden');
      return;
    }

    const password = prompt('กรุณาใส่รหัส Admin');

    if (password !== ADMIN_PASSWORD) {
      alert('รหัสไม่ถูกต้อง');
      return;
    }

    panel.classList.remove('hidden');
    await renderAdmin();
  });

  $('saveUserBtn').addEventListener('click', async () => {
    const username = $('adminUsername').value.trim();
    const name = $('adminName').value.trim();
    const role = $('adminRole').value.trim() || 'staff';

    if (!username) {
      alert('กรุณาใส่ username');
      return;
    }

    const payload = encodeURIComponent(JSON.stringify({
      username,
      name,
      role
    }));

    const res = await api('saveUser', { payload });
    alert(res.message || 'สำเร็จ');

    $('adminUsername').value = '';
    $('adminName').value = '';
    $('adminRole').value = '';

    await renderAdmin();
  });

  $('savePointBtn').addEventListener('click', async () => {
    const id = $('adminPointId').value.trim();
    const name = $('adminPointName').value.trim();
    const barcode = $('adminBarcode').value.trim();

    if (!id) {
      alert('กรุณาใส่ point id');
      return;
    }

    if (!barcode) {
      alert('กรุณาใส่ barcode');
      return;
    }

    const payload = encodeURIComponent(JSON.stringify({
      id,
      name,
      barcode
    }));

    const res = await api('savePoint', { payload });
    alert(res.message || 'สำเร็จ');

    $('adminPointId').value = '';
    $('adminPointName').value = '';
    $('adminBarcode').value = '';

    await refreshAll();
  });

  $('clearLogsBtn').addEventListener('click', async () => {
    if (!confirm('ลบ Logs ทั้งหมด?')) return;

    const res = await api('clearLogs');
    alert(res.message || 'สำเร็จ');

    await refreshAll();
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
    await enterAppWithUser(savedUser);
  }
});
