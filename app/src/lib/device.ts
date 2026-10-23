export function deviceInfo(): Record<string, unknown> {
  return {
    user_agent: navigator.userAgent,
    language: navigator.language,
    screen_w: window.screen.width,
    screen_h: window.screen.height,
    viewport_w: window.innerWidth,
    viewport_h: window.innerHeight,
    pixel_ratio: window.devicePixelRatio,
    fine_pointer: window.matchMedia('(pointer: fine)').matches,
    touch_points: navigator.maxTouchPoints ?? 0,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/** Solo computadora con mouse/touchpad y ventana de al menos 1024 px. */
export function isDesktopOk(): boolean {
  return window.innerWidth >= 1024 && window.matchMedia('(pointer: fine)').matches;
}
