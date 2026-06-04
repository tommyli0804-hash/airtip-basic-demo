/**
 * 全局设置存储
 *
 * 管理映射相关参数，持久化到 localStorage，支持订阅变更。
 * 各模块通过 get(key) 读取，UI 通过 set(key, value) 修改。
 */

// v2：固化一批调好的默认值（手部尺寸/行程/告警阈/物体大小等），弃旧缓存使其对所有访客生效
const STORAGE_KEY = 'pneumatic-actuator-settings-v2';

// 默认值
const DEFAULTS = {
  leapScale: 0.02,
  // 手部尺寸缩放（mm→world），独立于 leapScale（后者只管掌心位移增益）。
  // 关节位置 = 掌心世界坐标 + (关节−掌心) × leapHandScale
  leapHandScale: 0.006,
  leapNeutralY: 200,
  worldHandY: 0.6,
  maxActuatorTravel: 0.2,
  nearThreshold: 0.02,
  // 轴向反转（三轴独立），默认皆 false
  // Leap 原生：+X 右、+Y 上、+Z 朝用户；Three.js 同向。若摆法不同或镜像感不对，逐项勾选
  leapFlipX: false,
  leapFlipY: false,
  leapFlipZ: false,
  // 穿模告警阈值（m）：指尖穿入 gap 逾此即发高低频告警脉冲（预警，先于失效）
  warnThreshold: 0.2,
  // 告警阈是否随物体大小缩放：关=绝对距离（合气囊固定行程）；开=阈×objectScale
  warnScaleWithObject: true,
  // 重力加速度（m/s²），0 为禁用
  gravity: 9.8,
  // 可交互物体统一缩放系数（1 = 原始大小）
  objectScale: 1.2,
  // 气压输出范围映射：把内部 0~255 重映射到阀门实际可用区间
  // 0 输出（无接触）始终保持 0（阀门关闭），非零值线性映射到 [min, max]
  pressureOutMin: 0,
  pressureOutMax: 255,
};

// UI 元数据：标签、范围、步长、单位
// type: 'number'（默认，滑块+输入）或 'bool'（复选框）
export const SETTING_META = {
  leapScale: {
    type: 'number',
    label: 'Leap 灵敏度',
    min: 0.005, max: 0.1, step: 0.001,
    desc: '掌心位移增益：真实位移→虚拟位移比例。值越大手移动越快（不影响手大小）',
  },
  leapHandScale: {
    type: 'number',
    label: 'Leap 手部尺寸',
    min: 0.0005, max: 0.015, step: 0.0001,
    desc: '虚拟手的大小（mm→世界）。手显得过大就调小，与位移增益独立',
  },
  leapNeutralY: {
    type: 'number',
    label: 'Leap 中性高度',
    min: 50, max: 400, step: 10,
    unit: 'mm',
    desc: '真实手悬停的舒适高度（mm），用于映射到世界 Y',
  },
  worldHandY: {
    type: 'number',
    label: '虚拟手初始高度',
    min: 0, max: 2, step: 0.05,
    unit: 'm',
    desc: '虚拟世界中手的中性 Y 坐标',
  },
  maxActuatorTravel: {
    type: 'number',
    label: '执行器最大行程',
    min: 0.02, max: 0.2, step: 0.005,
    unit: 'm',
    desc: '气囊最大压缩行程，超出即超行程失效',
  },
  nearThreshold: {
    type: 'number',
    label: '近场感应距离',
    min: 0.01, max: 0.1, step: 0.005,
    unit: 'm',
    desc: '未穿入但接近物体时的轻触反馈范围',
  },
  leapFlipX: {
    type: 'bool',
    label: '反转 X 轴',
    desc: '左右镜像。若向左挥手虚拟手向右则勾选',
  },
  leapFlipY: {
    type: 'bool',
    label: '反转 Y 轴',
    desc: '上下镜像。通常不需要',
  },
  leapFlipZ: {
    type: 'bool',
    label: '反转 Z 轴',
    desc: '前后镜像。若向前推手虚拟手后退则勾选',
  },
  warnThreshold: {
    type: 'number',
    label: '穿模告警阈值',
    min: 0.01, max: 0.2, step: 0.005,
    unit: 'm',
    desc: '指尖穿入深度逾此即发高低频告警脉冲（预警，先于超行程失效）',
  },
  warnScaleWithObject: {
    type: 'bool',
    label: '告警阈随物体缩放',
    desc: '关：绝对距离（合气囊固定行程）；开：阈值 × 物体大小，大物可陷更深方告警',
  },
  gravity: {
    type: 'number',
    label: '重力加速度',
    min: 0, max: 20, step: 0.1,
    unit: 'm/s²',
    desc: '物体下落加速度。0 则无重力',
  },
  objectScale: {
    type: 'number',
    label: '物体大小',
    min: 0.3, max: 3, step: 0.05,
    unit: '×',
    desc: '可交互物体统一缩放系数，碰撞与物理同步',
  },
  pressureOutMin: {
    type: 'number',
    label: '输出下限',
    min: 0, max: 255, step: 1,
    desc: '阀门可用范围下限。非零气压映射的起点（如阀门死区补偿）',
  },
  pressureOutMax: {
    type: 'number',
    label: '输出上限',
    min: 0, max: 255, step: 1,
    desc: '阀门可用范围上限。满压气压映射的终点',
  },
};

export const KEYS = Object.keys(DEFAULTS);

let current = { ...DEFAULTS };
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const key of KEYS) {
        const meta = SETTING_META[key];
        const v = parsed[key];
        if (meta?.type === 'bool') {
          if (typeof v === 'boolean') current[key] = v;
        } else {
          if (typeof v === 'number' && !Number.isNaN(v)) current[key] = v;
        }
      }
    }
  } catch (e) {
    console.warn('设置加载失败，使用默认值:', e);
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch (e) {
    console.warn('设置保存失败:', e);
  }
}

export function get(key) {
  return current[key];
}

export function set(key, value) {
  if (!(key in DEFAULTS)) return;
  current[key] = value;
  save();
  listeners.forEach((fn) => fn(key, value));
}

export function getAll() {
  return { ...current };
}

export function reset() {
  current = { ...DEFAULTS };
  save();
  listeners.forEach((fn) => fn(null, null));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getDefault(key) {
  return DEFAULTS[key];
}

load();
