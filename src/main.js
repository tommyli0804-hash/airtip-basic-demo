import { setupScene } from './scene.js';
import { connectSerial, sendFrame } from './serial.js';
import { createOutputFrame, createAllOffFrame } from './basic-control.js';
import { CHANNELS } from './channel-map.js';

const canvas = document.getElementById('sceneCanvas');
setupScene(canvas);

let devicePort = null;

document.getElementById('connectBtn').addEventListener('click', async () => {
  devicePort = await connectSerial();
});

document.getElementById('sendBtn').addEventListener('click', () => {
  if (!devicePort) return;
  const channel = parseInt(document.getElementById('channelSelect').value);
  const intensity = parseInt(document.getElementById('intensitySlider').value);
  const frame = createOutputFrame(channel, intensity);
  sendFrame(devicePort, frame);
  // 同时在 UI 显示电压-气压关系（基础线性映射演示）
  const voltage = (intensity / 255 * 0.5 + 0.1).toFixed(2);
  document.getElementById('voltageDisplay').innerText = `DAC输出电压: ${voltage} V`;
});

document.getElementById('resetBtn').addEventListener('click', () => {
  if (!devicePort) return;
  sendFrame(devicePort, createAllOffFrame());
  document.getElementById('voltageDisplay').innerText = 'DAC输出电压: 0 V';
});
