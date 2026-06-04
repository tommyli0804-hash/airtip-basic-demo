import { createBasicScene } from './scene.js';
import { createMockSerial, createWebSerial } from './serial.js';
import { createOutputFrame, createAllOffFrame, estimateVoltageAndPressure } from './basic-control.js';
import { CHANNELS, FINGER_NAMES, PART_NAMES } from './channel-map.js';

// --- 基础场景 ---
createBasicScene();

// --- 状态 ---
const leapDot = document.getElementById('leap-dot');
const leapLabel = document.getElementById('leap-status');
leapDot.className = 'dot error';
leapLabel.textContent = 'Leap Motion: 基础演示模式';

const serialDot = document.getElementById('serial-dot');
const serialLabel = document.getElementById('serial-status');
const serialBtn = document.getElementById('serial-btn');

let serial = createMockSerial();

// --- 串口连接 ---
serialBtn.addEventListener('click', async () => {
  try {
    const webSerial = createWebSerial();
    await webSerial.connect();
    serial = webSerial;
    serialDot.className = 'dot connected';
    serialLabel.textContent = 'Serial: 已连接';
    serialBtn.textContent = '已连接';
    serialBtn.disabled = true;
  } catch (e) {
    console.warn('串口连接失败:', e);
    serialDot.className = 'dot error';
    serialLabel.textContent = 'Serial: 连接失败';
    alert(e.message || '串口连接失败，请确认使用 Chrome/Edge 并连接开发板');
  }
});

// --- 三视图按钮：保留 UI，不启用复杂三视图算法 ---
const viewsBtn = document.getElementById('views-btn');
viewsBtn.addEventListener('click', () => {
  viewsBtn.classList.toggle('active');
});

// --- 构建 5×3 气压面板 ---
const grid = document.getElementById('pressure-grid');
const barEls = [];
const valEls = [];

for (let f = 0; f < FINGER_NAMES.length; f++) {
  const row = document.createElement('div');
  row.className = 'finger-row';

  const label = document.createElement('span');
  label.className = 'finger-label';
  label.textContent = FINGER_NAMES[f];
  row.appendChild(label);

  for (let p = 0; p < PART_NAMES.length; p++) {
    const idx = f * PART_NAMES.length + p;
    const ch = CHANNELS[idx];

    const cell = document.createElement('div');
    cell.className = `pocket-cell ${ch.className}`;
    cell.title = `${ch.finger}-${ch.part}`;

    const bar = document.createElement('div');
    bar.className = 'bar';

    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    bar.appendChild(fill);

    const val = document.createElement('span');
    val.className = 'val';
    val.textContent = '0';

    cell.appendChild(bar);
    cell.appendChild(val);
    row.appendChild(cell);

    barEls[idx] = fill;
    valEls[idx] = val;
  }

  grid.appendChild(row);
}

function updatePressureUI(values) {
  for (let i = 0; i < CHANNELS.length; i++) {
    const v = values[i] || 0;
    const pct = (v / 255) * 100;
    barEls[i].style.width = `${pct}%`;
    valEls[i].textContent = String(v);
  }
}

// --- 控制面板 ---
const channelSelect = document.getElementById('channel-select');
const intensitySlider = document.getElementById('intensity-slider');
const intensityLabel = document.getElementById('intensity-label');
const objectSelect = document.getElementById('object-select');
const sendBtn = document.getElementById('send-btn');
const resetBtn = document.getElementById('reset-btn');

const mapValue = document.getElementById('map-value');
const mapVoltage = document.getElementById('map-voltage');
const mapPressure = document.getElementById('map-pressure');

CHANNELS.forEach((ch) => {
  const option = document.createElement('option');
  option.value = ch.id;
  option.textContent = `${ch.id} ${ch.finger}-${ch.part}`;
  channelSelect.appendChild(option);
});

function applyObjectPreset() {
  const objectId = objectSelect.value;

  // 基础版本：不同几何体只对应不同默认强度，不做复杂物理映射
  if (objectId === 'sphere') intensitySlider.value = '90';
  if (objectId === 'box') intensitySlider.value = '160';
  if (objectId === 'cylinder') intensitySlider.value = '120';

  updateMappingDisplay();
}

function updateMappingDisplay() {
  const intensity = Number(intensitySlider.value);
  const { voltage, pressure } = estimateVoltageAndPressure(intensity);
  intensityLabel.textContent = String(intensity);
  mapValue.textContent = String(intensity);
  mapVoltage.textContent = voltage.toFixed(2);
  mapPressure.textContent = pressure.toFixed(1);
}

objectSelect.addEventListener('change', applyObjectPreset);
intensitySlider.addEventListener('input', updateMappingDisplay);

sendBtn.addEventListener('click', async () => {
  const channelId = Number(channelSelect.value);
  const intensity = Number(intensitySlider.value);
  const frame = createOutputFrame(channelId, intensity);
  await serial.send(frame);
  updatePressureUI(frame);
  updateMappingDisplay();
});

resetBtn.addEventListener('click', async () => {
  const frame = createAllOffFrame();
  await serial.send(frame);
  updatePressureUI(frame);
  intensitySlider.value = '0';
  updateMappingDisplay();
});

applyObjectPreset();
updatePressureUI(createAllOffFrame());
