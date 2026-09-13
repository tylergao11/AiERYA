import { describe, expect, it } from 'vitest';
import { CAMPAIGN_WAVES, ENCOUNTERS, encounter, type WaveSpawn } from '../src/game/encounters';
import { WaveDirector } from '../src/game/wave-director';
import { World } from '../src/game/world';

describe('continuous ten-wave night', () => {
  it('sustains irregular, dispersed low-health arrivals, with a release at six and a final king', () => {
    const plans = Array.from({ length: CAMPAIGN_WAVES }, (_, i) => encounter(i + 1));
    expect(plans.map(p => p.count)).toEqual([96,132,168,192,240,288,276,312,336,360]);
    expect(plans.map(p => p.health)).toEqual([18,21,24,27,30,21,31.5,33,34.5,36]);
    expect(plans[0]!.spawns.filter(s => s.kind === 'elite')).toHaveLength(2);
    expect(plans[1]!.spawns.filter(s=>s.eliteSkill).map(s=>s.eliteSkill)).toEqual(['call','call']);
    expect(plans.slice(0,9).flatMap(p=>p.spawns).some(s=>s.kind==='king')).toBe(false);
    expect(plans[9]!.spawns.filter(s=>s.kind==='king')).toHaveLength(1);
    expect(plans[5]!.health).toBeLessThan(plans[4]!.health);
    expect(plans[5]!.count).toBeGreaterThan(plans[4]!.count);
    for(const p of plans){
      expect(p.spawns.filter(s=>s.kind==='normal').length/p.count).toBeGreaterThan(.88);
      expect(new Set(p.spawns.map(s=>s.entrance)).size).toBe(3);
      expect(Math.max(...p.spawns.map(s=>s.spreadX))-Math.min(...p.spawns.map(s=>s.spreadX))).toBeGreaterThan(10);
      expect(Math.max(...p.spawns.map(s=>s.pace))-Math.min(...p.spawns.map(s=>s.pace))).toBeGreaterThan(.4);
      for(let i=1;i<p.count;i++){
        expect(p.spawns[i]!.at).toBeGreaterThan(p.spawns[i-1]!.at);
        expect(p.spawns[i]!.at-p.spawns[i-1]!.at).toBeLessThan(1);
      }
    }
  });
  it('does not end while arrivals remain and emits every scheduled enemy', () => {
    const d=new WaveDirector(8),arrivals:WaveSpawn[]=[];
    for(let i=0;i<60*90&&!d.finished;i++)d.tick(1/60,t=>{arrivals.push(t);return true;});
    expect(d.finished).toBe(true);expect(arrivals).toEqual(d.plan.spawns);
    const w=new World();w.startWave();w.tick(.61);
    for(const wolf of w.wolves)w.hitRogue(wolf,10000,'metal',{kind:'manual'});
    w.tick(.01);expect(w.phase).toBe('battle');expect(w.assault.finished).toBe(false);
  });
  it('retains blocked arrivals without dumping the backlog into one frame', () => {
    const d=new WaveDirector(1),arrivals:{ticket:WaveSpawn;time:number}[]=[];
    for(let f=0;f<60*100&&!d.finished;f++)d.tick(1/60,t=>{
      if(d.spawned===11&&d.elapsed<30)return false;
      arrivals.push({ticket:t,time:d.elapsed});return true;
    });
    expect(arrivals.map(a=>a.ticket)).toEqual(d.plan.spawns);
    expect(arrivals[11]!.time).toBeGreaterThanOrEqual(30);
    for(let i=1;i<arrivals.length;i++)expect(arrivals[i]!.time-arrivals[i-1]!.time+1e-8).toBeGreaterThanOrEqual(d.plan.spawns[i]!.at-d.plan.spawns[i-1]!.at);
  });
  it('caps live enemies and freezes arrivals during time stop and preparation', () => {
    const w=new World();w.wave=5;w.health=100000;w.startWave();
    for(let f=0;f<60*45;f++)w.tick(1/60);
    expect(w.wolves.filter(v=>v.action!=='dead')).toHaveLength(ENCOUNTERS.aliveLimit);
    // Campfire kills free live slots, so lifetime arrivals may exceed the live cap.
    expect(w.assault.spawned).toBeGreaterThanOrEqual(ENCOUNTERS.aliveLimit);
    expect(w.assault.spawned).toBeLessThanOrEqual(w.assault.plan.spawns.length);expect(w.assault.finished).toBe(false);
    const elapsed=w.assault.elapsed;w.startUltimate();w.tick(1);expect(w.assault.elapsed).toBe(elapsed);
    w.ultimate.clear();w.phase='prepare';w.tick(30);expect(w.assault.elapsed).toBe(elapsed);
    w.reset();expect(w.assault.spawned).toBe(0);
  });
  it('refuses early victory and bounds continuation pressure', () => {
    const w=new World({roguelike:true});w.chooseDestiny();w.wave=3;w.finishRun();
    expect(w.phase).toBe('prepare');expect(w.canFinishRun).toBe(false);
    for(const n of [11,14,18,1000,100000]){
      const p=encounter(n);expect(p.count).toBeLessThanOrEqual(360);expect(p.spawns).toHaveLength(p.count);
      expect(p.speed).toBeLessThanOrEqual(3.4);expect(p.campDamage).toBeLessThanOrEqual(6);
    }
  });
});
