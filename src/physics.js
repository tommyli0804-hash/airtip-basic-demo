import * as THREE from 'three';
import * as settings from './settings.js';

/**
 * 物理模块：重力下落 + 抓取-释放
 *
 * 抓取判据：握力 ≥ GRAB_THRESHOLD 且 ≥ FINGERS_NEEDED 指近同一物
 * 释放判据：握力 < RELEASE_THRESHOLD
 * 抓取时物体跟手掌移动；释放后受重力下坠，触地反弹一次后静置
 */

const GROUND_Y = 0;
const GRAB_THRESHOLD = 0.7;
const RELEASE_THRESHOLD = 0.3;
const FINGERS_NEEDED = 2;
const NEAR_THRESHOLD = 0.1; // 指尖到物表距离 < 此则算"近"
const BOUNCE = 0.3;         // 触地反弹系数
const FRICTION = 0.7;       // 触地水平摩擦
const THROW_SMOOTH = 0.6;   // 握持速度估计的 EMA 系数（越大越跟手）
const MAX_THROW_SPEED = 12; // 释放速度上限（m/s），防抖动导致瞬时爆速
const SOLVER_ITER = 4;      // 物体间碰撞求解迭代次数（越多越稳，越慢）
const OBJ_FRICTION = 0.8;   // 物体相互接触的切向摩擦（利于堆叠不滑散）

export function createPhysics(objects) {
  for (const obj of objects) {
    obj.geometry.computeBoundingBox();
    const bb = obj.geometry.boundingBox;
    obj.userData.physics = {
      velocity: new THREE.Vector3(),
      held: false,
      holdOffset: new THREE.Vector3(),
      halfHeight: (bb.max.y - bb.min.y) / 2,
      // AABB 半尺寸（未缩放），物体间碰撞用；球/柱以包围盒近似
      halfExtents: new THREE.Vector3(
        (bb.max.x - bb.min.x) / 2,
        (bb.max.y - bb.min.y) / 2,
        (bb.max.z - bb.min.z) / 2
      ),
    };
  }

  let heldObj = null; // 当前被抓之物，或 null
  let lastTime = performance.now() / 1000;

  const _newPos = new THREE.Vector3();
  const _instVel = new THREE.Vector3();

  function update(handState) {
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, now - lastTime); // 防 dt 爆大
    lastTime = now;

    const gravity = settings.get('gravity');
    const hand = handState?.hand;

    // 释放
    if (heldObj && (!hand || hand.grabStrength < RELEASE_THRESHOLD)) {
      heldObj.userData.physics.held = false;
      heldObj = null;
    }

    // 抓取（若尚无持物）
    if (!heldObj && hand && hand.grabStrength >= GRAB_THRESHOLD) {
      let best = null;
      let bestNear = FINGERS_NEEDED - 1;
      for (const obj of objects) {
        const near = countNearFingers(obj, hand.fingers);
        if (near > bestNear) {
          bestNear = near;
          best = obj;
        }
      }
      if (best) {
        heldObj = best;
        best.userData.physics.held = true;
        best.userData.physics.holdOffset.subVectors(best.position, hand.palm);
        best.userData.physics.velocity.set(0, 0, 0);
      }
    }

    // 整合各物
    for (const obj of objects) {
      const p = obj.userData.physics;

      if (p.held && hand) {
        // 跟手移动，同时由位移估算握持速度（EMA 平滑），
        // 以便释放时承袭此速度，形成抛物线飞行（真实投射物理）。
        _newPos.copy(hand.palm).add(p.holdOffset);
        if (dt > 1e-4) {
          _instVel.copy(_newPos).sub(obj.position).divideScalar(dt);
          if (_instVel.length() > MAX_THROW_SPEED) _instVel.setLength(MAX_THROW_SPEED);
          p.velocity.lerp(_instVel, THROW_SMOOTH);
        }
        obj.position.copy(_newPos);
        continue;
      }

      // 重力加速（关则只保留惯性平移，抛出之物作匀速直线而非凭空冻结）
      if (gravity > 0) p.velocity.y -= gravity * dt;
      // 既无重力又静止：跳过，免无谓计算
      if (gravity <= 0 && p.velocity.lengthSq() < 1e-6) continue;
      obj.position.addScaledVector(p.velocity, dt);

      clampGround(obj);
    }

    // 物体间碰撞求解（AABB），多次迭代以稳定堆叠
    resolveCollisions();
    // 求解后可能被推入地面，再夹一次
    for (const obj of objects) {
      if (!obj.userData.physics.held) clampGround(obj);
    }
  }

  /** 地面碰撞夹紧（半高随 objectScale 缩放） */
  function clampGround(obj) {
    const p = obj.userData.physics;
    const half = p.halfHeight * obj.scale.x;
    if (obj.position.y - half < GROUND_Y) {
      obj.position.y = GROUND_Y + half;
      if (p.velocity.y < 0) p.velocity.y = -p.velocity.y * BOUNCE;
      p.velocity.x *= FRICTION;
      p.velocity.z *= FRICTION;
      if (Math.abs(p.velocity.y) < 0.1) p.velocity.y = 0;
    }
  }

  /**
   * 物体间 AABB 碰撞：按最小重叠轴分离，清法向速度、加切向摩擦。
   * 被握之物视为不可推动（无限质量），故可手持一块、在其上垒叠他块。
   */
  function resolveCollisions() {
    const n = objects.length;
    for (let it = 0; it < SOLVER_ITER; it++) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const A = objects[i], B = objects[j];
          const pa = A.userData.physics, pb = B.userData.physics;
          if (pa.held && pb.held) continue; // 二者皆不可动

          const sa = A.scale.x, sb = B.scale.x;
          const dx = B.position.x - A.position.x;
          const ox = (pa.halfExtents.x * sa + pb.halfExtents.x * sb) - Math.abs(dx);
          if (ox <= 0) continue;
          const dy = B.position.y - A.position.y;
          const oy = (pa.halfExtents.y * sa + pb.halfExtents.y * sb) - Math.abs(dy);
          if (oy <= 0) continue;
          const dz = B.position.z - A.position.z;
          const oz = (pa.halfExtents.z * sa + pb.halfExtents.z * sb) - Math.abs(dz);
          if (oz <= 0) continue;

          // 最小重叠轴 → 分离法线（从 A 指向 B）
          let nx = 0, ny = 0, nz = 0, ov;
          if (ox <= oy && ox <= oz) { nx = dx < 0 ? -1 : 1; ov = ox; }
          else if (oy <= oz) { ny = dy < 0 ? -1 : 1; ov = oy; }
          else { nz = dz < 0 ? -1 : 1; ov = oz; }

          // 位置分离：被握/不可动者权重 0
          let wa = 0.5, wb = 0.5;
          if (pa.held) { wa = 0; wb = 1; }
          else if (pb.held) { wa = 1; wb = 0; }
          A.position.set(A.position.x - nx * ov * wa, A.position.y - ny * ov * wa, A.position.z - nz * ov * wa);
          B.position.set(B.position.x + nx * ov * wb, B.position.y + ny * ov * wb, B.position.z + nz * ov * wb);

          // 速度响应：清除法向分量（不反弹，利于静置），切向加摩擦
          if (!pa.held) killNormalVel(pa.velocity, nx, ny, nz);
          if (!pb.held) killNormalVel(pb.velocity, nx, ny, nz);
        }
      }
    }
  }

  function killNormalVel(vel, nx, ny, nz) {
    const vn = vel.x * nx + vel.y * ny + vel.z * nz;
    vel.x -= vn * nx;
    vel.y -= vn * ny;
    vel.z -= vn * nz;
    // 切向摩擦（水平方向），让堆叠逐渐静定
    vel.x *= OBJ_FRICTION;
    vel.z *= OBJ_FRICTION;
  }

  return {
    update,
    isHeld: (obj) => !!obj.userData.physics?.held,
    getHeld: () => heldObj,
  };
}

function countNearFingers(obj, fingers) {
  if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
  const r = obj.geometry.boundingSphere.radius * obj.scale.x;
  let count = 0;
  for (const f of fingers) {
    const dist = f.tip.distanceTo(obj.position) - r;
    if (dist < NEAR_THRESHOLD) count++;
  }
  return count;
}
