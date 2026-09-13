import { afterEach, describe, expect, it, vi } from 'vitest';
import { random } from '../src/core/math';
import { World } from '../src/game/world';
import type { Wolf } from '../src/game/contracts';
import { DrawingInput } from '../src/ui/input';
import type { SceneView } from '../src/render/view';
import type { GameInterface } from '../src/ui/interface';

afterEach(() => vi.unstubAllGlobals());

function fixture(mixed = true) {
  vi.stubGlobal('window', new EventTarget());
  const world = new World({ roguelike: true, random: random(43721) });
  world.chooseDestiny({ serial: 1, fate: 'slayer', boon: 'three', tier: 'ordinary', roots: ['metal'] });
  if (mixed) {
    world.phase = 'rest';
    for (let i = 0; i < 600 && !world.build.offers.some(r => r.id === 'opportunity-mimic'); i++) world.build.rollOffers(100);
    expect(world.build.offers.some(r => r.id === 'opportunity-mimic')).toBe(true);
    world.chooseUpgrade('opportunity-mimic');
  }
  world.startWave(); world.selected = 'metal';
  const wolf: Wolf = { id: 9900, x: -6, z: 4, kind: 'normal', hp: 10000, maxHp: 10000, speed: 0, heading: 0, action: 'run', age: 0,
    attack: 0, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0, slowAmount: 0, aura: null, auraTime: 0,
    vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null };
  world.wolves = [wolf];
  const canvas = Object.assign(new EventTarget(), { setPointerCapture: vi.fn(), getBoundingClientRect: () => ({ left: 0, top: 0 }) });
  const view = { canvas, preview: vi.fn(), previewRemoval: vi.fn(), pick: (x: number, y: number) => ({ x: -7 + (x - 100) / 4, z: 4 + (y - 100) / 4 }) } as unknown as SceneView;
  let now = 0;
  const ui = { blocked: false, removing: false, strokePreview: null } as GameInterface;
  const input = new DrawingInput(world, view, ui, () => now);
  const send = (type: string, x = 100) => canvas.dispatchEvent(Object.assign(new Event(type), { button: 0, pointerId: 1, clientX: x, clientY: 100 }));
  const hold = (ms: number) => { now += ms; };
  return { world, wolf, input, send, hold, view, ui };
}

describe('Slayer and summoner share a deliberate gesture without swallowing a paid blade', () => {
  it('pulls a return cut as soon as a quick swipe crosses it, without charging while moving', () => {
    const {world,input,send,hold,view,ui}=fixture(false);
    try {
      world.phase='rest';
      for(let i=0;i<600;i++)if(world.build.rollOffers(100).some(r=>r.id==='slayer-return')){world.chooseUpgrade('slayer-return');break;}
      world.startWave();world.invoke([{x:-8,z:4},{x:-4,z:4}],.8);
      const before=world.spirit,returning=vi.fn(),strikes=vi.fn();world.events.on('slayerReturn',returning);world.events.on('slayerStrike',strikes);
      send('pointerdown');send('pointermove',106);hold(100);input.flushPreview();
      expect(world.spirit).toBeLessThan(before);expect(world.slayerTechniques.returnCut).toBeNull();world.mechanics.tick(.1);expect(returning).toHaveBeenCalledOnce();
      expect(strikes).toHaveBeenCalledOnce();expect(strikes.mock.calls[0]![0].level).toBe(0);
      hold(750);input.flushPreview();expect(strikes).toHaveBeenCalledOnce();expect(ui.strokePreview).toBeNull();
      input.cancel();expect(ui.strokePreview).toBeNull();expect(vi.mocked(view.preview).mock.calls.at(-1)![0]).toEqual([]);
    }finally{input.dispose();}
  });
  it('a six-pixel short swipe hits directly and also infuses the companion', () => {
    const { world, wolf, input, send, hold } = fixture();
    const strike = vi.fn(); world.events.on('slayerStrike', strike);
    try {
      send('pointerdown'); send('pointermove', 106); input.flushPreview();expect(strike).toHaveBeenCalledOnce();hold(80); send('pointerup', 106);
      expect(strike).toHaveBeenCalledOnce(); expect(strike.mock.calls[0]![0].level).toBe(0);
      expect(wolf.hp).toBeLessThan(10000); expect(world.spirit).toBeLessThan(100);
      expect(world.mechanics.commands.amount(world.mechanics.spirits[0]!.id)).toBeGreaterThan(0);
    } finally { input.dispose(); }
  });
  it('releases a held charge on a deliberate swipe without needing a preview frame', () => {
    const { world, wolf, input, send, hold } = fixture();
    const strike = vi.fn(); world.events.on('slayerStrike', strike);
    try {
      send('pointerdown'); hold(1200); send('pointerup', 106);
      expect(strike).toHaveBeenCalledOnce(); expect(strike.mock.calls[0]![0].level).toBe(3);
      expect(wolf.hp).toBeLessThan(10000); expect(world.spirit).toBeLessThan(96);
    } finally { input.dispose(); }
  });
  it('still treats a quick tap with two pixels of finger drift as a free command', () => {
    const { world, wolf, input, send, hold } = fixture();
    const strike = vi.fn(); world.events.on('slayerStrike', strike);
    try {
      send('pointerdown'); hold(80); send('pointerup', 102);
      expect(strike).not.toHaveBeenCalled(); expect(wolf.hp).toBe(10000); expect(world.spirit).toBe(100);
      expect(world.mechanics.commands.targetId).toBe(wolf.id);
    } finally { input.dispose(); }
  });
  it('does not turn a stationary charge accelerated by initiative into a companion command',()=>{
    const {world,input,send,hold,ui}=fixture();const command=vi.spyOn(world.mechanics.commands,'command');
    try{
      world.slayerTechniques.initiative=.3;send('pointerdown');hold(200);input.flushPreview();expect(ui.strokePreview?.charge).toBe(1);
      send('pointerup',102);expect(command).not.toHaveBeenCalled();expect(world.spirit).toBe(100);
    }finally{input.dispose();}
  });
  it('cancellation discards the mixed charged gesture and does not leave a delayed cast', () => {
    const { world, wolf, input, send, hold } = fixture();
    try {
      send('pointerdown'); hold(1200); send('pointercancel', 106); send('pointerup', 106);
      expect(world.spirit).toBe(100); expect(wolf.hp).toBe(10000); expect(world.mechanics.commands.targetId).toBeNull();
      send('pointerdown'); hold(80); send('pointerup', 106); expect(wolf.hp).toBeLessThan(10000);
    } finally { input.dispose(); }
  });
  it('pure Slayer ignores a stationary tap with tiny finger drift', () => {
    const { world, input, send, hold } = fixture(false);
    const strike = vi.fn(); world.events.on('slayerStrike', strike);
    try {
      send('pointerdown'); hold(80); send('pointerup', 102);
      expect(strike).not.toHaveBeenCalled(); expect(world.spirit).toBe(100);
    } finally { input.dispose(); }
  });
});
