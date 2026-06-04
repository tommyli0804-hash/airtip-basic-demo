import * as THREE from 'three';

export const FINGER_COUNT = 5;
export const POCKETS_PER_FINGER = 5;
export const TOTAL_CHANNELS = FINGER_COUNT * POCKETS_PER_FINGER;

// 气囊编号：0=tip 1=pad 2=dorsal 3=radial 4=ulnar

// 执行器最大行程（米）— 超出此距离为失效状态
const MAX_ACTUATOR_TRAVEL = 0.08;

const STIFFNESS = { soft: 0.4, medium: 0.7, hard: 1.0 };

/**
 * 交互模块：碰撞约束 + 方向力映射
 *
 * 流程：
 * 1. 对每根手指检测是否穿入物体
 * 2. 穿入时，将指尖约束（spring-back）到物体表面
 * 3. 输入位置 vs 约束位置的 gap 驱动气压
 * 4. gap 投影到手指局部坐标系 5 个方向 → 5 个气囊
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

    const { palm, fingers } = handState.hand;
    _palmPos.copy(palm);

    for (let fi = 0; fi < FINGER_COUNT; fi++) {
      _tipPos.copy(fingers[fi]);
      constrainedTips[fi].copy(_tipPos);

      // 手指方向：掌心 → 指尖
      _fingerDir.subVectors(_tipPos, _palmPos).normalize();

      // 找最深穿入的物体
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
        const NEAR_THRESHOLD = 0.04;
        if (minDist < NEAR_THRESHOLD && nearestObj) {
          const stiffness = STIFFNESS[nearestObj.userData.type] ?? 0.5;
          const proximity = 1 - minDist / NEAR_THRESHOLD;
          const base = proximity * stiffness * 60; // 最多 ~60，轻触

          const offset = fi * POCKETS_PER_FINGER;
          writePocketsFromDirection(pressures, offset, _fingerDir, nearestNormal, base);
        }
        continue;
      }

      // --- 穿入处理 ---

      // 约束指尖到物体表面（spring-back）
      constrainedTips[fi].copy(penSurfacePoint);

      // gap = 输入位置 - 约束位置（从约束位置指向输入位置的向量）
      _gap.subVectors(_tipPos, penSurfacePoint);
      const gapLen = _gap.length();

      // 超行程检测
      exceeded[fi] = gapLen > MAX_ACTUATOR_TRAVEL;

      const stiffness = STIFFNESS[penObj.userData.type] ?? 0.5;
      // 压力与 gap 成正比，saturate 在 max travel
      const ratio = Math.min(gapLen / MAX_ACTUATOR_TRAVEL, 1.0);
      const base = ratio * stiffness * 255;

      // gap 方向投影到手指局部坐标系
      const offset = fi * POCKETS_PER_FINGER;
      const gapDir = _gap.clone().normalize();
      writePocketsFromDirection(pressures, offset, _fingerDir, gapDir, base);

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
        const result = signedDistance(fingers[fi], obj);
        if (result.dist < 0.04) { touched = true; break; }
      }
      if (!touched) obj.material.emissive.setRGB(0, 0, 0);
    }

    return pressures;
  }

  /** 将方向力分解到 5 气囊写入 pressures */
  function writePocketsFromDirection(pressures, offset, fingerDir, forceDir, base) {
    const forward = fingerDir.clone();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();
    up.crossVectors(right, forward).normalize();

    const axial = forceDir.dot(forward);
    const ventral = -forceDir.dot(up);
    const dorsal = forceDir.dot(up);
    const radial = -forceDir.dot(right);
    const ulnar = forceDir.dot(right);

    pressures[offset + 0] = clamp255(base * Math.max(0, axial));
    pressures[offset + 1] = clamp255(base * Math.max(0, ventral));
    pressures[offset + 2] = clamp255(base * Math.max(0, dorsal));
    pressures[offset + 3] = clamp255(base * Math.max(0, radial));
    pressures[offset + 4] = clamp255(base * Math.max(0, ulnar));
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
  const result = { dist: Infinity, normal: new THREE.Vector3(), surface: new THREE.Vector3() };

  if (geo.type === 'SphereGeometry') {
    const r = geo.parameters.radius;
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
    const hx = geo.parameters.width / 2;
    const hy = geo.parameters.height / 2;
    const hz = geo.parameters.depth / 2;

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
    const r = geo.parameters.radiusTop;
    const h = geo.parameters.height / 2;

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
    const r = geo.boundingSphere.radius;
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
