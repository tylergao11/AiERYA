import type { GameEvents } from '../game/contracts';
import type { World } from '../game/world';
import { COLORS, glow, line } from './ink';
import { ART, toArt, type Camera2D, type Pixel } from './projection';
import { SpiritArt, type SpiritSheets } from './spirit-art';
import { paintSpiritStrike } from './spirit-strike';
import { paintStroke, strokeGeometry } from './stroke';
import type { PaintedObject } from './wards';
import { paintEvolution, paintSpiritAttack, type SpiritAttackArt } from './spirit-vfx';
import { SummonPainter } from './summon';
import { SummonStorm } from './summon-storm';
import { registerSpiritMaterial } from './spirit-material';
import {SpiritFields} from './spirit-fields';
import {paintSpiritAbility,spiritAbilityDuration,type SpiritAbilityFX} from './spirit-ability-vfx';
import { spiritRestriction } from '../game/spirit-restrictions';
import { EffectTextBudget } from './effect-text-budget';

type Effect = GameEvents['rogueEffect'] & { age: number; source?: Pixel; ancestor?: boolean };
/** Reads simulation-owned companions and events; pictures cannot cause attacks. */
export class RoguePainter {
  private effects: Effect[] = [];
  private strikes: SpiritAttackArt[] = [];
  private evolutions: (GameEvents['wardEvolved'] & { age: number })[] = [];
  private readonly spiritArt: SpiritArt;
  private readonly summon: SummonPainter;
  private readonly storm: SummonStorm;
  private readonly fields: SpiritFields;
  private abilityEffects:SpiritAbilityFX[]=[];
  private readonly off: (() => void)[];
  constructor(private readonly world: World, private readonly textBudget = new EffectTextBudget()) {
    this.spiritArt = new SpiritArt(world);
    this.summon = new SummonPainter(world,s=>this.spiritArt.anchor(s),s=>this.spiritArt.source(s));
    this.storm = new SummonStorm(world,s=>this.spiritArt.source(s));
    this.fields=new SpiritFields(world);
    this.off = [world.events.on('rogueEffect', effect => {
      if (effect.label === '领悟生效' || /预兆|破阵蓄力|呼唤狼群|可破招|伴灵现身|支援灵加入|阵灵现身/.test(effect.label)) return;
      const label = effect.label && this.textBudget.claim(effect.label,world.time) ? effect.label : '';
      if(!label && this.effects.some(e=>e.kind===effect.kind && e.element===effect.element && e.age<.08 && Math.hypot(e.at.x-effect.at.x,e.at.z-effect.at.z)<1))return;
      if (this.effects.length >= 24) this.effects.shift();
      const spirit = effect.kind === 'beam' ? world.mechanics.spirits.find(s => s.element === effect.element && Math.hypot(s.x - effect.at.x, s.z - effect.at.z) < .1) : undefined;
      this.effects.push({ ...effect, label, age: 0, source: spirit ? this.spiritArt.source(spirit) : undefined, ancestor: spirit ? this.spiritArt.isAncestor(spirit) : false });
    }), world.events.on('spiritAttack', e => {
      const spirit = world.mechanics.spirits.find(s => s.id === e.spiritId);
      if (!spirit) return;
      this.spiritArt.poses.attack(spirit,e);
      if(e.stage==='impact'&&!e.echo&&this.summon.hasImpact(e.to,e.spiritId,e.targetId))return;
      if (this.strikes.length >= 48) this.strikes.shift();
      this.strikes.push({ ...e, age: 0, source: this.spiritArt.source(spirit) });
    }), world.events.on('summonImpact',e=>{
      if(e.echo)return;
      const spirit=e.spiritId===undefined?world.mechanics.spirits.find(s=>Math.hypot(s.x-e.from.x,s.z-e.from.z)<.1):world.mechanics.spirits.find(s=>s.id===e.spiritId);
      if(spirit&&(spirit.size>=1.7||spirit.element==='wood'||spirit.element==='earth'))this.spiritArt.poses.contact(spirit);
    }), world.events.on('wardEvolved', e => {
      // The collapsing drawn shape owns this transition; do not layer a generic spawn ring over it.
      this.effects = this.effects.filter(f => !(f.label === '阵灵现身' && Math.hypot(f.at.x - e.ward.x, f.at.z - e.ward.z) < .1));
      this.evolutions.push({ ...e, age: 0 }); if (this.evolutions.length > 6) this.evolutions.shift();
    }),
    world.events.on('spiritAbility',e=>{if(this.abilityEffects.length>=32)this.abilityEffects.shift();this.abilityEffects.push({...e,age:0});}),
    world.events.on('spiritTransition', e => this.spiritArt.transition(e)),
    world.events.on('beastFeast',e=>this.spiritArt.feast(e)),
    world.events.on('phase',e=>{if(e.phase!=='battle'){this.strikes=[];this.abilityEffects=[];this.fields.clear();}}),
    world.events.on('reset', () => { this.effects = []; this.strikes = []; this.evolutions = [];this.abilityEffects=[];this.fields.clear(); this.spiritArt.clear(); })];
  }
  setAssets(sheets: SpiritSheets): void { this.spiritArt.setAssets(sheets); if(sheets.spiritEffects)registerSpiritMaterial(sheets.spiritEffects);if(sheets.spiritGround)this.fields.setAsset(sheets.spiritGround); }
  update(dt: number): void {
    this.summon.update(dt);
    this.fields.update(dt);this.abilityEffects=this.abilityEffects.filter(e=>{e.age+=dt;return e.age<spiritAbilityDuration(e.kind);});
    this.spiritArt.update(dt); this.effects = this.effects.filter(e => { e.age += dt; return e.age < (e.label ? 1.1 : .55); });
    this.strikes = this.strikes.filter(e => {
      e.age += dt;if(e.age>=e.duration)return false;
      if(e.stage==='windup'){
        const spirit=this.world.mechanics.spirits.find(s=>s.id===e.spiritId);
        if(!spirit||spirit.cast<=0||spiritRestriction(this.world,spirit))return false;
        e.source=this.spiritArt.source(spirit);
      }
      return true;
    });
    this.evolutions = this.evolutions.filter(e => { e.age += dt; return e.age < .85; });
  }
  ground(c: CanvasRenderingContext2D): void {
    this.spiritArt.ground(c);
    this.summon.ground(c);
    this.fields.ground(c);for(const e of this.abilityEffects)paintSpiritAbility(c,e,true);
    for (const field of this.world.mechanics.tactics.fields) {
      const p = toArt(field), rx = field.radius * ART.unitX, ry = field.radius * ART.unitY;
      const mist = field.kind === 'mist';
      c.save(); c.globalAlpha = Math.min(.65, field.remaining); c.strokeStyle = COLORS.water;
      c.fillStyle = mist ? '#b9e6ef22' : '#71bbce12'; c.lineWidth = 1.5;
      c.beginPath(); c.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      for (let n = 0; n < 3; n++) {
        const spin = this.world.time * (mist ? .2 : 2) + n * Math.PI * 2 / 3;
        c.beginPath(); c.ellipse(p.x, p.y, rx * (.4 + n * .2), ry * (.4 + n * .2), 0, spin, spin + Math.PI * 1.1); c.stroke();
      }
      c.restore();
    }
    const scar = this.world.mechanics.scar;
    if (scar) paintStroke(c, strokeGeometry(scar.points.map(p => toArt(p))), scar.element, this.world.time, 0, Math.min(.6, scar.remaining / 2));
    for (const ward of this.world.wards) {
      if (ward.mainSlot === undefined) continue;
      const p = toArt(ward); c.save(); c.strokeStyle = COLORS[ward.element]; c.lineWidth = 2;
      c.beginPath(); c.ellipse(p.x, p.y, 26, 16, 0, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#ecddba'; c.font = 'bold 16px KaiTi, serif'; c.textAlign = 'center'; c.fillText(ward.mainSlot === 0 ? '主' : '副', p.x, p.y + 5); c.restore();
    }
    for (const seed of this.world.mechanics.seeds) { const p = toArt(seed); glow(c, p.x, p.y, 35, COLORS.wood, .3); line(c, [{ x: p.x - 10, y: p.y + 3 }, { x: p.x, y: p.y - 12 }, { x: p.x + 9, y: p.y - 3 }], COLORS.wood, 3); }

  }
  objects(): PaintedObject[] { return this.world.mechanics.spirits.map(spirit => ({ z: toArt(spirit).y, draw: c => { c.save(); if ((spirit.hp ?? 1) <= 0) c.globalAlpha=.25; this.spiritArt.paint(c, spirit); c.restore(); if (spirit.maxHp && spirit.role !== 'array') { const p=toArt(spirit); c.save(); c.fillStyle='#30251b'; c.fillRect(p.x-19,p.y-69,38,5); c.fillStyle=(spirit.hp??0)/spirit.maxHp>.4?'#b7c578':'#c45535'; c.fillRect(p.x-18,p.y-68,36*Math.max(0,(spirit.hp??0)/spirit.maxHp),3); c.restore(); } } })); }
  labelBounds() { return this.world.mechanics.spirits.map(spirit=>this.spiritArt.labelBounds(spirit)); }
  ultimate(c:CanvasRenderingContext2D,camera:Camera2D,ratio:number):boolean {return this.storm.paint(c,camera,ratio);}
  paint(c: CanvasRenderingContext2D,screenScale=1): void {
    this.fields.paint(c,screenScale);
    for (const e of this.strikes) {
      const target = e.stage === 'launch' ? this.world.wolves.find(w => w.id === e.targetId) : undefined;
      paintSpiritAttack(c, e, target ? toArt(target, .7) : undefined);
    }
    for (const e of this.evolutions) paintEvolution(c, e, e.age);
    for(const e of this.abilityEffects)paintSpiritAbility(c,e,false);
    for (const effect of this.effects) {
      const p = effect.source ?? toArt(effect.at, effect.kind === 'beam' ? 1 : 0), color = COLORS[effect.element];
      c.save(); c.globalAlpha = Math.max(0, 1 - effect.age / (effect.label ? 1.1 : .55));
      if (effect.to) paintSpiritStrike(c, p, toArt(effect.to, .7), effect.element, effect.age, !!effect.ancestor);
      else {
        const grow = Math.min(1, effect.age * 4), radius = Math.max(16, effect.radius * ART.unitX * grow);
        c.strokeStyle = color; c.lineWidth = 3 * (1 - grow) + 1; c.beginPath(); c.ellipse(p.x, p.y, radius, radius * ART.unitY / ART.unitX, 0, 0, Math.PI * 2); c.stroke(); glow(c, p.x, p.y, radius, color, .16 * (1 - grow));
      }
      if (effect.label) { c.font = 'bold 18px KaiTi, serif'; c.textAlign = 'center'; c.strokeStyle = '#123034'; c.lineWidth = 4; c.strokeText(effect.label, p.x, p.y - 42 - effect.age * 18); c.fillStyle = '#ffe4ad'; c.fillText(effect.label, p.x, p.y - 42 - effect.age * 18); }
      c.restore();
    }
    this.summon.paint(c);
    this.spiritArt.feastEffects(c);
  }
  dispose(): void { this.storm.dispose(); this.summon.dispose(); this.off.forEach(off => off()); this.effects = []; this.strikes = []; this.evolutions = [];this.abilityEffects=[];this.fields.clear(); this.spiritArt.clear(); }
}
