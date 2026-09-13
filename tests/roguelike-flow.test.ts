import { afterEach, describe, expect, it, vi } from 'vitest';
import { distance, random } from '../src/core/math';
import { World } from '../src/game/world';
import { DrawingInput } from '../src/ui/input';
import type { SceneView } from '../src/render/view';
import type { GameInterface } from '../src/ui/interface';
import { OVERCOMES } from '../src/game/combat';
import type { Element } from '../src/game/contracts';
import type { Reward } from '../src/game/roguelike';
import { CAMPAIGN_WAVES, encounter } from '../src/game/encounters';

afterEach(() => vi.unstubAllGlobals());
describe('roguelike input and natural run progression', () => {
  it('requires a drawn loop for ancient arrays; living-array open drags still move the completed shape', () => {
    vi.stubGlobal('window', new EventTarget()); const w = new World({ roguelike: true });
    w.chooseDestiny({ serial: 1, fate: 'array', roots: ['fire'], tier: 'unusual', boon: 'living' });
    const canvas = Object.assign(new EventTarget(), { setPointerCapture: vi.fn() });
    const input = new DrawingInput(w, { canvas, previewRemoval: vi.fn(), preview: vi.fn(), pick: (x: number, z: number) => ({ x, z }) } as unknown as SceneView, { blocked: false } as GameInterface);
    const send = (type: string, x: number, z: number) => canvas.dispatchEvent(Object.assign(new Event(type), { button: 0, pointerId: 1, clientX: x, clientY: z }));
    try {
      send('pointerdown', -6, 4); send('pointerup', -6, 4); expect(w.wards).toHaveLength(0);
      send('pointerdown', -9, 1); send('pointermove', -3, 1); send('pointermove', -3, 7); send('pointermove', -9, 7); send('pointerup', -9, 1);
      expect(w.wards).toHaveLength(1); expect(w.wards[0]!.power.area).toBeCloseTo(36); expect(w.spirit).toBe(100); w.startWave();
      send('pointerdown', -6, 4); send('pointerup', 3, 4); expect(w.wards[0]!.x).toBeCloseTo(3); expect(w.spirit).toBe(90); } finally { input.dispose(); }
  });
  it('progresses through dense waves with elemental play and offers continuation without resetting the build', () => {
    const w = new World({ roguelike: true, random: random(73451) });
    // Choose a naturally produced metal slayer; no hand-granted rewards, energy or kills.
    for (let i = 0; i < 2000; i++) { const d = w.fateRoller.current; if (d.fate === 'slayer' && d.roots.includes('metal') && d.tier === 'heaven') break; w.fateRoller.roll(); }
    expect(w.chooseDestiny()).toBe(true); w.selectElement('metal');
    const phases = new Set<string>(), waves = new Set<number>(), chosen: Reward[] = [];
    for (let frame = 0; frame < 60 * 1050 && w.phase !== 'won' && w.phase !== 'lost'; frame++) {
      phases.add(w.phase); waves.add(w.wave);
      if (w.phase === 'prepare') w.startWave();
      if (w.phase === 'rest') {
        const priority = (id: string): number => id === 'awaken' || id === 'ascend' ? 100 : id.startsWith('slayer-') ? 80 : id.startsWith('opportunity-') ? 60 : id === 'common-regen' ? 50 : id === 'common-spell' ? 40 : 0;
        let offers = [...w.build.offers].sort((a, b) => priority(b.id) - priority(a.id));
        if (priority(offers[0]!.id) < 80 && w.rerollRewards()) offers = [...w.build.offers].sort((a, b) => priority(b.id) - priority(a.id));
        chosen.push(offers[0]!); w.chooseUpgrade(offers[0]!.id);
      }
      if (w.phase === 'battle') {
        const alive=w.wolves.filter(v=>v.action!=='dead').sort((a,b)=>distance(a,w.camp)-distance(b,w.camp));
        if(w.ultimate.available&&(alive.length>=20||alive.some(v=>v.kind==='king')))w.startUltimate();
        if(frame%24===0&&alive.length){
          const counter=alive.find(v=>w.enemyAbilities.counterAura(v)&&(w.enemyAbilities.casting(v.id)||distance(v,w.camp)<12));
          const target=counter??alive[0]!;const nearby=alive.filter(v=>distance(v,target)<3.2);
          w.selected=counter?(Object.keys(OVERCOMES)as Element[]).find(e=>OVERCOMES[e]===w.enemyAbilities.counterAura(counter))!:target.burning>.3&&nearby.length>=3?'wood':nearby.length>=3?'fire':'metal';
          const neighbor=nearby.find(v=>v!==target),len=w.ultimate.active?8:4,d=neighbor?distance(neighbor,target)||1:1;
          const dx=neighbor?(neighbor.x-target.x)/d:1,dz=neighbor?(neighbor.z-target.z)/d:0;
          const path=[{x:target.x-dx*len*.25,z:target.z-dz*len*.25},{x:target.x+dx*len*.75,z:target.z+dz*len*.75}];
          if(w.spirit>=w.strokeCost(path))w.invoke(path);
        }
        w.tick(1 / 60);
      }
    }
    expect(w.phase).toBe('won'); expect(phases.has('rest')).toBe(true); expect(waves.has(CAMPAIGN_WAVES)).toBe(true);
    expect(chosen).toHaveLength(CAMPAIGN_WAVES-1); for(const r of chosen) expect(r.boon ? w.build.has(r.boon) : w.build.level(r.id)>0 || r.id==='awaken' || r.id==='ascend').toBe(true);
    expect(w.health).toBeGreaterThan(0); expect(w.time).toBeLessThan(1050);
    expect(w.kills).toBeGreaterThanOrEqual(Array.from({length:CAMPAIGN_WAVES},(_,i)=>encounter(i+1).count).reduce((n,c)=>n+c,0));
    const destiny=w.build.destiny;w.continueRun();expect(w.phase).toBe('rest');expect(w.build.destiny).toEqual(destiny);
    const revision=w.build.revision;w.chooseUpgrade(w.build.offers[0]!.id);w.startWave();expect(w.wave).toBe(CAMPAIGN_WAVES+1);expect(w.build.revision).toBeGreaterThan(revision);
  }, 30000);
});
