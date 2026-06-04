import { TOTAL_CHANNELS } from './interaction.js';

/**
 * 串口通信模块
 *
 * 协议帧格式（25 通道）：
 * [0xAA] [ch0] [ch1] ... [ch24] [checksum] [0x55]
 * - 0xAA: 帧头
 * - ch0~ch24: 5 指 × 5 气囊，每值 0-255
 *   排列：[拇指×5, 食指×5, 中指×5, 无名指×5, 小指×5]
 *   每指内：[tip, pad, dorsal, radial, ulnar]
 * - checksum: 所有 ch 求和取低 8 位
 * - 0x55: 帧尾
 */

const FRAME_HEADER = 0xaa;
const FRAME_FOOTER = 0x55;
const FRAME_SIZE = 1 + TOTAL_CHANNELS + 1 + 1; // header + data + checksum + footer

function buildFrame(pressures) {
  const frame = new Uint8Array(FRAME_SIZE);
  frame[0] = FRAME_HEADER;
  let sum = 0;
  for (let i = 0; i < TOTAL_CHANNELS; i++) {
    frame[1 + i] = pressures[i];
    sum += pressures[i];
  }
  frame[1 + TOTAL_CHANNELS] = sum & 0xff;
  frame[2 + TOTAL_CHANNELS] = FRAME_FOOTER;
  return frame;
}

/** Mock 串口 — 控制台输出，无需硬件 */
export function createMockSerial() {
  let frameCount = 0;

  return {
    type: 'mock',
    async send(pressures) {
      frameCount++;
      if (frameCount % 30 === 0) {
        // 按手指分组显示
        const lines = [];
        const names = ['拇指', '食指', '中指', '无名', '小指'];
        for (let f = 0; f < 5; f++) {
          const offset = f * 5;
          const vals = Array.from(pressures.slice(offset, offset + 5))
            .map((v) => String(v).padStart(3));
          lines.push(`${names[f]}[${vals.join(',')}]`);
        }
        console.log(`[Mock Serial] ${lines.join(' ')}`);
      }
    },
    async disconnect() {},
  };
}

/** 真实 WebSerial 连接 */
export function createWebSerial() {
  let port = null;
  let writer = null;

  return {
    type: 'webserial',
    async connect() {
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      writer = port.writable.getWriter();
    },
    async send(pressures) {
      if (!writer) return;
      const frame = buildFrame(pressures);
      await writer.write(frame);
    },
    async disconnect() {
      if (writer) {
        writer.releaseLock();
        writer = null;
      }
      if (port) {
        await port.close();
        port = null;
      }
    },
  };
}
