export function createScene(canvas) {
  const ctx = canvas.getContext('2d');

  const state = {
    width: window.innerWidth,
    height: window.innerHeight,
    scale: 1,
    rotation: 0,
    isDragging: false,
    lastX: 0,
    activeObject: 'sphere',
    viewsOn: false,
  };

  const objects = [
    { id: 'sphere', label: 'Sphere', x: -180, y: 0, type: 'circle', color: '#ffcc00' },
    { id: 'box', label: 'Box', x: 0, y: 0, type: 'box', color: '#3aa0ff' },
    { id: 'cylinder', label: 'Cylinder', x: 180, y: 0, type: 'cylinder', color: '#50d050' },
  ];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    state.width = canvas.width;
    state.height = canvas.height;
  }

  function transformPoint(x, y) {
    const cos = Math.cos(state.rotation);
    const sin = Math.sin(state.rotation);

    return {
      x: state.width / 2 + (x * cos - y * sin) * state.scale,
      y: state.height / 2 + (x * sin + y * cos) * state.scale,
    };
  }

  function drawGrid() {
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;

    const step = Math.max(16, 40 * state.scale);
    for (let x = (state.width / 2) % step; x < state.width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, state.height);
      ctx.stroke();
    }

    for (let y = (state.height / 2) % step; y < state.height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(state.width, y);
      ctx.stroke();
    }
  }

  function drawObject(obj) {
    const p = transformPoint(obj.x, obj.y);
    const active = obj.id === state.activeObject;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(state.rotation);
    ctx.scale(state.scale, state.scale);

    ctx.fillStyle = obj.color;
    ctx.strokeStyle = active ? '#fff' : 'rgba(255,255,255,0.55)';
    ctx.lineWidth = active ? 4 / state.scale : 2 / state.scale;

    if (obj.type === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, 44, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    if (obj.type === 'box') {
      ctx.fillRect(-42, -42, 84, 84);
      ctx.strokeRect(-42, -42, 84, 84);
    }

    if (obj.type === 'cylinder') {
      ctx.beginPath();
      ctx.ellipse(0, -42, 38, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillRect(-38, -42, 76, 84);
      ctx.strokeRect(-38, -42, 76, 84);

      ctx.beginPath();
      ctx.ellipse(0, 42, 38, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();

    ctx.fillStyle = active ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.65)';
    ctx.font = active ? 'bold 13px system-ui' : '13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(obj.label, p.x, p.y + 72 * state.scale);
  }

  function drawHandHint() {
    const palm = transformPoint(-20, 145);

    ctx.save();
    ctx.globalAlpha = 0.58;
    ctx.fillStyle = '#ffcc00';
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(palm.x, palm.y, 24 * state.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    for (let i = 0; i < 5; i++) {
      const tip = transformPoint(-90 + i * 45, 75 - Math.abs(i - 2) * 10);
      ctx.beginPath();
      ctx.moveTo(palm.x, palm.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 10 * state.scale, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawViewLines() {
    if (!state.viewsOn) return;

    ctx.strokeStyle = 'rgba(120,170,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(state.width / 2, 0);
    ctx.lineTo(state.width / 2, state.height);
    ctx.moveTo(0, state.height / 2);
    ctx.lineTo(state.width, state.height / 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(120,170,255,0.65)';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Perspective', state.width * 0.25, 24);
    ctx.fillText('Top', state.width * 0.75, 24);
    ctx.fillText('Front', state.width * 0.25, state.height / 2 + 24);
    ctx.fillText('Side', state.width * 0.75, state.height / 2 + 24);
  }

  function render() {
    ctx.clearRect(0, 0, state.width, state.height);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, state.width, state.height);

    drawGrid();
    objects.forEach(drawObject);
    drawHandHint();
    drawViewLines();

    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Basic geometry scene: sphere / box / cylinder', state.width / 2, state.height - 26);
  }

  canvas.addEventListener('mousedown', (e) => {
    state.isDragging = true;
    state.lastX = e.clientX;
  });

  window.addEventListener('mouseup', () => {
    state.isDragging = false;
  });

  window.addEventListener('mousemove', (e) => {
    if (!state.isDragging) return;
    const dx = e.clientX - state.lastX;
    state.lastX = e.clientX;
    state.rotation += dx * 0.006;
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    state.scale = Math.max(0.55, Math.min(2.2, state.scale * factor));
  }, { passive: false });

  window.addEventListener('resize', resize);
  resize();

  return {
    canvas,
    render,
    state,
    setActiveObject(id) {
      state.activeObject = id;
    },
    toggleViews() {
      state.viewsOn = !state.viewsOn;
      return state.viewsOn;
    },
  };
}
