# 构筑选取插画补齐 · 2026-09-13

本轮修复选取卡片缺少主插画的问题。召唤动作演示原先替代了主插画；部分技能又复用了不对应机制的通用图。现在所有领悟均保留主插画，点击详情在当前卡片内查看演示和完整规则，相邻卡片不位移。领悟后，构筑页显示同一幅技能插画。

## 当前覆盖

| 内容 | 覆盖 |
| --- | --- |
| 普通领悟 | 33 项，每项独立配图：杀伐 3、布阵 6、召唤 9、五行强化 5、通用 5、连招 5 |
| 开局天赋与途中机缘 | 9 项，开局与途中使用同一技能配图 |
| 天授 | 3 项完整构图，替代两张普通天赋图叠放 |
| 觉醒、升华 | 按杀伐、布阵、召唤分别配图；双修、三修同时展示对应流派；祖兽强化使用祖兽图 |
| 补给 | 与灵资共用储灵题材插画 |

布阵按当前代码中的“五行辅阵、五行通脉、周天双阵、周天合鸣”配图，保留专门的 `array-support-paintings`，避免沿用已经不适用的阵灵题材。实际映射以 `src/ui/manuscript-art.ts` 为准。

## 资源

- `public/art/ui/reward-martial-paintings.webp`：杀伐与六种布阵领悟。
- `public/art/ui/reward-spirit-paintings.webp`：九种召唤领悟。
- `public/art/ui/reward-mystic-paintings.webp`：四种通用领悟与五种连招。
- `public/art/ui/reward-elements-paintings.webp`：五行强化与修营。后续布阵机制调整后，末行候选图未启用。
- `public/art/ui/destiny-progress-paintings.webp`：杀伐、召唤的天授及突破。布阵三格由专用图集替代。
- `public/art/ui/array-support-paintings.webp`：当前四项布阵天赋与突破插画。

本轮生成的 PNG 原稿和完整提示词保存在 `docs/design/visuals/warm-scroll-v2/` 下的 `build-art-prompts.json`、`build-art-elements-prompt.json` 及同名图片中。原稿保留，运行时使用 WebP。全部卡面资源进入开场解码队列。

同时将演示里的狼、灵体、祖兽、施法者路径改为发布包实际保留的 WebP，消除开发环境有图、发布包缺图的差异。

## 验证

- `tests/reward-art-coverage.test.ts` 遍历当前完整目录、九种开局、各流派突破和混合构筑，验证配图存在、领悟前后保持一致、未登记的新技能不能静默使用通用图。
- 同召唤成长、机缘说明、纸墨 UI、公共界面与资源预加载测试一起运行：6 个文件、46 项通过。
- TypeScript 和正式构建通过；资源原稿、运行资源哈希和尺寸校验通过。
- 使用实际 `World`、`GameInterface`、`SceneView` 在浏览器逐组检查 33 项领悟、9 项机缘、三流派突破与三种天授。
- 检查 956×440 横屏、左右各 62px 和底部 21px 安全区，以及 1280×720。点击详情、返回、领悟、打开构筑完成操作闭环。详情不挤动相邻卡片；插画保持正方形；底部操作完整可见。
- 证据位于 `artifacts/visual-review/build-art-completion/`。发布构建检查页通过独立构建输出，不向正式入口加入测试选项。上述为浏览器验证，不宣称真机验收。
