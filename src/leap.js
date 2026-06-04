import Leap from 'leapjs';
import * as THREE from 'three';
import * as settings from './settings.js';

/**
 * Leap Motion 手部追踪模块
 * 通过 leapjs 连接本地 Leap 服务（ws://localhost:6437）
 * 输出标准化的手部数据，可视化由 hand.js 负责
 *
 * 映射参数（leapScale / leapNeutralY / worldHandY）从 settings 模块动态读取，
 * UI 滑块可实时调整。
 */

export function createLeapTracker(onStatusChange) {
  const state = {
    connected: false,
    hand: null, // { palm: Vector3, fingers: Vector3[], grabStrength, pinchStrength }
  };

  // 掌心定位：解耦 Y 偏移——先减中性高度，再乘 leapScale（位移增益），最后加世界偏移。
  // 三轴方向由 leapFlip{X,Y,Z} 开关控制，默认皆不翻。
  function palmToWorld(leapPos) {
    const scale = settings.get('leapScale');
    const neutralY = settings.get('leapNeutralY');
    const worldY = settings.get('worldHandY');
    const sx = settings.get('leapFlipX') ? -1 : 1;
    const sy = settings.get('leapFlipY') ? -1 : 1;
    const sz = settings.get('leapFlipZ') ? -1 : 1;
    return new THREE.Vector3(
      sx * leapPos[0] * scale,
      sy * (leapPos[1] - neutralY) * scale + worldY,
      sz * leapPos[2] * scale
    );
  }

  // 关节定位：掌心世界坐标 + (关节−掌心) × leapHandScale。
  // 手的"大小"由 leapHandScale 单独控制，与掌心位移增益 leapScale 无关，
  // 避免高灵敏度把手撑得过大。flip 同样作用于相对偏移以保持镜像一致。
  function jointToWorld(jointLeap, palmLeap, palmWorld) {
    const handScale = settings.get('leapHandScale');
    const sx = settings.get('leapFlipX') ? -1 : 1;
    const sy = settings.get('leapFlipY') ? -1 : 1;
    const sz = settings.get('leapFlipZ') ? -1 : 1;
    return new THREE.Vector3(
      palmWorld.x + sx * (jointLeap[0] - palmLeap[0]) * handScale,
      palmWorld.y + sy * (jointLeap[1] - palmLeap[1]) * handScale,
      palmWorld.z + sz * (jointLeap[2] - palmLeap[2]) * handScale
    );
  }

  const controller = new Leap.Controller({ enableGestures: false });

  controller.on('connect', () => {
    state.connected = true;
    onStatusChange(true);
  });

  controller.on('disconnect', () => {
    state.connected = false;
    state.hand = null;
    onStatusChange(false);
  });

  controller.on('frame', (frame) => {
    if (frame.hands.length === 0) {
      state.hand = null;
      return;
    }

    const hand = frame.hands[0];
    const palmLeap = hand.palmPosition;
    const palmWorld = palmToWorld(palmLeap);
    // 取每指四个关节：mcp(指根) → pip → dip → tip
    // 拇指无 pip，leapjs 仍提供 pipPosition（与 mcp 重合或近似）
    state.hand = {
      palm: palmWorld,
      fingers: hand.fingers.map((f) => ({
        mcp: jointToWorld(f.mcpPosition, palmLeap, palmWorld),
        pip: jointToWorld(f.pipPosition, palmLeap, palmWorld),
        dip: jointToWorld(f.dipPosition, palmLeap, palmWorld),
        tip: jointToWorld(f.tipPosition, palmLeap, palmWorld),
      })),
      grabStrength: hand.grabStrength,
      pinchStrength: hand.pinchStrength,
    };
  });

  try {
    controller.connect();
  } catch (e) {
    console.warn('Leap Motion 连接失败:', e);
  }

  return {
    getState: () => state,
    dispose: () => controller.disconnect(),
  };
}
