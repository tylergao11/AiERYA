# 闭合成阵与附加单位接口

更新：2026-09-12。对应本轮“先做好布局阶段闭合成阵，并为后续肉鸽攻击宝宝预留接口”的需求。

## 成阵流程

`DrawingInput` 收集绘制点和松手位置，布局时调用 `World.previewPlacement(points)` 预览，松手后通过 `World.draw(points)` 按阶段路由：布局进入 `place` 成阵，战斗进入 `invoke` 施法。战斗中的圈也按瞬时范围法术处理，不触发成阵或宝宝接口。

两者都支持可选第二参数 `investment` 指定本次投入的整数灵力，默认使用 `world.wardCost`（当前为 14）。不因面积变大而额外收费；具体浓度计算见 [灵力浓度规则](./06-spirit-concentration.md)。

1. 自动闭合近似圈、消除收笔交叉、微调轻微越界，再校验地形、显著重叠、阵数和统一灵力。成功结果包含元素、修正后的实际多边形、阵内锚点、面积、消耗；失败结果包含原因码和提示。
2. 只对合法布阵执行当前肉鸽效果的 `plan(context)`，收集额外单位描述并检查出生点与攻击参数。
3. 所有描述有效后，一次性扣除灵力、创建阵法和附属单位，再更新寻路。
4. 发出一次 `ward`，随后为每个额外单位发出 `companionSpawned`。收到成阵事件时，可以读取完整的阵法与单位状态。

预览没有副作用，不执行肉鸽效果，不扣灵力、不分配 ID、不创建单位。最终提交重新校验，避免使用已经过期的预览结果。未闭合、重叠或灵力不足的绘制不会触发肉鸽效果。

若肉鸽规划抛错、单位参数无效或出生点落在阵外，整次成阵失败，保留灵力且不留下半座阵。`warning.cause` 提供开发诊断原因。

## 肉鸽接入

类型定义在 `src/game/contracts.ts`，效果注册与校验在 `src/game/formation.ts`。

- `WardFormationEffect.id`：效果身份。同 ID 再次注册会替换；需要叠层时使用不同 ID。
- `element`：可选的元素条件，例如仅作用于水阵。
- `plan(context)`：纯规划函数，返回零个、一个或多个 `WardCompanionSpawn`。不得在其中修改世界、扣资源或创建表现对象。
- `context`：包含阵法 ID、元素、真实边界、阵内锚点、面积、消耗、阶段与波次；`context.ward.power` 提供投入灵力、墙长、浓度和相对强度。所有这些数据均为只读快照。
- `WardCompanionSpawn`：包含 `kind`、攻击参数和可选出生点 `at`。不传 `at` 时使用已校验的阵内锚点。多个单位可分别指定阵内位置。

以下仅是接入示例，数值不代表已确认设计，也未加入默认玩法：

```ts
import type { WardFormationEffect } from './contracts';

const waterSpiritEffect: WardFormationEffect = {
  id: 'water-spirit',
  element: 'water',
  plan: () => [{ kind: 'water-spirit', attack: { damage: 10, interval: 1.5, range: 6 } }],
};

world.formationEffects.add(waterSpiritEffect);
```

所有成阵均发生在 `prepare` 阶段。若某效果仅限初始布局，应判断 `context.wave === 0`，因为波间领悟后同样返回 `prepare`。

`UpgradeDefinition.formationEffects` 也可携带这些效果。现有 `chooseUpgrade` 会按波次注册，后续新画出的阵法可以触发。原有三个数值升级没有附加单位效果。

效果仅影响注册之后的新阵法，不自动改造已经成立的阵法。`world.formationEffects.remove(id)` 停止该效果对后续成阵的作用，已经生成的单位仍由原阵法管理。重开清空本局效果；常驻天赋若以后需要跨局保留，应由天赋系统在新局重新注册。

## 单位状态与持续攻击

美术可读取 `world.companions`，每个单位包含：

| 数据 | 用途 |
|---|---|
| `id` | 独立单位身份，与阵法、狼共用 ID 分配器 |
| `wardId` | 所属阵法，可查到实际边界 |
| `effectId` | 产生它的肉鸽效果 |
| `kind`、`element` | 单位种类与所属阵法的元素 |
| `x`、`z`、`age` | 位置与表现时间 |
| `attack`、`cooldown`、`targetId` | 攻击定义、独立冷却和当前目标 |
| `powerShare` | 该单位占所属阵法宝宝攻击预算的比例；同阵生成 N 个宝宝时每个为 1/N |

当前接口验证用的攻击行为：单位停留在合法出生点，战斗中独立寻找自身射程内最近的活狼并周期攻击；射程以单位为中心，可以覆盖阵外。伤害、冷却和射程读取现有数值修饰器，伤害及元素状态通过 `World` 的统一结算入口处理。表现动画不决定伤害时间。

单位攻击伤害与附带元素状态额外乘以 `所属阵法.power.multiplier × powerShare`。`attack.damage` 填写基准伤害，由模拟统一应用浓度，肉鸽规划不应再次手动乘浓度。数量增加不会让同一份宝宝预算凭空翻倍；提高总输出应通过攻击参数或明确的数值成长来实现。当前没有改变基础阵法自身的自动攻击预算。

准备、波间休息和结算阶段不攻击、不消耗攻击冷却；切换波次保留单位 ID 与冷却。没有获得对应效果时，默认不会产生任何额外单位。

## 生命周期与美术事件

| 事件 | 数据与时机 |
|---|---|
| `ward` | 阵法已提交；含 `ward`、`area`、`cost`、`phase` |
| `companionSpawned` | 单位已创建；含 `companion` |
| `companionAttack` | 一次攻击开始结算；含 `companion` 与 `targetId` |
| `companionRemoved` | 单位已从状态移除；含 `id`、`wardId`、`at`、`kind`、`reason` |
| `wardRemoved` | 阵法及其单位已清理；增加 `reason` |
| `reset` | 全局表现清理，并重建新局状态 |

本轮的默认归属规则：撤阵、土阵被狼破坏、重开，都会清除所属单位；不会清除其他阵法的单位。移除原因分别为 `undo`、`destroyed`、`reset`。单位移除事件先于所属阵法的移除事件，事件发出前两者都已从玩法状态中清除。

出生点使用实际多边形判定。凹形阵法的缺口属于阵外，不能用外接圆或简单平均中心代替。后续增加游走时，也必须使用所属阵法的实际边界约束位置。

当前没有锁定宝宝的正式种类、数量、移动、受击、死亡、成长或技能配方；没有新增默认宝宝、美术资源或泛化召唤框架。未来有这些具体需求时，在这套成阵事务、单位身份和生命周期上扩展。

## 验证

`tests/formation.test.ts` 覆盖成阵事务、无效绘制、凹形落点、扩展失败回退、独立持续攻击、升级接入、跨波保留、撤阵、被毁和重开清理。

`tests/drawing-input.test.ts` 覆盖松手坐标闭合，以及预览与正式校验的一致性。原有五行规则、寻路和投影测试继续保留。
