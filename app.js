const DEFAULT_USERS = [
  { username: 'admin', name: 'ผู้ดูแลระบบ', role: 'admin' },
  { username: 'user1', name: 'พนักงาน 1', role: 'staff' },
  { username: 'user2', name: 'พนักงาน 2', role: 'staff' }
];

const DEFAULT_POINTS = [
  { id: 'P001', name: 'จุดตรวจ 1', barcode: 'P001' },
  { id: 'P002', name: 'จุดตรวจ 2', barcode: 'P002' },
  { id: 'P003', name: 'จุดตรวจ 3', barcode: 'P003' }
];

const $ = id => document.getElementById(id);

let codeReader = null;
let scanning = false;
let busy = false;
let currentUser = '';

function getUsersData() {
  const data = localStorage.getItem('checkpoint_users');

  if (!data) {
    localStorage.setItem('checkpoint_users', JSON.stringify(DEFAULT_USERS));
    return DEFAULT_USERS;
  }

  return JSON.parse(data);
}

function saveUsersData(users) {
  localStorage.setItem('checkpoint_users', JSON.stringify(users));
}

function getPointsData() {
  const data = localStorage.getItem('checkpoint_points');

  if (!data) {
    localStorage.setItem('checkpoint_points', JSON.stringify(DEFAULT_POINTS));
    return DEFAULT_POINTS;
  }

  return JSON.parse(data);
}

function savePointsData(points) {
  localStorage.setItem('checkpoint_points', JSON.stringify(points));
}

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
  const users = getUsersData();

  select.innerHTML = '<option value="">— เลือกชื่อ —</option>';

  users.forEach(user => {
    const opt = document.createElement('option');
    opt.value = user.username;
    opt.textContent = `${user.username} (${user.role})`;
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
  const points = getPointsData();
  const scanned = getScanStatus(currentUser);

  let html = `
    <tr>
      <th>จุด</th>
      <th>สถานะ</th>
    </tr>
  `;

  points.forEach(point => {
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
  const points = getPointsData();
  const point = points.find(p => p.barcode === code);

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
    barcode: point.barcode,
    status: 'scanned'
  });

  saveLogs(logs);

  showResult('✅ บันทึกแล้ว: ' + point.name);
  $('manualBarcode').value = '';

  renderStatus();
  renderAdmin();

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
    if (codeReader) {
      codeReader.reset();
    }
  } catch (e) {}

  scanning = false;
  $('startBtn').disabled = false;
  $('stopBtn').disabled = true;
  $('status').textContent = 'หยุดสแกน';
}

function renderAdmin() {
  if (!$('adminPanel')) return;

  const users = getUsersData();
  const points = getPointsData();
  const logs = getLogs();

  $('usersTable').innerHTML = `
    <tr>
      <th>Username</th>
      <th>Name</th>
      <th>Role</th>
      <th>Action</th>
    </tr>
    ${users.map(u => `
      <tr>
        <td>${u.username}</td>
        <td>${u.name}</td>
        <td>${u.role}</td>
        <td>
          <button class="small-btn" onclick="editUser('${u.username}')">แก้ไข</button>
          <button class="small-btn danger" onclick="deleteUser('${u.username}')">ลบ</button>
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
    ${points.map(p => `
      <tr>
        <td>${p.id}</td>
        <td>${p.name}</td>
        <td>${p.barcode}</td>
        <td>
          <button class="small-btn" onclick="editPoint('${p.id}')">แก้ไข</button>
          <button class="small-btn danger" onclick="deletePoint('${p.id}')">ลบ</button>
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
    ${logs.map(l => `
      <tr>
        <td>${l.workDate}</td>
        <td>${l.timestamp}</td>
        <td>${l.username}</td>
        <td>${l.pointName}</td>
        <td>${l.barcode || ''}</td>
        <td>${l.status}</td>
      </tr>
    `).join('')}
  `;
}

function editUser(username) {
  const user = getUsersData().find(u => u.username === username);
  if (!user) return;

  $('adminUsername').value = user.username;
  $('adminName').value = user.name;
  $('adminRole').value = user.role;
}

function deleteUser(username) {
  if (!confirm('ลบ user นี้?')) return;

  const users = getUsersData().filter(u => u.username !== username);
  saveUsersData(users);

  if (currentUser === username) {
    localStorage.removeItem('checkpoint_user');
    location.reload();
    return;
  }

  loadUsers();
  renderAdmin();
}

function editPoint(id) {
  const point = getPointsData().find(p => p.id === id);
  if (!point) return;

  $('adminPointId').value = point.id;
  $('adminPointName').value = point.name;
  $('adminBarcode').value = point.barcode;
}

function deletePoint(id) {
  if (!confirm('ลบ point นี้?')) return;

  const points = getPointsData().filter(p => p.id !== id);
  savePointsData(points);

  renderStatus();
  renderAdmin();
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
    $('adminPanel').classList.add('hidden');
  });

  $('adminBtn').addEventListener('click', () => {
    $('adminPanel').classList.toggle('hidden');
    renderAdmin();
  });

  $('saveUserBtn').addEventListener('click', () => {
    const username = $('adminUsername').value.trim();
    const name = $('adminName').value.trim();
    const role = $('adminRole').value.trim() || 'staff';

    if (!username) {
      alert('กรุณาใส่ username');
      return;
    }

    let users = getUsersData();
    users = users.filter(u => u.username !== username);
    users.push({ username, name, role });

    saveUsersData(users);
    loadUsers();
    renderAdmin();

    $('adminUsername').value = '';
    $('adminName').value = '';
    $('adminRole').value = '';
  });

  $('savePointBtn').addEventListener('click', () => {
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

    let points = getPointsData();
    points = points.filter(p => p.id !== id);
    points.push({ id, name, barcode });

    savePointsData(points);
    renderStatus();
    renderAdmin();

    $('adminPointId').value = '';
    $('adminPointName').value = '';
    $('adminBarcode').value = '';
  });

  $('clearLogsBtn').addEventListener('click', () => {
    if (!confirm('ลบ Logs ทั้งหมด?')) return;

    localStorage.removeItem('checkpoint_logs');

    renderStatus();
    renderAdmin();
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
