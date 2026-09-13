import { describe, expect, it, vi } from 'vitest';
import { World } from '../src/game/world';
import { CombatFeedback } from '../src/render/combat-feedback';
import { layoutCombatLabels, type CombatLabel } from '../src/render/combat-labels';
import { slayerDetailScale } from '../src/render/slayer-readability';

function canvas() {
  const drawn: { text: string; size: number }[] = [];
  const context = { font: '', save: vi.fn(), restore: vi.fn(), strokeText: vi.fn(),
    measureText(text: string) { return { width: text.length * parseFloat(this.font.split(' ')[1]!) * .6 }; },
    fillText(text: string) { drawn.push({ text, size: parseFloat(this.font.split(' ')[1]!) }); },
  };
  return { drawn, context: context as unknown as CanvasRenderingContext2D };
}
describe('Slayer annotations remain legible without enlarging their hit areas', () => {
  it('keeps the return number distinct from the triggering quick hit and other echoes', () => {
    const world=new World({roguelike:true});world.chooseDestiny({serial:1,fate:'slayer',boon:'three',tier:'ordinary',roots:['metal']});
    const feedback=new CombatFeedback(world),{context,drawn}=canvas();
    try{
      const event={at:{x:0,z:3},targetId:1,amount:20,element:'metal' as const,source:'spell' as const,ongoing:false};
      world.events.emit('damage',event);world.events.emit('damage',{...event,amount:31,returning:true});world.events.emit('damage',{...event,amount:10});
      feedback.paint(context,.2);expect(drawn[0]!.text).toBe('回锋 31');expect(drawn.some(d=>d.text==='61'||d.text==='回锋 61')).toBe(false);
    }finally{feedback.dispose();}
  });
  it('keeps the actual pursuit number distinct from recent ordinary and later derived damage', () => {
    const world = new World({roguelike:true});
    world.chooseDestiny({serial:1,fate:'slayer',boon:'three',tier:'ordinary',roots:['metal']});
    const feedback=new CombatFeedback(world), {context,drawn}=canvas();
    try {
      const event={at:{x:0,z:3},targetId:1,amount:20,element:'metal' as const,source:'spell' as const,ongoing:false};
      world.events.emit('damage',event);
      world.events.emit('damage',{...event,amount:52,opening:true});
      world.events.emit('damage',{...event,amount:10});
      feedback.paint(context,.2);
      expect(drawn[0]!.text).toBe('追破 52');
      expect(drawn.some(d=>d.text==='82'||d.text==='追破 82')).toBe(false);
    } finally { feedback.dispose(); }
  });
  it.each([320, 390, 568, 844])('keeps damage numbers above eleven CSS pixels at a %s px viewport', width => {
    const world = new World({ roguelike: true });
    world.chooseDestiny({ serial: 1, fate: 'slayer', boon: 'three', tier: 'ordinary', roots: ['metal'] });
    const feedback = new CombatFeedback(world), { context, drawn } = canvas(), scale = width / 1600;
    try {
      world.events.emit('damage', { at: { x: 0, z: 2 }, targetId: 1, amount: 48, element: 'metal', source: 'spell', ongoing: false });
      const hp = world.health, spirit = world.spirit; feedback.paint(context, scale);
      expect(drawn.map(d => d.text)).toEqual(['48']);
      expect(drawn[0]!.size * scale).toBeGreaterThanOrEqual(11);
      expect(drawn[0]!.size * scale).toBeLessThanOrEqual(15);
      expect([world.health, world.spirit]).toEqual([hp, spirit]);
    } finally { feedback.dispose(); }
  });
  it('leaves the other flow render size unchanged', () => {
    const world = new World(), feedback = new CombatFeedback(world), { context, drawn } = canvas();
    try {
      world.events.emit('damage', { at: { x: 0, z: 2 }, targetId: 1, amount: 48, element: 'metal', source: 'spell', ongoing: false });
      feedback.paint(context, .2); expect(drawn[0]!.size).toBe(15);
    } finally { feedback.dispose(); }
  });
  it('spreads enlarged horde labels locally and retains the high-priority reaction', () => {
    const detail = slayerDetailScale(.24);
    const labels: CombatLabel[] = Array.from({ length: 30 }, (_, i) => ({ text: i === 29 ? '蒸汽' : String(i), p: { x: 600 + i % 5 * 65, y: 520 + Math.floor(i / 5) * 50 }, color: '#fff', alpha: 1, size: 15 * detail, width: 34 * detail, priority: i === 29 ? 3 : 2 }));
    const output = layoutCombatLabels(labels, [], { spacing: detail, limit: 12 });
    expect(output.length).toBeGreaterThan(2); expect(output.length).toBeLessThanOrEqual(12); expect(output[0]!.text).toBe('蒸汽');
    for (const a of output) for (const b of output) if (a !== b) expect(Math.abs(a.p.x - b.p.x) >= (a.width + b.width) / 2 + 6 || Math.abs(a.p.y - b.p.y) >= a.size + 6).toBe(true);
  });
  it('has finite bounded scaling for invalid or extreme camera values', () => {
    for (const scale of [NaN, Infinity, 0, -1, .01, 10]) { const detail = slayerDetailScale(scale); expect(Number.isFinite(detail)).toBe(true); expect(detail).toBeGreaterThanOrEqual(1); expect(detail).toBeLessThanOrEqual(4); }
  });
  it('shows the new paid hit after a horde has filled the damage-number budget', () => {
    const world = new World({ roguelike: true });
    world.chooseDestiny({ serial: 1, fate: 'slayer', boon: 'three', tier: 'ordinary', roots: ['metal'] });
    const feedback = new CombatFeedback(world), { context, drawn } = canvas();
    try {
      for (let i = 0; i < 60; i++) world.events.emit('damage', { at: { x: -14 + i % 7 * 4, z: -8 + Math.floor(i / 7) * 3 }, targetId: i,
        amount: 11, element: 'metal', source: 'spell', ongoing: false });
      feedback.update(.12);
      world.events.emit('damage', { at: { x: 0, z: 3 }, targetId: 100, amount: 999, element: 'metal', source: 'spell', ongoing: false });
      const state = [world.health, world.spirit, world.kills]; feedback.paint(context, .24);
      expect(drawn[0]!.text).toBe('999'); expect(drawn.length).toBeLessThanOrEqual(12);
      expect([world.health, world.spirit, world.kills]).toEqual(state);
      feedback.update(1); drawn.length = 0; feedback.paint(context, .24); expect(drawn).toHaveLength(0);
    } finally { feedback.dispose(); }
  });
  it('keeps the paid contact and steam visible through a later flood of burn ticks', () => {
    const world = new World({ roguelike: true });
    world.chooseDestiny({ serial: 1, fate: 'slayer', boon: 'three', tier: 'ordinary', roots: ['metal'] });
    const feedback = new CombatFeedback(world), { context, drawn } = canvas();
    try {
      world.events.emit('damage', { at: { x: -8, z: 3 }, targetId: 1000, amount: 777, element: 'water', source: 'steam', ongoing: false });
      world.events.emit('damage', { at: { x: 8, z: 3 }, targetId: 1001, amount: 999, element: 'metal', source: 'spell', ongoing: false });
      for (let i = 0; i < 120; i++) world.events.emit('damage', { at: { x: -14 + i % 7 * 4, z: -8 + Math.floor(i / 7) % 7 * 3 }, targetId: i,
        amount: 11, element: 'fire', source: 'spell', ongoing: true });
      feedback.paint(context, .24);
      expect(drawn.slice(0, 2).map(d => d.text)).toEqual(['蒸汽 777', '999']);
      expect(drawn.length).toBeLessThanOrEqual(12);
    } finally { feedback.dispose(); }
  });
});
