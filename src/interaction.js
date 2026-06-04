import * as THREE from 'three';
import * as settings from './settings.js';

export const FINGER_COUNT = 5;
export const POCKETS_PER_FINGER = 3;
export const TOTAL_CHANNELS = FINGER_COUNT * POCKETS_PER_FINGER;

// 气囊编号（15 通道版本）：每根手指 3 个气囊
// 0 = pad / 指腹，1 = radial / 桡侧，2 = ulnar / 尺侧
export const POCKET_KEYS = ['pad', 'radial', 'ulnar'];
export const POCKET_LABELS = ['指腹', '桡侧', '尺侧'];

const STIFFNESS = { soft: 0.4, medium: 0.7, hard: 1.0 };

// 穿透警告参数：超行程时，气压不再恒定，而是高频/低频脉冲交替，
// 模拟“嗡—嗡嗡嗡—嗡”的告警手感，提示操作者已超出执行器物理行程。
const WARN_CYCLE = 1.0;   // 高低频切换周期（秒）：前半高频、后半低频
const WARN_HIGH_HZ = 13;  // 高频段脉冲频率
const WARN_LOW_HZ = 3.5;  // 低频段脉冲频率
const WARN_LOW_LEVEL = 0.35; // 脉冲低电平（不归零，保持阀门响应）

/**
 * 穿透警告包络：返回 0~1 的脉冲系数
 * 一个周期内前半段高频抖动、后半段低频抖动，形成可辨识的告警节奏
 */
function warningEnvelope(t) {
  const phase = (t % WARN_CYCLE) / WARN_CYCLE;
  const hz = phase < 0.5 ? WARN_HIGH_HZ : WARN_LOW_HZ;
  // 方波：sin 取符号，正半周满压，负半周降到低电平
  const square = Math.sin(2 * Math.PI * hz * t) >= 0 ? 1 : WARN_LOW_LEVEL;
  return square;
}

/**
 * 交互模块：碰撞约束 + 方向力映射
 *
 * 流程：
 * 1. 对每根手指检测是否穿入物体
 * 2. 穿入时，将指尖约束（spring-back）到物体表面
 * 3. 输入位置 vs 约束位置的 gap 驱动气压
 * 4. gap 投影到手指局部坐标系 3 个方向 → 3 个气囊
 * 5. gap > MAX_ACTUATOR_TRAVEL → 失效（exceeded）
 */
export function createInteraction(objects) {
  const pressures = new Uint8Array(TOTAL_CHANNELS);
  const constrainedTips = Array.from({ length: FINGER_COUNT }, () => new THREE.Vector3());
  const exceeded = new Array(FINGER_COUNT).fill(false);

  const _objPos = new THREE.Vector3();
  const _tipPos = new THREE.Vector3();
  const _palmPos = new THREE.Vector3();
  const _toTip = new THREE.Vector3();
  const _fingerDir = new THREE.Vector3();
  const _gap = new THREE.Vector3();

  function update(handState) {
    pressures.fill(0);
    exceeded.fill(false);

    if (!handState?.hand) {
      for (let i = 0; i < FINGER_COUNT; i++) constrainedTips[i].set(0, 0, 0);
      return pressures;
    }

    // 每帧从 settings 读取，支持 UI 实时调整
    const MAX_ACTUATOR_TRAVEL = settings.get('maxActuatorTravel');
    const NEAR_THRESHOLD = settings.get('nearThreshold');
    // 告警阈：绝对距离，或（开关开启时）随物体大小缩放
    const WARN_THRESHOLD = settings.get('warnScaleWithObject')
      ? settings.get('warnThreshold') * settings.get('objectScale')
      : settings.get('warnThreshold');
    const now = performance.now() / 1000; // 警告脉冲时基

    const { palm, fingers } = handState.hand;
    _palmPos.copy(palm);

    for (let fi = 0; fi < FINGER_COUNT; fi++) {
      _tipPos.copy(fingers[fi].tip);
      constrainedTips[fi].copy(_tipPos);

      // 手指方向：掌心 → 指尖
      _fingerDir.subVectors(_tipPos, _palmPos).normalize();

      // 找最深穿入的物体（包含已被握持之物，用于抓取后持续触觉反馈）
      let deepestPen = 0;
      let penObj = null;
      let penNormal = new THREE.Vector3();
      let penSurfacePoint = new THREE.Vector3();

      for (const obj of objects) {
        const result = signedDistance(_tipPos, obj);
        if (result.dist < 0 && result.dist < deepestPen) {
          deepestPen = result.dist;
          penObj = obj;
          penNormal.copy(result.normal);
          penSurfacePoint.copy(result.surface);
        }
      }

      if (!penObj) {
        // 未穿入 — 检查是否在接近范围内（保留轻触反馈）
        let minDist = Infinity;
        let nearestObj = null;
        let nearestNormal = new THREE.Vector3();

        for (const obj of objects) {
          const result = signedDistance(_tipPos, obj);
          if (result.dist < minDist) {
            minDist = result.dist;
            nearestObj = obj;
            nearestNormal.copy(result.normal);
          }
        }

        // 接近但未穿入：轻微触觉提示（近场）
        // 如果物体已经被抓取，则扩大一点保持反馈范围，避免“刚抓住就没触觉”。
        if (nearestObj) {
          const isHeld = !!nearestObj.userData.physics?.held;
          const grabStrength = handState.hand.grabStrength ?? 0;
          const threshold = isHeld ? NEAR_THRESHOLD * 3 : NEAR_THRESHOLD;

          if (minDist < threshold) {
            const stiffness = STIFFNESS[nearestObj.userData.type] ?? 0.5;
            const proximity = 1 - Math.max(0, minDist) / threshold;
            let base = proximity * stiffness * 60; // 普通近场最多约 60，轻触

            // 抓取状态下叠加一个与握力相关的保持反馈。
            // 这样物体被 physics 标记为 held 后，仍能持续输出可感知压力。
            if (isHeld && grabStrength > 0.3) {
              base = Math.max(base, grabStrength * stiffness * 100);
            }

            const offset = fi * POCKETS_PER_FINGER;
            writePocketsFromDirection(pressures, offset, _fingerDir, nearestNormal, base);
          }
        }
        continue;
      }

      // --- 穿入处理 ---

      // 约束指尖到物体表面（spring-back）
      constrainedTips[fi].copy(penSurfacePoint);

      // gap = 输入位置 - 约束位置（从约束位置指向输入位置的向量）
      _gap.subVectors(_tipPos, penSurfacePoint);
      const gapLen = _gap.length();

      // 超行程检测（→ 失效红）与穿模告警检测（→ 脉冲，独立阈值）
      exceeded[fi] = gapLen > MAX_ACTUATOR_TRAVEL;
      const warn = gapLen > WARN_THRESHOLD;

      const stiffness = STIFFNESS[penObj.userData.type] ?? 0.5;
      const isHeld = !!penObj.userData.physics?.held;
      const grabStrength = handState.hand.grabStrength ?? 0;
      // 压力与 gap 成正比，saturate 在 max travel
      const ratio = Math.min(gapLen / MAX_ACTUATOR_TRAVEL, 1.0);
      let base = ratio * stiffness * 255;

      // 抓取状态下，即使穿入量很小，也保留一部分与握力相关的持续反馈。
      // 这用于修正“物体被抓住后，触觉反馈突然归零”的问题。
      if (isHeld && grabStrength > 0.3) {
        base = Math.max(base, grabStrength * stiffness * 100);
      }

      // gap 方向投影到手指局部坐标系
      const offset = fi * POCKETS_PER_FINGER;
      const gapDir = _gap.clone().normalize();

      if (warn) {
        // 穿模告警：以高低频交替脉冲示警，3 个气囊齐鸣（覆盖方向分解）
        const pulse = clamp255(255 * warningEnvelope(now));
        pressures[offset + 0] = pulse;
        pressures[offset + 1] = pulse;
        pressures[offset + 2] = pulse;
      } else {
        writePocketsFromDirection(pressures, offset, _fingerDir, gapDir, base);
      }

      // 物体视觉反馈
      if (exceeded[fi]) {
        penObj.material.emissive.setRGB(0.5, 0.0, 0.0); // 红色 = 失效
      } else {
        penObj.material.emissive.setRGB(ratio * 0.3, ratio * 0.1, 0);
      }
    }

    // 重置未触碰物体
    for (const obj of objects) {
      let touched = false;
      for (let fi = 0; fi < FINGER_COUNT; fi++) {
        const result = signedDistance(fingers[fi].tip, obj);
        const threshold = obj.userData.physics?.held ? NEAR_THRESHOLD * 3 : NEAR_THRESHOLD;
        if (result.dist < threshold) { touched = true; break; }
      }
      if (!touched) obj.material.emissive.setRGB(0, 0, 0);
    }

    return pressures;
  }

  /**
   * 将方向力分解到 3 个气囊写入 pressures
   *
   * 15 通道版本每根手指只保留：
   * 0 = pad / 指腹
   * 1 = radial / 桡侧
   * 2 = ulnar / 尺侧
   *
   * 原 25 通道里的 tip / dorsal 不再单独输出。
   * 为了避免“指尖正向接触但 3 通道无反馈”，这里把 axial（原 tip 方向）
   * 与 ventral（掌侧/指腹方向）合并到 pad 通道。
   */
  function writePocketsFromDirection(pressures, offset, fingerDir, forceDir, base) {
    const forward = fingerDir.clone();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();
    up.crossVectors(right, forward).normalize();

    const axial = forceDir.dot(forward);
    const ventral = -forceDir.dot(up);
    const radial = -forceDir.dot(right);
    const ulnar = forceDir.dot(right);

    // 指腹通道：兼容指尖正向接触 + 掌侧压觉。
    // 这样从指尖方向戳到物体时，也会转化为指腹气囊反馈。
    const padSignal = Math.min(
      1,
      Math.max(0, axial) + Math.max(0, ventral)
    );

    pressures[offset + 0] = clamp255(base * padSignal);
    pressures[offset + 1] = clamp255(base * Math.max(0, radial));
    pressures[offset + 2] = clamp255(base * Math.max(0, ulnar));
  }

  return {
    update,
    getPressures: () => pressures,
    getConstrainedTips: () => constrainedTips,
    getExceeded: () => exceeded,
  };
}

/**
 * 点到物体表面的有符号距离
 * 负值 = 在内部，正值 = 在外部
 * 返回 { dist, normal（表面外法线）, surface（最近表面点）}
 */
function signedDistance(point, mesh) {
  const p = point.clone().sub(mesh.position);
  const geo = mesh.geometry;
  // 物体可被 objectScale 统一缩放（mesh.scale），几何参数须随之放大
  const s = mesh.scale?.x ?? 1;
  const result = { dist: Infinity, normal: new THREE.Vector3(), surface: new THREE.Vector3() };

  if (geo.type === 'SphereGeometry') {
    const r = geo.parameters.radius * s;
    const len = p.length();
    result.dist = len - r;
    result.normal.copy(p).normalize();
    result.surface.copy(result.normal).multiplyScalar(r).add(mesh.position);
    if (len < 0.0001) {
      // 恰好在中心，法线随意指
      result.normal.set(0, 1, 0);
      result.surface.copy(mesh.position).add(new THREE.Vector3(0, r, 0));
    }
  } else if (geo.type === 'BoxGeometry') {
    const hx = geo.parameters.width / 2 * s;
    const hy = geo.parameters.height / 2 * s;
    const hz = geo.parameters.depth / 2 * s;

    // 最近点：clamp 到 box 内
    const cx = Math.max(-hx, Math.min(hx, p.x));
    const cy = Math.max(-hy, Math.min(hy, p.y));
    const cz = Math.max(-hz, Math.min(hz, p.z));

    const inside = (Math.abs(p.x) <= hx && Math.abs(p.y) <= hy && Math.abs(p.z) <= hz);

    if (inside) {
      // 找最近的面推出去
      const dx = hx - Math.abs(p.x);
      const dy = hy - Math.abs(p.y);
      const dz = hz - Math.abs(p.z);
      const minD = Math.min(dx, dy, dz);

      const surface = p.clone();
      if (minD === dx) { surface.x = Math.sign(p.x) * hx; result.normal.set(Math.sign(p.x), 0, 0); }
      else if (minD === dy) { surface.y = Math.sign(p.y) * hy; result.normal.set(0, Math.sign(p.y), 0); }
      else { surface.z = Math.sign(p.z) * hz; result.normal.set(0, 0, Math.sign(p.z)); }

      result.dist = -minD;
      result.surface.copy(surface).add(mesh.position);
    } else {
      const closest = new THREE.Vector3(cx, cy, cz);
      const diff = p.clone().sub(closest);
      result.dist = diff.length();
      result.normal.copy(diff).normalize();
      result.surface.copy(closest).add(mesh.position);
    }
  } else if (geo.type === 'CylinderGeometry') {
    const r = geo.parameters.radiusTop * s;
    const h = geo.parameters.height / 2 * s;

    // 圆柱沿 Y 轴
    const dxz = Math.sqrt(p.x * p.x + p.z * p.z);
    const radialDist = dxz - r;
    const axialDist = Math.abs(p.y) - h;

    if (radialDist <= 0 && axialDist <= 0) {
      // 内部：找最近面
      if (-radialDist < -axialDist) {
        // 侧面更近
        result.dist = radialDist;
        result.normal.set(p.x, 0, p.z).normalize();
        result.surface.copy(result.normal).multiplyScalar(r);
        result.surface.y = p.y;
        result.surface.add(mesh.position);
      } else {
        // 顶/底面更近
        result.dist = axialDist;
        result.normal.set(0, Math.sign(p.y), 0);
        result.surface.set(p.x, Math.sign(p.y) * h, p.z).add(mesh.position);
      }
    } else {
      // 外部
      const clampR = Math.min(dxz, r);
      const clampY = Math.max(-h, Math.min(h, p.y));
      const scale = dxz > 0 ? clampR / dxz : 0;
      const closest = new THREE.Vector3(p.x * scale, clampY, p.z * scale);
      const diff = p.clone().sub(closest);
      result.dist = diff.length();
      result.normal.copy(diff).normalize();
      result.surface.copy(closest).add(mesh.position);
    }
  } else {
    // Fallback: 包围球
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const r = geo.boundingSphere.radius * s;
    const len = p.length();
    result.dist = len - r;
    result.normal.copy(p).normalize();
    result.surface.copy(result.normal).multiplyScalar(r).add(mesh.position);
  }

  return result;
}

function clamp255(v) {
  return Math.round(Math.max(0, Math.min(255, v)));
}
