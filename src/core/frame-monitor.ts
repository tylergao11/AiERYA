export interface FrameSample { elapsed: number; simulation: number; render: number; ui: number; painted: boolean }
export class FrameMonitor {
  private samples: FrameSample[] = [];
  add(sample: FrameSample): void { this.samples.push(sample); if (this.samples.length > 300) this.samples.shift(); }
  summary() {
    const samples=this.samples, count=samples.length, sorted=samples.map(s=>s.elapsed).sort((a,b)=>a-b);
    const total=samples.reduce((sum,s)=>sum+s.elapsed,0), average=(key:'simulation'|'render'|'ui')=>samples.reduce((sum,s)=>sum+s[key],0)/Math.max(1,count);
    return { count, fps:total?count*1000/total:0, paintFps:total?samples.filter(s=>s.painted).length*1000/total:0,
      p95:sorted[Math.max(0,Math.ceil(count*.95)-1)]??0, simulation:average('simulation'),render:average('render'),ui:average('ui'),slow:samples.filter(s=>s.elapsed>34).length };
  }
}

/** Opt-in local diagnostics; never visible in a normal game session. */
export function performancePanel(canvas: HTMLCanvasElement) {
  if (!new URLSearchParams(location.search).has('perf')) return null;
  const output=document.createElement('output'),monitor=new FrameMonitor();
  output.id='performance';output.setAttribute('aria-label','运行性能');
  output.style.cssText='position:fixed;z-index:1000;left:4px;top:4px;white-space:pre;background:#07151fed;color:#e2efd8;font:11px/1.4 monospace;padding:5px;pointer-events:none';document.body.append(output);
  let next=0;
  return { add(sample:FrameSample) { monitor.add(sample); if(performance.now()<next)return;next=performance.now()+1000;
    const m=monitor.summary();output.textContent=`${innerWidth}×${innerHeight} · canvas ${canvas.width}×${canvas.height}\nFPS ${m.fps.toFixed(1)} · 绘制 ${m.paintFps.toFixed(1)} · P95 ${m.p95.toFixed(1)}ms\n逻辑 ${m.simulation.toFixed(2)} · 绘制 ${m.render.toFixed(2)} · UI ${m.ui.toFixed(2)}ms\n样本 ${m.count} · >34ms ${m.slow}`;
  }, dispose(){output.remove();} };
}
