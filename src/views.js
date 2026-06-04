import * as THREE from 'three';

/**
 * 三视图模块
 *
 * 关闭时：整屏渲染透视相机。
 * 开启时：画面分四象限——
 *   ┌────────────┬────────────┐
 *   │  透视(主)   │   顶视      │
 *   ├────────────┼────────────┤
 *   │   前视      │   侧视      │
 *   └────────────┴────────────┘
 * 顶/前/侧为正交相机，便于观察手指与物体的相对位置与穿透深度。
 *
 * 注意：Gumball 拖拽仍以主透视相机做射线投射，三视图模式主要用于观察；
 *      操控手掌时建议在透视象限（左上）内进行。
 */
export function createViews(scene, mainCamera, renderer) {
  const target = new THREE.Vector3(0, 0.6, 0);
  const FRUSTUM = 3.2; // 正交相机竖直可视范围（米）
  const DIST = 6;

  function makeOrtho() {
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    return cam;
  }

  const topCam = makeOrtho();   // 俯视：沿 -Y 向下看
  const frontCam = makeOrtho(); // 前视：沿 -Z 看
  const sideCam = makeOrtho();  // 侧视：沿 -X 看

  topCam.position.set(target.x, target.y + DIST, target.z);
  topCam.up.set(0, 0, -1);
  topCam.lookAt(target);

  frontCam.position.set(target.x, target.y, target.z + DIST);
  frontCam.up.set(0, 1, 0);
  frontCam.lookAt(target);

  sideCam.position.set(target.x + DIST, target.y, target.z);
  sideCam.up.set(0, 1, 0);
  sideCam.lookAt(target);

  function updateOrthoFrustum(cam, aspect) {
    const halfV = FRUSTUM / 2;
    const halfH = halfV * aspect;
    cam.left = -halfH;
    cam.right = halfH;
    cam.top = halfV;
    cam.bottom = -halfV;
    cam.updateProjectionMatrix();
  }

  let enabled = false;

  // HTML 角标
  const labelWrap = document.createElement('div');
  labelWrap.id = 'views-labels';
  labelWrap.style.display = 'none';
  const LABELS = ['透视', '顶视', '前视', '侧视'];
  const labelEls = LABELS.map((txt) => {
    const el = document.createElement('div');
    el.className = 'view-label';
    el.textContent = txt;
    labelWrap.appendChild(el);
    return el;
  });
  document.body.appendChild(labelWrap);

  function setEnabled(v) {
    enabled = v;
    labelWrap.style.display = v ? 'block' : 'none';
    // 退出三视图时复位主相机视口为整屏
    if (!v) {
      const size = renderer.getSize(new THREE.Vector2());
      renderer.setViewport(0, 0, size.x, size.y);
      renderer.setScissorTest(false);
    }
  }

  function render() {
    const size = renderer.getSize(new THREE.Vector2());
    const W = size.x;
    const H = size.y;

    if (!enabled) {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, W, H);
      renderer.render(scene, mainCamera);
      return;
    }

    const hw = W / 2;
    const hh = H / 2;
    const aspect = hw / hh;

    updateOrthoFrustum(topCam, aspect);
    updateOrthoFrustum(frontCam, aspect);
    updateOrthoFrustum(sideCam, aspect);

    // WebGL 视口原点在左下；四象限 [相机, x, y]
    const quads = [
      [mainCamera, 0, hh],  // 左上：透视
      [topCam, hw, hh],     // 右上：顶视
      [frontCam, 0, 0],     // 左下：前视
      [sideCam, hw, 0],     // 右下：侧视
    ];

    renderer.setScissorTest(true);
    for (const [cam, x, y] of quads) {
      renderer.setViewport(x, y, hw, hh);
      renderer.setScissor(x, y, hw, hh);
      renderer.render(scene, cam);
    }
    renderer.setScissorTest(false);
  }

  // 滚轮缩放：按光标所在象限分发
  // 透视象限 → 沿视线推拉主相机；三正交象限 → 各调自身 zoom
  const ZOOM_STEP = 1.12;
  const _size = new THREE.Vector2();
  const _ray = new THREE.Vector3();

  /**
   * @returns {boolean} 是否已处理（已处理则调用方应 preventDefault）
   */
  function handleWheel(e) {
    if (!enabled || e.shiftKey) return false; // 单视图、或 Shift（握力）不接管
    renderer.getSize(_size);
    const left = e.clientX < _size.x / 2;
    const top = e.clientY < _size.y / 2;
    const f = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP; // 下滚缩小、上滚放大

    if (top && left) {
      // 透视象限：沿 target→相机 方向推拉
      _ray.copy(mainCamera.position).sub(target);
      const dist = Math.max(0.5, Math.min(50, _ray.length() / f));
      _ray.setLength(dist);
      mainCamera.position.copy(target).add(_ray);
    } else {
      const cam = (top && !left) ? topCam : (!top && left) ? frontCam : sideCam;
      cam.zoom = Math.max(0.2, Math.min(8, cam.zoom * f));
      cam.updateProjectionMatrix();
    }
    return true;
  }

  return {
    render,
    isEnabled: () => enabled,
    toggle: () => { setEnabled(!enabled); return enabled; },
    setEnabled,
    handleWheel,
  };
}
