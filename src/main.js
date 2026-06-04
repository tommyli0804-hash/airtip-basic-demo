import { createScene } from './scene.js';
import { createHandModel } from './hand.js';
import { createLeapTracker } from './leap.js';
import { createMouseMock } from './mouse-mock.js';
import { createInteraction, FINGER_COUNT, POCKETS_PER_FINGER } from './interaction.js';
import { createMockSerial, createWebSerial } from './serial.js';

// --- 初始化 Three.js 场景 ---
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const { renderer, scene, camera, objects, orbit } = createScene(canvas);

// --- 初始化双手模型 ---
// ghost = 半透明，显示原始输入位置
// solid = 实体，显示约束后位置（被物体挡住）
const ghostHand = createHandModel(scene, 'ghost');
const solidHand = createHandModel(scene, 'solid');

// --- 初始化输入源 ---
const leapDot = document.getElementById('leap-dot');
const leapLabel = document.getElementById('leap-status');

let leapConnected = false;

const leap = createLeapTracker((connected) => {
  leapConnected = connected;
  leapDot.className = connected ? 'dot connected' : 'dot error';
  leapLabel.textContent = connected
    ? 'Leap Motion: 已连接'
    : 'Leap Motion: 断开（Gumball 模拟中）';
});

const mouseMock = createMouseMock(camera, solidHand, renderer, scene);
leapLabel.textContent = 'Leap Motion: 未连接（Gumball 模拟中）';

// --- 初始化交互计算 ---
const interaction = createInteraction(objects);

// --- 初始化串口（默认 Mock） ---
let serial = createMockSerial();

const serialDot = document.getElementById('serial-dot');
const serialLabel = document.getElementById('serial-status');
const serialBtn = document.getElementById('serial-btn');

serialBtn.addEventListener('click', async () => {
  if (!('serial' in navigator)) {
    alert('当前浏览器不支持 WebSerial，请使用 Chrome');
    return;
  }
  try {
    const ws = createWebSerial();
    await ws.connect();
    serial = ws;
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

// --- 构建 5×5 气压面板 ---
const FINGER_NAMES = ['拇', '食', '中', '环', '小'];
const POCKET_CLASSES = ['pocket-tip', 'pocket-pad', 'pocket-dorsal', 'pocket-radial', 'pocket-ulnar'];

const grid = document.getElementById('pressure-grid');
const barEls = [];
const valEls = [];

for (let f = 0; f < FINGER_COUNT; f++) {
  const row = document.createElement('div');
  row.className = 'finger-row';

  const label = document.createElement('span');
  label.className = 'finger-label';
  label.textContent = FINGER_NAMES[f];
  row.appendChild(label);

  for (let p = 0; p < POCKETS_PER_FINGER; p++) {
    const idx = f * POCKETS_PER_FINGER + p;

    const cell = document.createElement('div');
    cell.className = `pocket-cell ${POCKET_CLASSES[p]}`;

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

function updatePressureUI(pressures) {
  for (let i = 0; i < pressures.length; i++) {
    const pct = (pressures[i] / 255) * 100;
    barEls[i].style.width = `${pct}%`;
    valEls[i].textContent = pressures[i];
  }
}

// --- 主循环 ---
function loop() {
  requestAnimationFrame(loop);

  orbit.enabled = !mouseMock.isDragging();
  orbit.update();

  const input = leapConnected ? leap.getState() : mouseMock.getState();

  // 计算碰撞约束 + 气压
  const pressures = interaction.update(input);
  const constrainedTips = interaction.getConstrainedTips();
  const exceeded = interaction.getExceeded();

  // ghost 手 = 原始输入位置（半透明）
  ghostHand.update(input.hand);

  // solid 手 = 约束后位置（被物体弹回）
  if (input.hand) {
    solidHand.update({
      palm: input.hand.palm,
      fingers: constrainedTips.map((t) => t.clone()),
    }, exceeded);
  } else {
    solidHand.update(null);
  }

  serial.send(pressures);
  updatePressureUI(pressures);

  renderer.render(scene, camera);
}

loop();
