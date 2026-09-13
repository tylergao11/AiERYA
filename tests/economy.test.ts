import { describe,expect,it,vi } from 'vitest';
import { World } from '../src/game/world';
import { ELEMENTS,type Element,type Wolf } from '../src/game/contracts';
import { ECONOMY } from '../src/game/economy';
const loop=[{x:-8,z:2},{x:-4,z:2},{x:-4,z:6},{x:-8,z:6},{x:-8,z:2}];
const target=(summoned=false):Wolf=>({id:999,x:-6,z:4,hp:1000,maxHp:1000,speed:0,heading:0,action:'run',age:0,attack:1,hit:0,burning:0,burnDps:0,burnBaseDps:0,rooted:0,wet:0,slowAmount:0,aura:null,auraTime:0,vx:0,vz:0,pack:0,routeAge:0,waypoint:null,summoned});
function setup(element:Element='fire',gift=false){const w=new World({roguelike:true});w.chooseDestiny({serial:1,fate:gift?'array':'spirit',boon:gift?'fivefold':'twins',tier:'ordinary',roots:[element]});w.selected=element;return w;}
describe('persistent currency and combat wear',()=>{
 it('spends savings on optional camp repairs during preparation only',()=>{
  const w=setup();w.health=60;expect(w.repairCamp()).toBe(true);expect(w.health).toBe(80);expect(w.spirit).toBe(70);expect(w.ledger.spent).toBe(30);
  w.startWave();expect(w.repairCamp()).toBe(false);w.phase='prepare';w.spirit=29;expect(w.repairCamp()).toBe(false);expect(w.health).toBe(80);
  w.spirit=100;w.health=95;expect(w.repairCamp()).toBe(true);expect(w.health).toBe(100);expect(w.spirit).toBe(70);expect(w.repairCamp()).toBe(false);
 });
 it('caps all income at 100 and balances the ledger using only received spirit',()=>{
  const w=setup();w.spirit=100;w.tick(60);expect(w.spirit).toBe(100);w.place(loop);expect(w.spirit).toBe(86);
  w.startWave();w.tick(.1);expect(w.spirit).toBeCloseTo(86.3);w.selected='metal';w.invoke([{x:8,z:0},{x:12,z:0}]);expect(w.spirit).toBeCloseTo(83.3);
  w.replenishSpirit(120);expect(w.spirit).toBe(100);expect(w.ledger.earned).toBeCloseTo(17);w.tick(.1);expect(w.spirit).toBe(100);w.dismissWard(w.wards[0]!.id);expect(w.ledger.salvaged).toBe(0);
  expect(w.spirit).toBeCloseTo(100+w.ledger.earned+w.ledger.salvaged-w.ledger.spent);w.reset();expect(w.ledger).toEqual({earned:0,spent:0,salvaged:0});
 });
 it('pays one native-kill income once and never farms called reinforcements',()=>{
  const w=setup();w.startWave();w.spirit=98;const wolf=target();w.wolves=[wolf];
  w.hitRogue(wolf,2000,'metal',{kind:'trigger',noProc:true});w.hitRogue(wolf,2000,'metal',{kind:'trigger',noProc:true});expect(w.spirit).toBe(99);
  const called=target(true);w.wolves=[called];w.hitRogue(called,2000,'metal',{kind:'trigger',noProc:true});expect(w.spirit).toBe(99);expect(w.ledger.earned).toBe(1);
 });
 it.each(['prepare','battle','rest'] as const)('discards overflow immediately during %s without banking it for later',phase=>{
  const w=setup();w.phase=phase;w.spirit=99.75;w.replenishSpirit(1000);
  expect(w.spirit).toBe(100);expect(w.ledger.earned).toBe(.25);
  w.replenishSpirit(30);expect(w.spirit).toBe(100);expect(w.ledger.earned).toBe(.25);
  w.spirit-=10;expect(w.spirit).toBe(90);w.replenishSpirit(3);expect(w.spirit).toBe(93);expect(w.ledger.earned).toBe(3.25);
 });
 it.each(['elite','king'] as const)('caps %s income and emits only the received amount',kind=>{
  const w=setup();w.startWave();w.spirit=99.5;
  const received=vi.fn();w.events.on('spiritRecovered',received);
  const a={...target(),kind},b={...target(),id:1000,kind};w.wolves=[a,b];
  w.hitRogue(a,2000,'metal',{kind:'trigger',noProc:true});w.hitRogue(b,2000,'metal',{kind:'trigger',noProc:true});
  expect(w.kills).toBe(2);expect(w.spirit).toBe(100);expect(w.ledger.earned).toBe(.5);
  expect(received).toHaveBeenCalledOnce();expect(received).toHaveBeenCalledWith(expect.objectContaining({amount:.5}));
 });
 it.each(ELEMENTS)('%s formations wear in battle and preserve the remainder outside battle',element=>{
  const w=setup(element);expect(w.place(loop)).toBe(true);const a=w.wards[0]!,hp=a.health;
  w.tick(30);expect(a.health).toBe(hp);w.startWave();w.tick(.1);expect(a.health).toBeCloseTo(hp*(1-.1/ECONOMY.wardLifetime));
  const remaining=a.health;w.startUltimate();w.tick(1);expect(a.health).toBe(remaining);w.ultimate.clear();w.phase='rest';w.tick(30);expect(a.health).toBe(remaining);w.phase='prepare';w.tick(30);w.startWave();expect(a.health).toBe(remaining);
 });
 it('a real attack adds wear and depletion removes the formation and its bound spirit',()=>{
  const w=setup('fire',true);w.place(loop);const a=w.wards[0]!,removed=vi.fn();w.events.on('wardRemoved',removed);w.startWave();w.wolves=[target()];
  const before=a.health;w.tick(.01);expect(a.health).toBeCloseTo(before-a.maxHealth*(.01/ECONOMY.wardLifetime+ECONOMY.wardShotWear));
  a.health=a.maxHealth*.00001;w.tick(.01);expect(w.wards).toHaveLength(0);expect(w.mechanics.spirits).toHaveLength(0);expect(removed).toHaveBeenCalledOnce();
 });
 it('awakened formations still expire, free their seat, and cannot resurrect through an upgrade',()=>{
  const w=setup('earth',true);
  w.reset();w.chooseDestiny({serial:2,fate:'array',boon:'living',tier:'unusual',roots:['earth']});w.selected='earth';w.place(loop);const a=w.wards[0]!;
  w.build.stage=1;w.mechanics.upgraded();expect(w.wards[0]).toBe(a);expect(w.mechanics.spirits).toHaveLength(0);a.health=a.maxHealth*.00001;
  w.startWave();w.tick(.01);expect(w.mechanics.spirits).toHaveLength(0);expect(w.availableMainSlot).toBe(0);expect(w.restoreEvolvedWard(a)).toBe(false);
 });
 it('salvages only remaining paid value and spends again when replacing a used gift',()=>{
  const w=setup('earth',true);w.place(loop);const gift=w.wards[0]!;gift.health/=2;expect(w.wardRefund(gift.id)).toBe(0);w.dismissWard(gift.id);
  expect(w.mainPlacementCost).toBe(14);w.place(loop);const paid=w.wards[0]!;expect(w.spirit).toBe(86);expect(paid.health).toBe(paid.maxHealth);paid.health/=2;
  expect(w.wardRefund(paid.id)).toBeCloseTo(5.6);w.dismissWard(paid.id);expect(w.spirit).toBeCloseTo(91.6);expect(w.dismissWard(paid.id)).toBe(false);w.place(loop);expect(w.spirit).toBeCloseTo(77.6);
 });
});
