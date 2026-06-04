import { createScene } from './scene.js';
import { createMockSerial, createWebSerial } from './serial.js';
import {
  createOutputFrame,
  createAllOffFrame,
  estimateVoltageAndPressure,
  TOTAL_CHANNELS,
} from './basic-control.js';
import { CHANNELS, FINGER_NAMES, PART_NAMES } from './channel-map.js';

// -----------------------------------------------------------------------------
// AirTip Basic Demo
// -----------------------------------------------------------------------------
// 这个文件保留原 Demo 的界面组织方式：
// 1. 场景初始化
// 2. 输入状态显示
// 3. 串口连接
// 4. 5×3 气压面板
// 5. 基础几何体触发与电压—气压映射
//
// 但本版本只用于基础链路演示，不包含完整 Leap Motion、手部骨骼、碰撞检测、
// 方向性触觉映射、抓取保持、物理抛掷和康复任务状态机。
// -----------------------------------------------------------------------------

// --- 初始化基础场景 ---
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const demoScene = createScene(canvas);

// --- 初始化输入状态：保留原 HUD，但降级为基础演示模式 ---
const leapDot = document.getElementById('leap-dot');
const leapLabel = document.getElementById('leap-status');
if (leapDot && leapLabel) {
  leapDot.className = 'dot error';
  leapLabel.textContent = 'Leap Motion: 基础演示模式';
}

// --- 初始化串口（默认 Mock） ---
let serial = createMockSerial();

const serialDot = document.getElementById('serial-dot');
const serialLabel = document.getElementById('serial-status');
const serialBtn = document.getElementById('serial-btn');

serialBtn?.addEventListener('click', async () => {
  if (!('serial' in navigator)) {
    alert('当前浏览器不支持 WebSerial，请使用 Chrome / Edge');
    return;
  }

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
  }
});

// --- 三视图按钮：保留原 UI 入口，但基础版只做状态切换 ---
const viewsBtn = document.getElementById('views-btn');
viewsBtn?.addEventListener('click', () => {
  const on = demoScene.toggleViews();
  viewsBtn.textContent = on ? '单视图' : '三视图';
  viewsBtn.classList.toggle('active', on);
});

// --- 构建 5×3 气压面板 ---
const grid = document.getElementById('pressure-grid');
const barEls = [];
const valEls = [];

if (grid) {
  for (let f = 0; f < FINGER_NAMES.length; f++) {
    const row = document.createElement('div');
    row.className = 'finger-row';

    const label = document.createElement('span');
    label.className = 'finger-label';
    label.textContent = FINGER_NAMES[f];
    row.appendChild(label);

    for (let p = 0; p < PART_NAMES.length; p++) {
      const idx = f * PART_NAMES.length + p;
      const channel = CHANNELS[idx];

      const cell = document.createElement('div');
      cell.className = `pocket-cell ${channel.className}`;
      cell.title = `${channel.finger}-${channel.part}`;

      const bar = document.createElement('div');
      bar.className = 'bar';

      const fill = document.createElement('div');
      fill.className = 'bar-fill';
      fill.id = `bar-${idx}`;
      bar.appendChild(fill);

      const val = document.createElement('span');
      val.className = 'val';
      val.id = `val-${idx}`;
      val.textContent = '0';

      cell.appendChild(bar);
      cell.appendChild(val);
      row.appendChild(cell);

      barEls[idx] = fill;
      valEls[idx] = val;
    }

    grid.appendChild(row);
  }
}

function updatePressureUI(pressures) {
  for (let i = 0; i < TOTAL_CHANNELS; i++) {
    const value = pressures[i] || 0;
    const pct = (value / 255) * 100;

    if (barEls[i]) barEls[i].style.width = `${pct}%`;
    if (valEls[i]) valEls[i].textContent = String(value);
  }
}

// --- 基础控制面板 ---
const objectSelect = document.getElementById('object-select');
const channelSelect = document.getElementById('channel-select');
const intensitySlider = document.getElementById('intensity-slider');
const intensityLabel = document.getElementById('intensity-label');
const sendBtn = document.getElementById('send-btn');
const resetBtn = document.getElementById('reset-btn');

const mapValue = document.getElementById('map-value');
const mapVoltage = document.getElementById('map-voltage');
const mapPressure = document.getElementById('map-pressure');

CHANNELS.forEach((channel) => {
  const option = document.createElement('option');
  option.value = channel.id;
  option.textContent = `${channel.id} ${channel.finger}-${channel.part}`;
  channelSelect?.appendChild(option);
});

function applyObjectPreset() {
  if (!objectSelect || !intensitySlider) return;

  const objectId = objectSelect.value;

  // 基础版本：不同几何体仅对应不同默认输出强度。
  // 这不是完整材质/接触算法，只是用于演示通道可输出。
  if (objectId === 'sphere') intensitySlider.value = '90';
  if (objectId === 'box') intensitySlider.value = '160';
  if (objectId === 'cylinder') intensitySlider.value = '120';

  demoScene.setActiveObject(objectId);
  updateMappingDisplay();
}

function updateMappingDisplay() {
  if (!intensitySlider) return;

  const intensity = Number(intensitySlider.value);
  const { voltage, pressure } = estimateVoltageAndPressure(intensity);

  if (intensityLabel) intensityLabel.textContent = String(intensity);
  if (mapValue) mapValue.textContent = String(intensity);
  if (mapVoltage) mapVoltage.textContent = voltage.toFixed(2);
  if (mapPressure) mapPressure.textContent = pressure.toFixed(1);
}

objectSelect?.addEventListener('change', applyObjectPreset);
intensitySlider?.addEventListener('input', updateMappingDisplay);

sendBtn?.addEventListener('click', async () => {
  const channelId = Number(channelSelect?.value || 0);
  const intensity = Number(intensitySlider?.value || 0);

  const frame = createOutputFrame(channelId, intensity);
  await serial.send(frame);

  updatePressureUI(frame);
  updateMappingDisplay();
});

resetBtn?.addEventListener('click', async () => {
  const frame = createAllOffFrame();
  await serial.send(frame);

  if (intensitySlider) intensitySlider.value = '0';
  updatePressureUI(frame);
  updateMappingDisplay();
});

// --- 基础循环：只渲染几何体，不运行完整交互算法 ---
function loop() {
  requestAnimationFrame(loop);
  demoScene.render();
}

applyObjectPreset();
updatePressureUI(createAllOffFrame());
loop();
