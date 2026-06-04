const FRAME_HEADER = 0xaa;
const FRAME_FOOTER = 0x55;
const TOTAL_CHANNELS = 15;

export async function connectSerial() {
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: 115200 });
  return port;
}

export async function sendFrame(port, values) {
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

  const writer = port.writable.getWriter();
  await writer.write(frame);
  writer.releaseLock();
}
