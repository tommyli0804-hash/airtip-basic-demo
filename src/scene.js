
export function createScene(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#111';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // 只显示三个基本体
  ctx.fillStyle = 'red';
  ctx.fillRect(50,50,50,50); // 方体
  ctx.fillStyle = 'green';
  ctx.beginPath();
  ctx.arc(200,75,25,0,2*Math.PI); // 球体
  ctx.fill();
  ctx.fillStyle = 'blue';
  ctx.fillRect(300,50,30,80); // 圆柱体
}
