export interface ScreenInsets { top: number; right: number; bottom: number; left: number }
export function landscapeViewport(width: number, height: number, insets: ScreenInsets) {
  const availableWidth = Math.max(1, width - insets.left - insets.right);
  const availableHeight = Math.max(1, height - insets.top - insets.bottom);
  const portrait = availableHeight > availableWidth;
  return {
    width: portrait ? availableHeight : availableWidth,
    height: portrait ? availableWidth : availableHeight,
    left: insets.left + (portrait ? availableWidth : 0),
    top: insets.top,
    angle: portrait ? 90 : 0,
  };
}
