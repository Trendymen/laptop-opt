export const captureProfiles = Object.freeze([
  Object.freeze({
    id: 'pc',
    viewport: Object.freeze({ width: 1440, height: 900 }),
    deviceScaleFactor: 2,
    output: 'output/playwright/pc-1440-2x.png',
  }),
  Object.freeze({
    id: 'mobile',
    viewport: Object.freeze({ width: 390, height: 844 }),
    deviceScaleFactor: 3,
    output: 'output/playwright/mobile-390-3x.png',
  }),
]);

export function expectedPixelWidth(profile) {
  return profile.viewport.width * profile.deviceScaleFactor;
}
