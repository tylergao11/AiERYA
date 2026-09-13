# 美术素材记录

2026-09-13 阵法辅助重做：`ui/array-support-paintings.webp` 为五行辅阵、五行通脉觉醒、周天双阵天授、周天合鸣升华四格手绘插画，取消阵兽形象。内置 imagegen 原件 `exec-90f3810a-32d7-475f-98bb-28430222b15f.png`（1254 × 1254 RGB）保存在 `docs/design/visuals/warm-scroll-v2/array-support-paintings.png`，只编码为 WebP，运行时 2 × 2 裁切。[提示词](../../docs/design/visuals/array-support-prompt.md)。

2026-09-13 近战移动追加：`spirit-walk-atlas.png`，1448×1086 RGBA，四列三行，分别为木鹿、土灵、祖兽的四帧步态。来源为内置 image_gen 的 `exec-45192902-ca7b-4499-8fb9-32532055e2c9.png`，直接复制透明原稿，运行时逐行标定脚底，不参与离线抠图。提示词见 `docs/design/visuals/spirit-walk-prompt.txt`。

更新：2026-09-12。以下素材均由本项目制作流程使用内置 image_gen 生成，未引入外部素材包。生成图不是外部 CC0 模型，不沿用已删除模型的许可说明。

| 文件 | 用途 | 格式约定 |
|---|---|---|
| `forest-valley.png` | 已确认构图的山林、营地与地面层 | 场地按 1600×1000 标定；水面和营火由运行时补充 |
| `wolf-atlas.png` | 狼的运动与攻击、倒下 | 4 列×3 行；行分别为奔跑、攻击、死亡；透明通道 |
| `mage.png` | 青衣年轻阵法师原始设计参考 | 保留作为人物参考，运行时改读施法图集 |
| `mage-cast-atlas.png` | 阵法师待机、提气、引诀、施法与收势 | 1536×1024 RGBA，四列两行，真实透明通道；脚点逐帧标定 |
| `fire-atlas.png` | 篝火、火阵、燃烧与命中火势 | 4 列×3 行的 12 帧；纯黑底，使用 screen 混合 |
| `formation-atlas.png` | 木阵根结、蕨叶与土阵岩块 | 1448×1086 RGBA；4 列，读取中、下两条素材带；上排石柱不参与游戏 |
| `metal-atlas.png` | 金阵的四种暗钢锋刃 | 1774×887 RGBA；4 列单行，按脚点缩放，保留银色刃缘与刻纹 |

已确认的完整示意图保存在 `docs/design/visuals/approved-comic-direction.png`。该图只作为视觉参考，不作为烘焙了角色和阵法的游戏背景。

原始生成记录：

- 已确认示意：`exec-f5837632-c7aa-4639-a4c3-69e7c56d016f.png`
- 场景静物层：`exec-a9976502-bc34-42f9-9928-3739b8384948.png`
- 狼：`exec-9db9f431-f7e4-4ed5-958a-284ac6dd9742.png`
- 阵法师：`exec-972c3b9c-0379-44a8-b465-99e85ce2373f.png`
- 火焰最终接入稿：`exec-6865272b-225b-4541-a024-d5232720fe6f.png`
- 根石最终接入稿：`exec-4dba73ed-00b1-4c07-86df-779da03a2c56.png`
- 金属刃最终接入稿：`exec-9c1f2646-3c6b-4042-a9b7-8fbb3033b1c3.png`

火焰首次输出含有烘焙棋盘格，已通过内置工具改为纯黑合成底，游戏不消费该废弃稿。所有运行时所需素材已复制进此目录，无需访问生成工具的用户目录。

提示词见 [制作记录](../../docs/design/visuals/prompts.md)。

2026-09-13 阵法放势：`array-spells-atlas.png` 为金剑、巨根、潮涡、地火、镇岳古印与合鸣大阵六种材质，1536×1024 RGBA。源文件 `exec-32ccee68-6edf-4f08-8997-392511a3010b.png`，由内置 image_gen 生成并原样复制，保留真实透明通道。[提示词与运行时接入](../../docs/design/visuals/array-spells-prompt.md)。

阵法师施法图集源文件：`exec-ddfa0534-2a50-4257-9d46-14fd96f808e5.png`，直接复制为 `mage-cast-atlas.png`。第一版编辑稿出现烘焙棋盘格与多余手臂，未采用。最终选稿由内置 image_gen 重新生成，保留真实 alpha；游戏只按帧裁切、标定脚底与施法手的位置，不进行程序抠图。放出帧的手掌越过标准格线，读取扩展帧宽；下一格裁去相邻手掌所在的空隙，避免断手或重复手掌。

狼群追加素材：`wolf-tiers-atlas.png`（1024×1536 RGBA，四列六行），源文件 `exec-2aa40d7a-eee7-44c1-b969-50cbb1f7a686.png`。前三行为精英狼、后三行为狼王，各自包含奔跑、扑击和倒地四帧。直接保留真实透明通道，运行时校准帧边界与脚底，不进行离线背景清除。普通狼继续使用原图集。

根石与锋刃直接保留内置生成工具输出的透明通道；运行时只取素材所在区域绘制。带有烘焙棋盘格的结构素材试稿没有接入。结构位置、尺寸、地表连接和少量动态均由渲染层根据玩家多边形生成。

2026-09-13 灵体重绘：`ancestor-beast-atlas.png` 为祖兽待机、蓄势、挥爪、收势四姿态，源文件 `exec-a8ef794e-b7d2-4ba9-8198-4715cac97a6a.png`；`element-spirit-atlas.png` 为金剑、藤鹿、水蛟、焰鸟、岩灵的待机与出手，源文件 `exec-0e902133-100a-4e13-94ea-51241279e4a3.png`。均为内置 image_gen 的 1536×1024 RGBA 原稿直接复制。运行时标定不规则格距、脚点和翅尾边界，未做程序抠图。原来的笑脸圆球绘制已删除。[提示词及接入记录](../../docs/design/18-spirit-art.md)。
