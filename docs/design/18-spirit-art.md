# 灵体与祖兽美术重绘

更新：2026-09-13。

截图中的笑脸圆球已从 `RoguePainter` 删除。祖兽改为岩甲四足异兽；普通五行灵体分别为剑灵、藤鹿、游蛟、焰鸟、岩灵。素材采用内置 image_gen 生成，最终选稿保留原始 RGBA，未做离线程序抠图。两张运行时图集都为 1536×1024。

| 素材 | 项目路径 | 源文件 |
|---|---|---|
| 祖兽四姿态 | [ancestor-beast-atlas.png](../../public/art/ancestor-beast-atlas.png) | exec-a8ef794e-b7d2-4ba9-8198-4715cac97a6a.png |
| 五行灵体待机与出手 | [element-spirit-atlas.png](../../public/art/element-spirit-atlas.png) | exec-0e902133-100a-4e13-94ea-51241279e4a3.png |

`SpiritArt` 标定脚点、图集边界与少数跨格的胡须/翅尾轮廓，使用 Canvas 图集裁切保留透明边缘。`SpiritPoses` 仅读取现有施法状态，控制朝向、待机呼吸、蓄势、出手、收势和蜕变尺寸过渡；不触发伤害、不改变位置和碰撞。普通灵体使用两幅动作姿态，祖兽使用四幅姿态，尚非逐关节骨骼动画。元素攻击由已有命中事件表现为锋刃、藤鞭、水流、火羽、岩屑；祖兽叠加短促爪痕。

进入游戏与五选二左侧演示共用同一 `SceneView` 渲染。独立 [灵体预览](../../artifacts/visual-review/spirits.html) 可在开发服务器 `/artifacts/visual-review/spirits.html` 打开；预览页有自己的 World，按钮与受击目标仅用于展示，不改变玩家进度。

验证：新增 4 项动作状态测试（含准备阶段的显现与呼吸）通过；生产构建通过。390×844 视口布局无横向溢出。并行玩法开发仍在变更：最近一次全量快照为 358/361 通过，三项失败来自新增 reaction 成长路线与 tests/roguelike.test.ts:57 的旧预期；随后复测动作及天赋演示为 14/16，通过祖兽真实击杀蜕变，另两项拟法演示仍期待旧 invoke 事件。未改这些玩法规则及断言。祖兽演示的目标现放在真实近战范围内，停止阵法师抢击杀，仅调整隔离的演示场景。初始图集格距不规则，运行时已标定；两张含不透明棋盘格的编辑试稿未接入。

## 最终生成提示词（内置 image_gen）

### 祖兽

Use case: stylized-concept. Asset type: production transparent PNG sprite sheet for a 2D hand-painted dark Chinese fantasy mobile game. Create ONE 1536x1024 atlas with EXACTLY 2 columns x 2 rows of the SAME mature primordial guardian beast in four different animation poses. True transparent alpha background, no checkerboard, no floor, no scenery, no text. The creature is a heavy quadruped stone-and-flesh qilin/tiger, broad powerful shoulders, long muscular feline torso, four anatomically believable clawed paws, stern angular tiger muzzle and small amber eyes, dark slate layered rock armor along back and shoulder blades, weathered bronze swept horns, long strong tapering tail. Restrained ancient carved markings, ochre mineral accents in dark cracks. Feral dignified guardian of a forest formation mage. Western graphic novel ink drawing combined with sophisticated Chinese fantasy illustration, textured painterly brushwork, assertive dark ink contours, natural materials, cel-like directional warm highlights and cool shaded planes. Fits beside a realistically proportioned young robed human and hand-painted wolves. NOT a cute mascot, no round ball body, no smiling face, no chibi proportions, no toys, no shiny 3D render. Consistent elevated three-quarter side view, head toward RIGHT in every cell. Top-left: grounded alert idle, full body. Top-right: low shoulder wind-up with paws planted. Bottom-left: committed raking strike, head thrust forward, right forepaw swiping forward, snarl, mouth and claws readable, hindquarters still supported. Bottom-right: weight settling after strike. Identical animal design, similar total scale, only pose changes. Four equal 768x512 cells. Each whole creature fits inside its cell with generous completely transparent gutters on every side; tails horns paws fully visible. In each cell foot baseline near 82% of cell height, horizontal center near 50%. Clean professional game-ready isolated sprites, high quality illustrative anatomy, sharp readable silhouette at small mobile scale. Do not bake glows or shadows outside the animal.

### 五行灵体

A game sprite atlas as a TRANSPARENT PNG with real alpha channel. 1536x1024 image, five columns, two rows, ten isolated sprites. Lots of completely empty transparent space between all sprites. Small full body creatures inside their cells, NEVER TOUCHING, NO OVERLAP. Each sprite occupies only the center 65% of its rectangular cell. Hand-painted dark Chinese fantasy, detailed dark ink linework, mature animal anatomy, natural textured materials, muted highlights, no cute faces. Every column depicts ONE spirit in two action poses: top row idle, bottom row attacking to the right. Column 1: floating trio of ancient narrow steel swords with worn bronze hilts. Column 2: slender four-legged deer made from twisted tree roots and bark, moss leaves, branching antlers. Column 3: a long sinuous blue-grey water dragon with narrow angular face, whiskers and flowing fin tail. Column 4: fierce vermilion firebird with hooked beak and flame feathers. Column 5: a broad angular stone golem with heavy arms, sandstone and dark slate plates, thin glowing slit for an eye. Bottom row actions: swords thrust right; deer dips antlers; dragon strikes right; bird beats wings; golem punches right. Preserve each creature's identity across its two poses. Full silhouettes including antlers, claws, blades, tails and wings entirely within each cell, extensive blank gutters. Consistent three-quarter side view. Game-ready transparent alpha around every shape. No words, no scene, no ground, no checkerboard texture, no background color or gradient, no surrounding colored glow.
