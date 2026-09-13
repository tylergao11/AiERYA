# 阵法放势材质图集

2026-09-13，使用内置 `image_gen` 生成，未使用 CLI 或外部图片库。

- 最终游戏文件：`public/art/array-spells-atlas.png`，1536 × 1024 RGBA。
- 原稿：`exec-32ccee68-6edf-4f08-8997-392511a3010b.png`，直接复制，保留原始 alpha。
- 三列两行：金剑、巨根、潮涡 / 地火、镇岳古印、合鸣大阵。
- alpha 抽查：范围 0–253，386574 像素完全透明，图集边角为 0。没有使用程序抠图或棋盘格消除。
- 运行时使用 `src/render/array-spell-textures.ts` 按格读取，依实际阵势伸展、收拢、分前后层遮挡。古印文字由 Canvas 在留白面上绘制。

生成提示词规格整理：

> Production game VFX texture atlas, a single 3-column by 2-row layout, landscape 1536 × 1024 with six 512-pixel cells and padded transparent gutters. Premium hand-painted Chinese xianxia, ink-wash and gouache physical materials, isometric elliptical ground. Top-left: seven silver-gold ancient swords. Top-middle: gnarled jade-veined roots forming a cage. Top-right: tall turquoise and indigo foamy curling tidal vortex. Bottom-left: golden-orange volcanic flame tongues, copper smoke and ash. Bottom-middle: floating weathered bronze-and-stone seal with a BLANK inset face, sandstone spires and rubble. Bottom-right: gold and bronze ritual halo with five knots and an empty center. Strong painterly light and dark, genuinely transparent alpha. No landscape, characters, UI, labels, text or watermark. Exact grid of independent padded cells.

实际接入截图：`artifacts/array-material-*.jpg`。图片是实机事件与摄像机共同渲染的结果，素材图集本身不含敌人、伤害字和 UI。

声音由 `scripts/build-array-audio.mjs` 原创合成：刀锋、木裂、水泡、火噼啪和落石使用不同的包络、频谱与节奏，五种相克和辅助音各有独立片段。每音两种变体，共 32 段。输出 `public/audio/array-spells.ogg` 与 `.mp3`，不引用第三方采样。复现需要 Node 和 FFmpeg，可通过 `FFMPEG` 环境变量指定程序。`artifacts/audio/array-five-elements.wav` 是八秒五系试听，顺序金木水火土。
