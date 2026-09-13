import { random, type Point } from '../core/math';
import type { Wolf } from '../game/contracts';
import type { Destiny } from '../game/roguelike';
import { World } from '../game/world';
import { ArrayBirthDemo } from './array-birth-demo';

/** An isolated, repeatable demonstration; never receives the player's World. */
export class BirthDemoSimulation {
  readonly world = new World({ roguelike: true, random: random(1529) });
  elapsed = 0;
  caption = '';
  private first = false;
  private second = false;
  private arrayDemo?: ArrayBirthDemo;
  get stroke(): readonly Point[] { return this.arrayDemo?.stroke ?? [{ x: -9, z: -2 }, { x: -.5, z: -2 }]; }
  constructor(readonly destiny: Destiny) { this.restart(); }
  restart(): void {
    const w = this.world; w.reset(); w.chooseDestiny(this.destiny);
    this.elapsed = 0; this.first = this.second = false;
    this.arrayDemo=undefined;
    if(w.build.is('array')) { this.arrayDemo=new ArrayBirthDemo(w);this.caption=this.arrayDemo.caption;return; }
    w.selectElement(w.build.has('mimic') ? 'fire' : 'metal');
    if (w.build.has('mimic')) w.mechanics.spirits.forEach((s, i) => { s.element = i === 0 ? 'water' : 'fire'; s.cooldown = 1.5; });
    w.startWave(); w.wolves = [-4.1, -2, .1].map((z, i): Wolf => ({
      id: 10000 + i, x: -3.5 + (i % 2) * 1.8, z, hp: 550, maxHp: 550, speed: .35, heading: -Math.PI / 2,
      action: 'run', age: i * .1, attack: 1, hit: 0, burning: 0, burnDps: 0, burnBaseDps: 0, rooted: 0, wet: 0,
      slowAmount: 0, aura: null, auraTime: 0, vx: 0, vz: 0, pack: 0, routeAge: 0, waypoint: null,
    }));
    if (w.build.has('beast')) {
      w.mechanics.beastMarks = 11;
      const main = w.mechanics.spirits[0]!;
      // Put the demonstration target within the beast's actual melee reach;
      // the mage must not steal its finishing blow as balance values change.
      Object.assign(w.wolves[0]!, { x: main.x + 1.4, z: main.z, hp: 10 }); main.cooldown = .85;
    }
    else if (w.build.is('spirit')) {
      // A nearby practice pack demonstrates approaching and close-range contact.
      w.mechanics.spirits.forEach((spirit, i) => { spirit.x = -5; spirit.z = -2 + i * .35; });
      Object.assign(w.wolves[0]!, { x: -3.5, z: -2 });
    }
    this.caption = w.build.has('beast') ? '已有 11 印 · 击杀后蜕变' : w.build.has('twins') ? '主灵与伴灵，各自出手' : w.build.is('array') ? '古阵成形，狼群进入阵域' : '起笔蓄势';
  }
  tick(dt: number): void {
    const w = this.world; this.elapsed += dt;
    if(this.arrayDemo){this.arrayDemo.tick(dt);this.caption=this.arrayDemo.caption;return;}
    if (!this.first && this.elapsed >= .85) {
      this.first = true;
      if (!w.build.has('beast')) w.invoke(this.stroke, w.build.has('debt') ? 1.2 : 0);
      this.caption = w.build.has('three') ? '一笔三锋 · 两道侧锋接续命中' : w.build.has('scar') ? '第一笔留下战痕' : w.build.has('debt') ? '满蓄开势 · 趁势接一笔快刀' : w.build.has('mimic') ? '御令入体 · 宝宝命中后复奏' : w.build.has('fivefold') ? '相生点阵 · 原阵与来笔双辅同开' : w.build.has('twinArray') ? '正副双阵，各自持续攻击' : w.build.has('living') ? '拖动阵眼，古阵随行' : this.caption;
    }
    if (!this.second && this.elapsed >= 2.1) {
      this.second = true;
      if (w.build.has('living')) { w.moveMain(w.wards[0]!.id, { x: -3, z: 0 }); this.caption = '迁阵落地 · 冲击命中狼群'; }
      else if (w.build.has('scar')) {
        w.invoke([{ x: -3.5, z: -5.5 }, { x: -3.5, z: 1.5 }]); this.caption = '两笔交叉 · 战痕引爆';
      } else if (w.build.has('three') || w.build.has('debt') || w.build.has('mimic')) { w.invoke(this.stroke); if (w.build.has('debt')) this.caption = '狂书追斩 · 借用重斩余势'; }
    }
    w.tick(dt);
    // The preview owns its three targets; discard regular wave entrants before rendering.
    w.wolves = w.wolves.filter(wolf => wolf.id >= 10000);
    if (w.build.has('beast') && w.mechanics.beastEvolved) this.caption = '吞满 12 印 · 祖兽蜕变';
  }
}
