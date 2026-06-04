export function setupScene(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // 原主题背景可以保留简单灰背景
  ctx.fillStyle = '#eee';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // 基础几何体
  ctx.fillStyle = 'red';
  ctx.fillRect(50, 50, 50, 50); // 正方体
  ctx.fillStyle = 'green';
  ctx.beginPath();
  ctx.arc(200, 75, 25, 0, 2 * Math.PI); // 球体
  ctx.fill();
  ctx.fillStyle = 'blue';
  ctx.fillRect(300, 50, 30, 80); // 圆柱体
}
