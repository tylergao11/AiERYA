# 美术与玩法接入约定

更新：2026-09-12。用户已明确：美术与玩法由不同工作负责。

## 文件职责

| 目录 | 职责 |
|---|---|
| `src/render`、`public/art` | 美术：插画、水火、角色、阵法外观、事件特效 |
| `src/ui/style.css` | 美术：界面排版与表现 |
| `src/game`、`src/core` | 玩法：模拟、规则、状态、空间判定 |
| `src/ui/input.ts`、`src/main.ts` | 共享入口，接入修改应尽量小 |
| `src/ui/interface.ts` | 共享界面，外观与规则文案调整需对应当前玩法 |

## 当前可用数据

- `Ward.id` 标识同一座阵，`Ward.points` 保存实际闭合多边形。`radius` 仅供取样范围等辅助用途，不能取代多边形。
- `Ward.age` 用于成立动画；`empowered/suppressed` 为相生强化/相克压制剩余秒数。压制时阵法及宝宝暂停攻击；火阵停止火苗、保留地面痕迹。`charge` 为旧表现兼容值，不能作为施法门槛。
- `Ward.power` 提供投入灵力、实际面积、墙长、浓度和相对强度；`health/maxHealth` 提供土墙当前及最大生命。浓度已参与玩法结算，美术可以读取这些数据表现浓淡、坚固程度，具体规则见 [灵力浓度](./06-spirit-concentration.md)。
- `Wolf.action/hit/burning/wet/rooted` 驱动动画和身体状态；美术不能反向修改这些值来制造效果。
- `Wolf.burnDps/slowAmount` 分别表示当前灼烧每秒伤害和减速比例，不能仅根据 `burning/wet` 是否大于零反推出固定强度。
- `Wolf.burnBaseDps` 保存助燃前的灼烧基准，确保浓火也可被助燃，同时反复木划火不会指数叠加。实际伤害和表现强度仍读取 burnDps。
- `ward/wardRemoved/pulse/hit/death/invoke/reset` 事件用于成立、攻击、命中、收尾及清理。
- `World.spirit/capacity/regeneration/spellCost` 提供统一灵力池、容量、自然恢复速度和主动施法消耗。原 `energy` 五池与 `gather` 点击取材事件已删除。
- `spiritRecovered { amount, at }` 仅在战斗实际恢复灵力时、约每秒合并发出，用于环境微光汇入角色；池满无汲取事件，暂停停止。当前沿用流光粒子接入，不需要新素材。
- `reaction { kind, from, to, result, name, at, targetId?, wardId?, sourceElement? }` 提供相生 generate、主动相克 overcome、受到克制 resist。from/to 是有方向的五行关系，result 是结果元素，name 是助燃/蒸汽冲击等提示。单位、阵法、自然来源均发事件。
- `World.naturalInfluences` 提供自然五行源的强化/压制剩余时间；`naturalPower(element)` 返回 0、1 或 1.35。当前篝火动态读取自然火强度，灭火不扣营地生命。
- `invoke` 每笔只发一次；闭合时 points 为修正后的闭合轮廓，战斗圈不是新阵法。combo 标记有反应，具体结果看 reaction；划线仍保留当前选择的五行外观，命中与反应使用实际结果元素。
- `src/game/map.ts` 保存插画与场地坐标的标定。背景构图或地图变化时一起校对；自然水体轮廓不能只改视觉。

## 后续阵内单位

水灵应有自身单位身份和所属阵法身份，并使用这座阵的实际多边形决定合法落点。凹形阵法的几何中心可能位于阵外，不能直接作为出生点。

玩法先确定单位数据、攻击与解除事件，再由美术加入待机、施术和消散。当前已有阵法 ID、轮廓与事件系统足以作为接入起点，不提前实现一套泛化召唤框架。

玩法侧现已预留 `WardFormationEffect` 成阵接口、`world.companions` 持续单位状态，以及 `companionSpawned/companionAttack/companionRemoved` 事件。默认未启用任何宝宝，现有阵法呈现继续使用原事件；未来接入单位时见 [闭合成阵与附加单位接口](./05-formation-extension.md)。

## 当前边界

本轮完成的是二维插画和基础五行动效。水灵、复杂肉鸽、狼群技能和最终数值由后续玩法工作确定。美术继续打磨现有画面，不通过增加伤害、修改敌人速度等手段营造打击感。

用户随后追加授权处理狼群动作、普通狼/精英狼/狼王区别，以及寻路、边界和碰撞。本次实现与暂定敌人参数见 [狼群动作与碰撞](./10-wolf-animation-and-collision.md)；新增身体与动作数据集中在狼群模块，玩家技能伤害和肉鸽规则仍由玩法工作维护。
