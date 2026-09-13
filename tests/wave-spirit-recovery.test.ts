import { describe, expect, it, vi } from 'vitest';
import { World } from '../src/game/world';
import { helpPanel } from '../src/ui/help-panel';

function ready(wave = 1) {
  const w = new World({roguelike:true});
  w.chooseDestiny({serial:1,fate:'slayer',boon:'three',tier:'ordinary',roots:['metal']});
  w.wave=wave-1; w.startWave();
  vi.spyOn(w,'regeneration','get').mockReturnValue(0);
  markCleared(w);
  return w;
}
function markCleared(w: World) {
  vi.spyOn(w.assault,'tick').mockImplementation(()=>{});
  vi.spyOn(w.assault,'finished','get').mockReturnValue(true);
}

describe('fixed wave-clear spirit recovery', () => {
  it.each([[0,50],[49,99],[50,100],[80,100],[100,100],[-20,30]])('settles %s spirit to %s once', (before,after) => {
    const w=ready(); w.spirit=before!;
    w.tick(1/60); expect(w.phase).toBe('rest'); expect(w.spirit).toBe(after);
    expect(w.ledger.earned).toBe(after!-before!);
    w.tick(20); w.rerollRewards(); expect(w.spirit).toBe(after); expect(w.ledger.earned).toBe(after!-before!);
  });
  it('does not recover at wave start or before all enemies have spawned', () => {
    const w=ready(); w.spirit=10;
    vi.spyOn(w.assault,'finished','get').mockReturnValue(false);
    w.startWave(); w.tick(1/60); expect(w.phase).toBe('battle'); expect(w.spirit).toBe(10);
  });
  it('does not grant recovery on defeat even when the arrival queue is finished', () => {
    const w=ready(); w.spirit=10; w.health=0;
    w.tick(1/60); expect(w.phase).toBe('lost'); expect(w.spirit).toBe(10); expect(w.ledger.earned).toBe(0);
  });
  it('recovers on final victory and future waves without double-paying continuation', () => {
    const w=ready(10); w.spirit=10;
    w.tick(1/60); expect(w.phase).toBe('won'); expect(w.spirit).toBe(60);
    w.continueRun(); w.continueRun(); expect(w.phase).toBe('rest'); expect(w.spirit).toBe(60);
    const choice=w.build.offers.find(r=>!['common-capacity','replenish'].includes(r.id))!;
    w.chooseUpgrade(choice.id); expect(w.spirit).toBe(60);
    w.startWave(); expect(w.wave).toBe(11); expect(w.spirit).toBe(60);
    markCleared(w); w.spirit=20; w.tick(1/60);
    expect(w.phase).toBe('rest'); expect(w.spirit).toBe(70); expect(w.ledger.earned).toBe(100);
  });
  it('explains the fixed recovery in the handbook', () => {
    expect(helpPanel()).toContain('每波结束恢复 50');
  });
});
