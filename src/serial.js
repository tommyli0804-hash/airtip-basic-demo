import { TOTAL_CHANNELS } from './basic-control.js';

const FRAME_HEADER = 0xaa;
const FRAME_FOOTER = 0x55;

export function createMockSerial() {
  return {
    connected: false,
    async connect() {
      this.connected = false;
      return true;
    },
    async send(values) {
      console.log('[MockSerial]', Array.from(values));
    },
  };
}

export function createWebSerial() {
  let port = null;

  return {
    connected: false,

    async connect() {
      if (!('serial' in navigator)) {
        throw new Error('当前浏览器不支持 WebSerial，请使用 Chrome 或 Edge');
      }
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      this.connected = true;
      return true;
    },

    async send(values) {
      if (!port || !port.writable) {
        throw new Error('串口未连接');
      }

      const frame = buildFrame(values);
      const writer = port.writable.getWriter();
      await writer.write(frame);
      writer.releaseLock();
    },
  };
}

export function buildFrame(values) {
  const frame = new Uint8Array(1 + TOTAL_CHANNELS + 1 + 1);
  frame[0] = FRAME_HEADER;

  let sum = 0;
  for (let i = 0; i < TOTAL_CHANNELS; i++) {
    const v = values[i] ?? 0;
    frame[1 + i] = v;
    sum += v;
  }

  frame[1 + TOTAL_CHANNELS] = sum & 0xff;
  frame[2 + TOTAL_CHANNELS] = FRAME_FOOTER;

  return frame;
}
