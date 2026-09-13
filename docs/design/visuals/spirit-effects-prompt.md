# 召唤攻击素材 · 2026-09-13

工具：内置 imagegen。实装文件：`public/art/spirit-effects-atlas.png`，1536 × 1024。

五列分别为金、木、水、火、土；三行分别为飞行、命中、合击。列分界为 0 / 309 / 623 / 932 / 1237 / 1536；行分界为 0 / 300 / 640 / 1024。

生成方向：2D 手绘修仙战斗材质，强轮廓；金为宽刃剑锋，木为实体荆棘，水为龙首浪涌，火为凤凰焰羽，土为岩拳碎石。各元素独立绘制飞行、接触、合击三种素材，避免通用光球和星形爆点。

初版生成的透明请求没有得到真实 alpha，透明修订也生成了棋盘格。两版均未接入项目。最终采用纯黑底特效图，以 Canvas screen 合成，沿用项目火焰的材质合成方式，不把黑底作为实体矩形画进场景。原始生成图保留在生成目录。

最终修订提示词：

> Production VFX compositing edit. Replace ALL the gray checkerboard background with perfectly flat pure RGB BLACK #000000. Keep the 15 illustrated VFX in the exact 5 columns x 3 rows. Output 1536x1024. These sprites will be rendered with SCREEN blending in a game; BLACK is intentionally used as the zero-light transparent matte. Absolutely pure black everywhere between effect objects, zero gray haze, zero checker pattern, zero background glow or gradients. Preserve blade highlights, root body green and gold material, dark blue water body and ivory foam, red orange fire with small golden highlights, solid ochre and tan rock material. Slightly brighten the solid thorn-root and rock material midtones for screen blending. Keep every effect fully inside its cell with 12 pixels of pure black margin along every cell boundary; scale individual effects down within their cell if needed. This is a BLACK MATTE VFX atlas, not a transparency demonstration. No checkerboard.

接入规则：材质包围框仅在加载时扫描一次；每次攻击使用真实的发射/接触事件。强化发射宽度增加，同契使用第三行素材。宝宝伤害保留少量碎屑，停止叠加通用命中星芒。群体法术的实际半径、命中、消耗均未因图片扩大而改变。

宝宝的视觉比例：凤凰 1.70、水龙 1.68、石卫 1.58、灵鹿 1.50、剑灵 1.38、祖兽 1.42 倍。支援灵视觉缩放下限 0.90。原始碰撞、距离与移动数值保持不变。邻近悬浮灵体平滑错开，出手源点、阴影与御令标记使用同一视觉锚点。

预览：`/artifacts/visual-review/summon-effects.html`。此页面只驱动美术时钟，循环展示出场、本命攻击、御令强化、同契合击；不运行对局、不显示模拟伤害。
