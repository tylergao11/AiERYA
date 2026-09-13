import { afterEach, describe, expect, it, vi } from 'vitest';
import { World } from '../src/game/world';
import { SlayerVfx } from '../src/render/slayer-vfx';
import { paintSlayerImpact, paintOpeningImpact, paintReturnImpact } from '../src/render/slayer-blade';
import { paintCharge, strokeCaptionOffset } from '../src/render/slayer-charge';
import { SceneImpact } from '../src/render/impact-motion';
import type { GameEvents } from '../src/game/contracts';

afterEach(() => vi.unstubAllGlobals());
function fixture(reduced = false) {
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
  const world = new World({ roguelike: true });
  world.chooseDestiny({ serial: 1, fate: 'slayer', roots: ['metal'], tier: 'ordinary', boon: 'three' });
  const vfx = new SlayerVfx(world); return { world, vfx };
}
const impact: GameEvents['slayerStrike'] = { at: { x: -6, z: 4 }, direction: { x: 1, z: 0 }, element: 'metal', level: 3, hits: 12, kills: 8, investment: 2.6, combo: 40, tier: 3, burst: 1 };
const invoke: GameEvents['invoke'] = { points: [{ x: -8, z: 4 }, { x: -4, z: 4 }], element: 'metal', source: { x: -8, z: 4 }, combo: false, charge: 3 };
function canvas() {
  const commands: { name: string; args: unknown[] }[] = [];
  const context = new Proxy({ globalAlpha: 1 }, {
    get(target, key) {
      if (key in target) return Reflect.get(target, key);
      return (...args: unknown[]) => { commands.push({ name: String(key), args }); return key === 'createRadialGradient' ? { addColorStop: vi.fn() } : undefined; };
    },
  }) as unknown as CanvasRenderingContext2D;
  return { context, commands };
}

describe('slayer presentation lifecycle and motion budget', () => {
  it('keeps the reverse trail on a miss but reserves return impacts and shake for actual contacts', () => {
    const {world,vfx}=fixture(),motion=new SceneImpact(world),kick=vi.spyOn(motion.motion,'kick');
    const event:GameEvents['slayerReturn']={at:{x:-4,z:4},element:'metal',points:[{x:-4,z:4},{x:-8,z:4}],direction:{x:-1,z:0},investment:1,hits:0,guarded:0,contacts:[]};
    try{
      world.events.emit('slayerReturn',event);expect(vfx.objectCount).toBe(1);expect(kick).not.toHaveBeenCalled();
      const {context,commands}=canvas();vfx.update(.08);vfx.paint(context);expect(commands.some(c=>c.name==='rotate'&&Math.abs(Number(c.args[0])-Math.PI)<.001)).toBe(true);
      vfx.update(.4);world.events.emit('slayerReturn',{...event,hits:3,guarded:3});expect(vfx.objectCount).toBe(1);expect(kick).not.toHaveBeenCalled();
      vfx.update(.4);world.events.emit('slayerReturn',{...event,hits:72,contacts:Array.from({length:72},(_,i)=>({x:i*3,z:4}))});
      expect(vfx.objectCount).toBe(9);expect(kick).toHaveBeenCalledOnce();
      world.events.emit('phase',{phase:'rest'});expect(vfx.objectCount).toBe(0);
    }finally{vfx.dispose();motion.dispose();}
  });
  it('keeps a readable return edge with reduced motion while removing its sparks', () => {
    const normal=canvas(),reduced=canvas();paintReturnImpact(normal.context,.06,.32,Math.PI,false);paintReturnImpact(reduced.context,.06,.32,Math.PI,true);
    expect(reduced.commands.length).toBeLessThan(normal.commands.length);expect(reduced.commands.some(c=>c.name==='fill')).toBe(true);
    for(const c of normal.commands)for(const n of c.args)if(typeof n==='number')expect(Number.isFinite(n)).toBe(true);
  });
  it('shows pursuit contact on survivors without requiring a kill and caps its AOE effects', () => {
    const { world, vfx } = fixture();
    try {
      const openings = Array.from({length:72}, (_, i) => ({x:(i % 12)*3,z:Math.floor(i / 12)*3}));
      world.events.emit('slayerStrike', {...impact,level:0,kills:0,openings,hits:72});
      expect(vfx.objectCount).toBe(8);
      const before=[world.health,world.spirit,world.kills], c=canvas();vfx.update(.08);vfx.paint(c.context,.2);
      expect(c.commands.filter(x=>x.name==='rotate').length).toBeGreaterThan(8);
      expect([world.health,world.spirit,world.kills]).toEqual(before);
      vfx.update(.4); expect(vfx.objectCount).toBe(0);
      world.events.emit('slayerStrike',{...impact,level:0,kills:0,hits:72,openings:Array.from({length:72},()=>({x:0,z:4}))});
      expect(vfx.objectCount).toBe(1);
    } finally { vfx.dispose(); }
  });
  it('removes pursuit fragments for reduced motion while keeping a finite contact silhouette', () => {
    const normal=canvas(), reduced=canvas();
    paintOpeningImpact(normal.context,.06,.38,.3,false);paintOpeningImpact(reduced.context,.06,.38,.3,true);
    expect(reduced.commands.length).toBeLessThan(normal.commands.length);
    expect(reduced.commands.filter(c=>c.name==='fill').length).toBeGreaterThan(0);
    for(const c of normal.commands)for(const n of c.args)if(typeof n==='number')expect(Number.isFinite(n)).toBe(true);
  });
  it('shows only affordable charge progress and a visible reason instead of a full-power prompt', () => {
    const {context,commands}=canvas();
    paintCharge(context,{x:0,y:0},{seconds:1.2,level:1,cost:4.2,width:1.725,limited:true},'metal',.2);
    expect(commands.some(c=>c.name==='fillText'&&c.args[0]==='灵力受限 · 蓄势')).toBe(true);
    const progress=commands.filter(c=>c.name==='arc').at(-1)!;
    expect(Number(progress.args[4])-Number(progress.args[3])).toBeCloseTo(2*Math.PI/3);
    const empty=canvas();paintCharge(empty.context,{x:0,y:0},{seconds:1.2,level:0,cost:3,width:1.5,limited:true,unaffordable:true},'metal',.2);
    expect(empty.commands.some(c=>c.name==='fillText'&&c.args[0]==='灵力不足 · 缩短划线')).toBe(true);
  });
  it('keeps charge and cost captions readable at all four corners of a portrait view', () => {
    for(const height of [187,200,371])for(const x of [0,320])for(const y of [0,height])for(const preferredY of [-50,45]){
      const bounds={x:-x,y:-y,width:320,height},p=strokeCaptionOffset(170,preferredY,bounds);
      expect(x+p.x-85).toBeGreaterThanOrEqual(0);expect(x+p.x+85).toBeLessThanOrEqual(320);
      expect(y+p.y-14).toBeGreaterThanOrEqual(0);expect(y+p.y+3).toBeLessThanOrEqual(height);
    }
  });
  it('keeps all guard contacts but only one enlarged annotation on a small screen', () => {
    const { world, vfx } = fixture();
    try {
      for (let i = 0; i < 8; i++) world.events.emit('slayerGuarded', { at: { x: i * 3, z: 4 }, targetId: i, amount: 100 });
      const phone = canvas(); vfx.paint(phone.context, .24);
      expect(phone.commands.filter(c => c.name === 'arc')).toHaveLength(8);
      expect(phone.commands.filter(c => c.name === 'fillText' && c.args[0] === '弹刀 · 火破')).toHaveLength(1);
      const desktop = canvas(); vfx.paint(desktop.context, 1);
      expect(desktop.commands.filter(c => c.name === 'fillText' && c.args[0] === '弹刀 · 火破')).toHaveLength(8);
    } finally { vfx.dispose(); }
  });
  it('keeps a fixed budget during a burst of many casts, and expires every visual', () => {
    const { world, vfx } = fixture();
    try {
      for (let i = 0; i < 500; i++) { world.events.emit('invoke', invoke); world.events.emit('slayerStrike', impact); world.events.emit('slayerFinisher', { at: impact.at, element: 'metal' }); }
      expect(vfx.objectCount).toBeLessThanOrEqual(14);
      vfx.update(1); expect(vfx.objectCount).toBe(0);
    } finally { vfx.dispose(); }
  });
  it('clears effects at a wave boundary and disconnects them after disposal', () => {
    const { world, vfx } = fixture();
    world.events.emit('invoke', invoke); world.events.emit('slayerStrike', impact); expect(vfx.objectCount).toBeGreaterThan(0);
    world.events.emit('phase', { phase: 'rest' }); expect(vfx.objectCount).toBe(0);
    world.events.emit('slayerStrike', impact); vfx.dispose(); world.events.emit('slayerStrike', impact); expect(vfx.objectCount).toBe(0);
  });
  it('keeps deflections inside the shared budget and only gives a real finisher its hit burst', () => {
    const { world, vfx } = fixture(), motion = new SceneImpact(world), kick = vi.spyOn(motion.motion, 'kick');
    try {
      for (let i = 0; i < 100; i++) world.events.emit('slayerGuarded', { at: { x: i * 3, z: 4 }, targetId: i, amount: 100 });
      expect(vfx.objectCount).toBe(8); vfx.update(.5); expect(vfx.objectCount).toBe(0);
      for (const result of [{ hits: 0 }, { hits: 3, guarded: 3 }]) world.events.emit('slayerFinisher', { at: impact.at, element: 'metal', ...result });
      expect(vfx.objectCount).toBe(0); expect(kick).not.toHaveBeenCalled();
      world.events.emit('slayerFinisher', { at: impact.at, element: 'metal', hits: 3, guarded: 2 });
      expect(vfx.objectCount).toBe(1); expect(kick).toHaveBeenCalledWith(7.5, 7.5);
      vfx.update(.81); expect(vfx.objectCount).toBe(0);
      world.events.emit('slayerStrike', { ...impact, level: 0, kills: 0, rush: .6 });
      expect(vfx.objectCount).toBe(1); vfx.update(.37); expect(vfx.objectCount).toBe(0);
    } finally { motion.dispose(); vfx.dispose(); }
  });
  it('does not produce a hit burst for empty swings or change the world while rendering', () => {
    const { world, vfx } = fixture();
    try {
      world.events.emit('slayerStrike', { ...impact, hits: 0, kills: 0 }); expect(vfx.objectCount).toBe(0);
      world.events.emit('slayerStrike', impact); const before = [world.spirit, world.health, world.kills, world.time];
      const { context } = canvas(); vfx.update(.1); vfx.ground(context); vfx.paint(context);
      expect([world.spirit, world.health, world.kills, world.time]).toEqual(before);
    } finally { vfx.dispose(); }
  });
  it('reduced motion removes moving fragments, light bloom and animated charge particles', () => {
    const normal = canvas(), reduced = canvas();
    paintSlayerImpact(normal.context, .1, .8, .6, 3, 12, '#f9e2a0', true, false);
    paintSlayerImpact(reduced.context, .1, .8, .6, 3, 12, '#f9e2a0', true, true);
    expect(reduced.commands.some(c => c.name === 'createRadialGradient')).toBe(false);
    expect(reduced.commands.length).toBeLessThan(normal.commands.length / 3);
    const charge = { seconds: 1.2, level: 3, cost: 7.8, width: 2.625, limited: false, holding: true };
    const a = canvas(), b = canvas(); paintCharge(a.context, { x: 20, y: 20 }, charge, 'metal', .3, 5, false); paintCharge(b.context, { x: 20, y: 20 }, charge, 'metal', .3, 5, true);
    expect(b.commands.length).toBeLessThan(a.commands.length);
  });
  it('all five elemental silhouettes remain finite across their full reveal and decay', () => {
    const { context, commands } = canvas();
    for (const tint of ['#f9e2a0', '#6ce4de', '#ff8c42', '#a7d475', '#d6ad71']) for (const age of [0, .025, .1, .3, .55, .8]) paintSlayerImpact(context, age, .8, -.4, 3, 8, tint, true, false);
    for (const c of commands) for (const v of c.args) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
  });
});
