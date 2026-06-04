import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

/**
 * Gumball 式手部模拟输入
 *
 * 操作：
 * - 拖拽 Gumball 轴/面手柄：沿指定轴或平面移动手掌
 * - 滚轮：调整握力（grabStrength 0~1）
 * - 按 G 键切换 translate/rotate 模式（rotate 旋转手腕朝向）
 */
export function createMouseMock(camera, handModel, renderer, scene) {
  // 手掌锚点 — 不可见，仅作为 gumball 的操控目标
  const anchor = new THREE.Object3D();
  anchor.position.set(0, 0.8, 1.2);
  scene.add(anchor);

  // 可视化锚点标记（半透明小环，让用户知道在操控什么）
  const ringGeo = new THREE.TorusGeometry(0.04, 0.005, 8, 24);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.3, transparent: true });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  anchor.add(ring);

  // Gumball（TransformControls）
  const gumball = new TransformControls(camera, renderer.domElement);
  gumball.attach(anchor);
  gumball.setSize(0.6);
  gumball.setSpace('local');
  scene.add(gumball.getHelper());

  const state = {
    connected: true,
    hand: null,
  };

  let grabStrength = 0;

  function updateHand() {
    const palm = anchor.position.clone();
    const tips = handModel.restPose(palm, grabStrength);
    state.hand = {
      palm,
      fingers: tips,
      grabStrength,
      pinchStrength: grabStrength,
    };
  }

  // gumball 拖拽时实时更新
  gumball.addEventListener('change', updateHand);

  // Shift+滚轮控制握力（普通滚轮留给相机缩放）
  function onWheel(e) {
    if (!e.shiftKey) return;
    e.preventDefault();
    grabStrength = Math.max(0, Math.min(1, grabStrength + e.deltaY * 0.002));
    updateHand();
  }

  window.addEventListener('wheel', onWheel, { passive: false });

  // 初始化手
  updateHand();

  return {
    getState: () => state,
    /** 返回 gumball 的 dragging 状态，供外部判断是否需要禁用其他控制 */
    isDragging: () => gumball.dragging,
    dispose: () => {
      gumball.detach();
      gumball.dispose();
      scene.remove(gumball.getHelper());
      scene.remove(anchor);
      window.removeEventListener('wheel', onWheel);
    },
  };
}
