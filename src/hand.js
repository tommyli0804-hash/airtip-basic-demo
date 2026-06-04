import * as THREE from 'three';

/**
 * 骨骼手模型
 *
 * 结构：掌心 + 5 指 × 4 关节（mcp/pip/dip/tip）
 * 4 段骨：palm→mcp, mcp→pip, pip→dip, dip→tip
 * 支持两种渲染模式：solid（实体）和 ghost（半透明输入位置）
 */

// 手指静息姿态：mcp 偏移、方向、总长度
// （由 mouse-mock 之 restPose 使用，Leap 数据不依赖此）
const FINGER_CONFIG = [
  { mcpOffset: new THREE.Vector3(-0.16, 0.0, -0.04), dir: new THREE.Vector3(-0.6, 0.1, -0.8), len: 0.28 },
  { mcpOffset: new THREE.Vector3(-0.07, 0.0, -0.12), dir: new THREE.Vector3(-0.1, 0.0, -1.0), len: 0.32 },
  { mcpOffset: new THREE.Vector3(0.0,  0.0, -0.14), dir: new THREE.Vector3(0.0, 0.0, -1.0), len: 0.36 },
  { mcpOffset: new THREE.Vector3(0.07, 0.0, -0.12), dir: new THREE.Vector3(0.1, 0.0, -1.0), len: 0.32 },
  { mcpOffset: new THREE.Vector3(0.13, 0.0, -0.10), dir: new THREE.Vector3(0.2, 0.0, -1.0), len: 0.26 },
];

const JOINT_RADIUS = 0.024;
const BONE_RADIUS = 0.012;
const JOINTS_PER_FINGER = 4;
const BONES_PER_FINGER = 4; // palm→mcp, mcp→pip, pip→dip, dip→tip

// 皮肉层（仅 solid 手）：包裹在骨骼之上的肤色半透明网格，
// 结构与骨骼一致但更粗，关节处的球体充当指节使指段连续如肉。
const SKIN_JOINT_RADIUS = 0.03;
const SKIN_BONE_RADIUS = 0.026;

/**
 * @param {'solid'|'ghost'} mode
 */
export function createHandModel(scene, mode = 'solid') {
  const isSolid = mode === 'solid';

  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const jointMat = new THREE.MeshStandardMaterial({
    color: 0xffcc00,
    emissive: isSolid ? 0x664400 : 0x332200,
    transparent: !isSolid,
    opacity: isSolid ? 1.0 : 0.25,
    depthWrite: isSolid,
  });

  const boneMat = new THREE.MeshStandardMaterial({
    color: 0xddaa00,
    emissive: isSolid ? 0x553300 : 0x221100,
    transparent: !isSolid,
    opacity: isSolid ? 1.0 : 0.2,
    depthWrite: isSolid,
  });

  const palmMat = new THREE.MeshStandardMaterial({
    color: 0xffaa44,
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
  palmMesh.castShadow = isSolid; // ghost 半透明，投影会发糊，仅 solid 投影
  group.add(palmMesh);

  const fingers = [];
  for (let i = 0; i < 5; i++) {
    const joints = [];
    const bones = [];

    for (let j = 0; j < JOINTS_PER_FINGER; j++) {
      const joint = new THREE.Mesh(jointGeo, jointMat);
      joint.castShadow = isSolid;
      group.add(joint);
      joints.push(joint);
    }

    for (let j = 0; j < BONES_PER_FINGER; j++) {
      const bone = new THREE.Mesh(
        new THREE.CylinderGeometry(BONE_RADIUS, BONE_RADIUS, 1, 6),
        boneMat
      );
      bone.castShadow = isSolid;
      group.add(bone);
      bones.push(bone);
    }

    fingers.push({ joints, bones, defaultMat: jointMat });
  }

  // --- 皮肉层（仅 solid） ---
  // transparent + depthWrite:true：近层皮肤正确遮挡远层，免自重叠排序鬼影；
  // 又因半透明，内部黄色骨骼透出，呈"皮包骨"解剖示意效果。
  let skin = null;
  if (isSolid) {
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xe0a47a,
      roughness: 0.85,
      metalness: 0.0,
      transparent: true,
      opacity: 0.55,
      depthWrite: true,
    });
    const exceededSkinMat = new THREE.MeshStandardMaterial({
      color: 0xff4444,
      emissive: 0x551111,
      transparent: true,
      opacity: 0.6,
      depthWrite: true,
    });

    const skinJointGeo = new THREE.SphereGeometry(SKIN_JOINT_RADIUS, 14, 14);
    const skinBoneGeo = new THREE.CylinderGeometry(SKIN_BONE_RADIUS, SKIN_BONE_RADIUS, 1, 14);
    // 单位椭球（直径 1），update 时按掌宽/掌长/厚度缩放
    const palmSkinGeo = new THREE.SphereGeometry(0.5, 20, 16);

    const palmSkinMesh = new THREE.Mesh(palmSkinGeo, skinMat);
    palmSkinMesh.castShadow = true;
    group.add(palmSkinMesh);

    const skinFingers = [];
    for (let i = 0; i < 5; i++) {
      const joints = [];
      const bones = [];
      for (let j = 0; j < JOINTS_PER_FINGER; j++) {
        const m = new THREE.Mesh(skinJointGeo, skinMat);
        m.castShadow = true;
        group.add(m);
        joints.push(m);
      }
      for (let j = 0; j < BONES_PER_FINGER - 1; j++) {
        // 跳过 palm→mcp 段（藏在掌内），只覆盖三节指骨
        const m = new THREE.Mesh(skinBoneGeo, skinMat);
        m.castShadow = true;
        group.add(m);
        bones.push(m);
      }
      skinFingers.push({ joints, bones });
    }

    skin = { mat: skinMat, exceededMat: exceededSkinMat, palm: palmSkinMesh, fingers: skinFingers };
  }

  const _dir = new THREE.Vector3();
  // 掌部朝向计算用临时量
  const _avgMcp = new THREE.Vector3();
  const _forward = new THREE.Vector3();
  const _side = new THREE.Vector3();
  const _normal = new THREE.Vector3();
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _basis = new THREE.Matrix4();

  /**
   * @param {Object|null} hand — { palm, fingers: [{mcp, pip, dip, tip}] × 5 }
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
      const f = hand.fingers[i];
      const fm = fingers[i];

      fm.joints[0].position.copy(f.mcp);
      fm.joints[1].position.copy(f.pip);
      fm.joints[2].position.copy(f.dip);
      fm.joints[3].position.copy(f.tip);

      // 超行程时指尖关节变红
      if (isSolid && exceeded) {
        fm.joints[3].material = exceeded[i] ? exceededMat : fm.defaultMat;
      }

      positionBone(fm.bones[0], hand.palm, f.mcp);
      positionBone(fm.bones[1], f.mcp, f.pip);
      positionBone(fm.bones[2], f.pip, f.dip);
      positionBone(fm.bones[3], f.dip, f.tip);

      // 皮肉层：关节球 + 三节指骨柱，跟随同一组关节位置
      if (skin) {
        const sf = skin.fingers[i];
        sf.joints[0].position.copy(f.mcp);
        sf.joints[1].position.copy(f.pip);
        sf.joints[2].position.copy(f.dip);
        sf.joints[3].position.copy(f.tip);

        positionBone(sf.bones[0], f.mcp, f.pip);
        positionBone(sf.bones[1], f.pip, f.dip);
        positionBone(sf.bones[2], f.dip, f.tip);

        // 超行程：该指皮肉转红告警
        const m = (exceeded && exceeded[i]) ? skin.exceededMat : skin.mat;
        for (const j of sf.joints) j.material = m;
        for (const b of sf.bones) b.material = m;
      }
    }

    if (skin) updatePalmSkin(hand);
  }

  /**
   * 掌部皮肉：一枚扁椭球，由 掌心→各 mcp 的朝向与法线定向，
   * 覆盖掌心到指根区域。
   */
  function updatePalmSkin(hand) {
    const palm = hand.palm;
    _avgMcp.set(0, 0, 0);
    for (let i = 0; i < 5; i++) _avgMcp.add(hand.fingers[i].mcp);
    _avgMcp.multiplyScalar(0.2);

    _forward.subVectors(_avgMcp, palm);
    const fwdLen = _forward.length();
    if (fwdLen < 1e-4) return; // 退化，跳过本帧
    _forward.multiplyScalar(1 / fwdLen);

    // 掌平面法线：由食指、小指 mcp 相对掌心的两向量叉乘
    _v1.subVectors(hand.fingers[1].mcp, palm);
    _v2.subVectors(hand.fingers[4].mcp, palm);
    _normal.crossVectors(_v1, _v2);
    if (_normal.lengthSq() < 1e-8) _normal.set(0, 1, 0);
    _normal.normalize();

    // 正交化基底：x=side（掌宽）、y=normal（厚度）、z=forward（掌长）
    _side.crossVectors(_normal, _forward).normalize();
    _normal.crossVectors(_forward, _side).normalize();
    _basis.makeBasis(_side, _normal, _forward);
    skin.palm.quaternion.setFromRotationMatrix(_basis);

    skin.palm.position.copy(palm).addScaledVector(_forward, fwdLen * 0.45);

    const width = hand.fingers[1].mcp.distanceTo(hand.fingers[4].mcp) * 0.9 + 0.05;
    const length = fwdLen * 1.2 + 0.05;
    const thickness = 0.045;
    skin.palm.scale.set(width, thickness, length);
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
   * 计算手指静息态的四个关节位置（用于 mouse-mock）
   * 张开时四关节沿 dir 等距分布；握拳时向掌心卷曲
   * @returns {{mcp, pip, dip, tip}[]}
   */
  function restPose(palm, grabStrength) {
    const out = [];
    for (let i = 0; i < 5; i++) {
      const cfg = FINGER_CONFIG[i];
      const dir = cfg.dir.clone().normalize();
      const mcp = palm.clone().add(cfg.mcpOffset);

      // 张开姿态：pip 40%，dip 70%，tip 100% 沿 dir
      const openPip = mcp.clone().addScaledVector(dir, cfg.len * 0.4);
      const openDip = mcp.clone().addScaledVector(dir, cfg.len * 0.7);
      const openTip = mcp.clone().addScaledVector(dir, cfg.len * 1.0);

      // 握拳姿态：各关节向掌心卷曲（dir 缩短 + 向下偏移）
      const inward = new THREE.Vector3(0, -1, 0);
      const closedPip = mcp.clone().addScaledVector(dir, cfg.len * 0.35).addScaledVector(inward, 0.04);
      const closedDip = mcp.clone().addScaledVector(dir, cfg.len * 0.45).addScaledVector(inward, 0.10);
      const closedTip = mcp.clone().addScaledVector(dir, cfg.len * 0.40).addScaledVector(inward, 0.16);

      out.push({
        mcp,
        pip: new THREE.Vector3().lerpVectors(openPip, closedPip, grabStrength),
        dip: new THREE.Vector3().lerpVectors(openDip, closedDip, grabStrength),
        tip: new THREE.Vector3().lerpVectors(openTip, closedTip, grabStrength),
      });
    }
    return out;
  }

  return { update, restPose, getFingerConfig: () => FINGER_CONFIG };
}
