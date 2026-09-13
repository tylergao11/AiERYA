/** CSS coordinates remain unchanged; only the backing texture has a pixel budget. */
export function canvasResolution(width: number, height: number, deviceRatio: number, compact: boolean) {
  width=Math.max(1,Number.isFinite(width)?width:1);height=Math.max(1,Number.isFinite(height)?height:1);
  const dpr=Number.isFinite(deviceRatio)&&deviceRatio>0?deviceRatio:1;
  const ratio=Math.min(dpr,compact?1.5:2,Math.sqrt((compact?1_500_000:3_000_000)/(width*height)),(compact?2560:3840)/Math.max(width,height));
  return { ratio, width:Math.max(1,Math.floor(width*ratio)),height:Math.max(1,Math.floor(height*ratio)) };
}
