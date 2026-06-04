import * as THREE from 'three';

/**
 * 骨骼手模型
 *
 * 结构：掌心 + 5 指 × 3 关节（base/mid/tip）
 * 支持两种渲染模式：solid（实体）和 ghost（半透明输入位置）
 */

// 手指静息姿态：相对于掌心的偏移
const FINGER_CONFIG = [
  { base: new THREE.Vector3(-0.16, 0.0, -0.04), dir: new THREE.Vector3(-0.6, 0.1, -0.8), len: 0.28 },
  { base: new THREE.Vector3(-0.07, 0.0, -0.12), dir: new THREE.Vector3(-0.1, 0.0, -1.0), len: 0.32 },
  { base: new THREE.Vector3(0.0, 0.0, -0.14), dir: new THREE.Vector3(0.0, 0.0, -1.0), len: 0.36 },
  { base: new THREE.Vector3(0.07, 0.0, -0.12), dir: new THREE.Vector3(0.1, 0.0, -1.0), len: 0.32 },
  { base: new THREE.Vector3(0.13, 0.0, -0.10), dir: new THREE.Vector3(0.2, 0.0, -1.0), len: 0.26 },
];

const JOINT_RADIUS = 0.024;
const BONE_RADIUS = 0.012;

/**
 * @param {'solid'|'ghost'} mode
 */
export function createHandModel(scene, mode = 'solid') {
  const isSolid = mode === 'solid';

  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const jointMat = new THREE.MeshStandardMaterial({
    color: isSolid ? 0xffcc00 : 0xffcc00,
    emissive: isSolid ? 0x664400 : 0x332200,
    transparent: !isSolid,
    opacity: isSolid ? 1.0 : 0.25,
    depthWrite: isSolid,
  });

  const boneMat = new THREE.MeshStandardMaterial({
    color: isSolid ? 0xddaa00 : 0xddaa00,
    emissive: isSolid ? 0x553300 : 0x221100,
    transparent: !isSolid,
    opacity: isSolid ? 1.0 : 0.2,
    depthWrite: isSolid,
  });

  const palmMat = new THREE.MeshStandardMaterial({
    color: isSolid ? 0xffaa44 : 0xffaa44,
    emissive: isSolid ? 0x553300 : 0x221100,
    transparent: !isSolid,
    opacity: isSolid ? 1.0 : 0.25,
    depthWrite: isSolid,
  });

  // 超行程警告材质（红色）
  const exceededMat = new THREE.MeshStandardMaterial({
    color: 0xff2222,
    emissive: 0x881111,
  });

  const jointGeo = new THREE.SphereGeometry(JOINT_RADIUS, 10, 10);
  const palmGeo = new THREE.SphereGeometry(0.06, 14, 14);
  const palmMesh = new THREE.Mesh(palmGeo, palmMat);
  group.add(palmMesh);

  const fingers = [];
  for (let i = 0; i < 5; i++) {
    const joints = [];
    const bones = [];

    for (let j = 0; j < 3; j++) {
      const joint = new THREE.Mesh(jointGeo, jointMat);
      group.add(joint);
      joints.push(joint);
    }

    for (let j = 0; j < 3; j++) {
      const bone = new THREE.Mesh(
        new THREE.CylinderGeometry(BONE_RADIUS, BONE_RADIUS, 1, 6),
        boneMat
      );
      group.add(bone);
      bones.push(bone);
    }

    fingers.push({ joints, bones, defaultMat: jointMat });
  }

  const _dir = new THREE.Vector3();
  const _mid = new THREE.Vector3();

  /**
   * @param {Object|null} hand — { palm, fingers: Vector3[5] }
   * @param {boolean[]} [exceeded] — 每指是否超行程（仅 solid 模式用）
   */
  function update(hand, exceeded) {
    if (!hand) {
      group.visible = false;
      return;
    }

    group.visible = true;
    palmMesh.position.copy(hand.palm);

    for (let i = 0; i < 5; i++) {
      const cfg = FINGER_CONFIG[i];
      const tip = hand.fingers[i];
      const base = new THREE.Vector3().copy(hand.palm).add(cfg.base);

      _mid.lerpVectors(base, tip, 0.5);
      _mid.y += 0.03;

      const f = fingers[i];
      f.joints[0].position.copy(base);
      f.joints[1].position.copy(_mid);
      f.joints[2].position.copy(tip);

      // 超行程时指尖关节变红
      if (isSolid && exceeded) {
        f.joints[2].material = exceeded[i] ? exceededMat : f.defaultMat;
      }

      positionBone(f.bones[0], hand.palm, base);
      positionBone(f.bones[1], base, _mid);
      positionBone(f.bones[2], _mid, tip);
    }
  }

  function positionBone(bone, from, to) {
    _dir.subVectors(to, from);
    const len = _dir.length();
    bone.scale.set(1, len, 1);
    bone.position.lerpVectors(from, to, 0.5);
    bone.lookAt(to);
    bone.rotateX(Math.PI / 2);
  }

  /**
   * 计算手指静息态的指尖位置
   */
  function restPose(palm, grabStrength) {
    const tips = [];
    for (let i = 0; i < 5; i++) {
      const cfg = FINGER_CONFIG[i];
      const dir = cfg.dir.clone().normalize();

      const openTip = new THREE.Vector3()
        .copy(palm)
        .add(cfg.base)
        .addScaledVector(dir, cfg.len);

      const closedTip = new THREE.Vector3()
        .copy(palm)
        .add(cfg.base)
        .addScaledVector(new THREE.Vector3(0, -0.08, 0.04), 1);

      tips.push(new THREE.Vector3().lerpVectors(openTip, closedTip, grabStrength));
    }
    return tips;
  }

  return { update, restPose, getFingerConfig: () => FINGER_CONFIG };
}
