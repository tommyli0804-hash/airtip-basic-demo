import Leap from 'leapjs';
import * as THREE from 'three';

const LEAP_SCALE = 0.004;
const LEAP_OFFSET_Y = -0.5;

/**
 * Leap Motion 手部追踪模块
 * 通过 leapjs 连接本地 Leap 服务（ws://localhost:6437）
 * 输出标准化的手部数据，可视化由 hand.js 负责
 */
export function createLeapTracker(onStatusChange) {
  const state = {
    connected: false,
    hand: null, // { palm: Vector3, fingers: Vector3[], grabStrength, pinchStrength }
  };

  function leapToWorld(leapPos) {
    return new THREE.Vector3(
      leapPos[0] * LEAP_SCALE,
      leapPos[1] * LEAP_SCALE + LEAP_OFFSET_Y,
      -leapPos[2] * LEAP_SCALE
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
    state.hand = {
      palm: leapToWorld(hand.palmPosition),
      fingers: hand.fingers.map((f) => leapToWorld(f.tipPosition)),
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
