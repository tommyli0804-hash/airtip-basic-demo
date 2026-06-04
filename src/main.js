import { createScene } from './scene.js';
import { createHandModel } from './hand.js';
import { createLeapTracker } from './leap.js';
import { createMouseMock } from './mouse-mock.js';
import {
  createInteraction,
  FINGER_COUNT,
  POCKETS_PER_FINGER,
  TOTAL_CHANNELS,
  POCKET_KEYS,
  POCKET_LABELS,
} from './interaction.js';
import { createPhysics } from './physics.js';
import { createMockSerial, createWebSerial } from './serial.js';
import { createSettingsPanel } from './settings-ui.js';
import { createViews } from './views.js';
import * as settings from './settings.js';

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

// --- 初始化交互计算与物理 ---
const interaction = createInteraction(objects);
const physics = createPhysics(objects);

// --- 三视图 ---
const views = createViews(scene, camera, renderer);
const viewsBtn = document.getElementById('views-btn');
viewsBtn?.addEventListener('click', () => {
  const on = views.toggle();
  viewsBtn.textContent = on ? '单视图' : '三视图';
  viewsBtn.classList.toggle('active', on);
  // 三视图模式下由 views.handleWheel 接管缩放（按象限分发），
  // 关闭 OrbitControls 自带滚轮缩放，避免主相机被重复推拉。
  orbit.enableZoom = !on;
});

// 滚轮缩放：三视图时按光标所在象限分别缩放；单视图交回 OrbitControls
window.addEventListener('wheel', (e) => {
  if (views.handleWheel(e)) e.preventDefault();
}, { passive: false });

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

// --- 设置面板（滑块控制映射参数） ---
createSettingsPanel(document.body);

// --- 构建 5×3 气压面板 ---
const FINGER_NAMES = ['拇', '食', '中', '环', '小'];
const POCKET_CLASSES = ['pocket-pad', 'pocket-radial', 'pocket-ulnar'];

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
    cell.title = `${FINGER_NAMES[f]}指 ${POCKET_LABELS[p]} (${POCKET_KEYS[p]})`;

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

// 气压输出范围映射：把内部 0~255 重映射到阀门可用区间 [min, max]。
// 0（无接触）保持为 0，使阀门完全关闭；非零值线性映射。
// 仅作用于自动模式；手动调试模式直接输出滑条原值，便于标定硬件。
const mappedPressures = new Uint8Array(TOTAL_CHANNELS);
function mapOutputRange(src) {
  let lo = settings.get('pressureOutMin');
  let hi = settings.get('pressureOutMax');
  if (hi < lo) [lo, hi] = [hi, lo];
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    mappedPressures[i] = v <= 0 ? 0 : Math.max(0, Math.min(255, Math.round(lo + (v / 255) * (hi - lo))));
  }
  return mappedPressures;
}

// --- 主循环 ---
function loop() {
  requestAnimationFrame(loop);

  orbit.enabled = !mouseMock.isDragging();
  orbit.update();

  // 每帧应用物体缩放（碰撞与物理读取 mesh.scale，须先于二者设置）
  const objScale = settings.get('objectScale');
  for (const obj of objects) obj.scale.setScalar(objScale);

  const input = leapConnected ? leap.getState() : mouseMock.getState();

  // 先处理物理（抓取、重力）— 可能移动物体
  physics.update(input);

  // 再算碰撞约束 + 自动气压（已握持之物会被跳过）
  // 即使开启手动模式，仍然计算 interaction，用于保持视觉约束和物体反馈正常。
  const autoPressures = interaction.update(input);
  const constrainedTips = interaction.getConstrainedTips();
  const exceeded = interaction.getExceeded();

  // 经输出范围映射后发往硬件
  const pressures = mapOutputRange(autoPressures);

  // ghost 手 = 原始输入位置（半透明）
  ghostHand.update(input.hand);

  // solid 手 = 约束后位置（仅 tip 被弹回，mcp/pip/dip 保持输入位置）
  if (input.hand) {
    solidHand.update({
      palm: input.hand.palm,
      fingers: input.hand.fingers.map((f, i) => ({
        mcp: f.mcp,
        pip: f.pip,
        dip: f.dip,
        tip: constrainedTips[i].clone(),
      })),
    }, exceeded);
  } else {
    solidHand.update(null);
  }

  serial.send(pressures);
  updatePressureUI(pressures);

  views.render();
}

loop();
