export function createOutputFrame(channelId, intensity) {
  const values = new Uint8Array(15);
  const safeIntensity = Math.max(0, Math.min(255, intensity));
  if (channelId >= 0 && channelId < 15) {
    values[channelId] = safeIntensity;
  }
  return values;
}

export function createAllOffFrame() {
  return new Uint8Array(15);
}
