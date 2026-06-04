export const TOTAL_CHANNELS = 15;

export function createOutputFrame(channelId, intensity) {
  const values = new Uint8Array(TOTAL_CHANNELS);
  const safeChannel = Number.isFinite(channelId) ? channelId : 0;
  const safeIntensity = Math.max(0, Math.min(255, Math.round(intensity)));

  if (safeChannel >= 0 && safeChannel < TOTAL_CHANNELS) {
    values[safeChannel] = safeIntensity;
  }

  return values;
}

export function createAllOffFrame() {
  return new Uint8Array(TOTAL_CHANNELS);
}

export function estimateVoltageAndPressure(value) {
  const v = Math.max(0, Math.min(255, Number(value) || 0));

  if (v <= 0) {
    return { voltage: 0, pressure: 0 };
  }

  // 基础演示：0~255 约映射为 0.10~0.50 V
  const voltage = 0.10 + (v / 255) * 0.40;

  // 参考基础标定趋势：0.10~0.50 V 约对应 5~46 kPa
  const pressure = 5 + ((voltage - 0.10) / 0.40) * 41;

  return {
    voltage: Number(voltage.toFixed(2)),
    pressure: Number(pressure.toFixed(1)),
  };
}
