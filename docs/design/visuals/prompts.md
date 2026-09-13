# 插画素材制作记录

## 青衣阵法师八帧施法图集（2026-09-12，最终原文）

A NEW transparent PNG sprite atlas of a young Chinese male formation mage for a 2D American graphic novel game. TRUE ALPHA TRANSPARENCY, all blank pixels alpha zero, no background image, no gray squares. Exactly FOUR columns and TWO rows, EIGHT full-body figures. Landscape 1536x1024; equal 384x512 cells. Every figure fits within the MIDDLE 70% of its cell width, 84% height, no overlapping sprites. Feet aligned at 91% height of each cell. He has black hair in a small high topknot, young focused clean-shaven face, faded slate blue layered travel robes with cream collar, ochre rope sash, dark wrapped boots, small rolled cloth backpack. Consistent slightly top-down three-quarter view, facing RIGHT, broad ink contours, painted navy shadows and subdued warm edges, fantasy forest comic illustration. Anatomically correct EXACTLY TWO ARMS AND TWO HANDS per person. The left arm always stays down gripping a crooked wooden staff on the LEFT of the image. Only the right arm on the RIGHT of the image moves. All 8 cells form a single smooth casting cycle: 1 right arm relaxed down; 2 bend right forearm toward chest; 3 lift right arm up with elbow bent and index+middle fingers together; 4 extend right forearm halfway toward the RIGHT; 5 fully extend that SAME right arm to the RIGHT with two fingers pointing, leaning torso slightly; 6 open right hand and sweep down halfway; 7 lower right arm close to torso; 8 return to pose 1. Left arm remains down holding staff in EVERY pose. No extra arms, no extra hands, no other props, no spell effects. Keep feet planted and staff stable, animate the right arm, shoulders, waist and sleeves. Entire body head to boots visible, robe edges and staff completely within each cell. Minimal change of body shape between frames. Isolated sprites on a truly transparent alpha background, no text, no labels, no shadows, no painted floor, no grid or checkerboard.

输出：`exec-ddfa0534-2a50-4257-9d46-14fd96f808e5.png`，直接复制至 `public/art/mage-cast-atlas.png`，1536×1024 RGBA。原始输出位于当前任务 `generated_images` 目录。第一版编辑稿 `exec-2d3ab0b5-a9d5-47dd-93e7-55e2abe956af.png` 有烘焙棋盘格与多余手臂，已拒绝、未接入。最终稿检查了实际 alpha；运行时裁切手掌延伸区域和相邻格空隙，保留原始素材。

工具：内置 image_gen。当前素材路径见 [素材清单](../../../public/art/README.md)。全部用于本项目，最终文件已存入仓库目录。

## 统一再制作说明

以下是根据最终选稿整理的再制作要求，便于后续保持风格一致。

- **已确认示意**：2D 美漫插画风；夜间林缘营地、左上帐篷与篝火、年轻青衣阵法师，右侧溪流与远山；中央宽敞安静的土质空地；火阵在左，随形弯曲水阵在右，狼群来袭；手绘墨线、蓝灰夜色与暖橙火光。背景简洁，阵法为主体。
- **场景层**：以已确认示意为参考，保留构图、地面、树木、帐篷、山体与河岸。移除人物、狼及玩家阵法；营地只留柴薪和石圈。天然河床保留平整深青色，水纹与营火留给运行时动态层。
- **狼图集**：同一只蓝灰色狼，略俯视、侧向可读，手绘墨线与分层明暗；4 列×3 行，奔跑、咬击、倒下各四帧；大小与单元位置一致，透明背景。
- **阵法师**：年轻中国男性、青衣、束发、木杖、旅途装备；完整身体、略俯视，与场景一致的手绘轮廓和冷暖光色；透明背景。
- **火焰**：参考已确认示意中火阵的笔触，制作同一处地面火势的 12 帧循环，4 列×3 行。保留细长卷曲火舌、橙红边缘和淡黄热核，不同帧自然变形；无文字或网格，地面原点一致。

## 火焰最终编辑提示词（原文）

Edit this production fire animation atlas. Preserve EXACTLY the same 4-column 3-row grid, twelve flame silhouettes, size, position, color and frame order. Replace all checkerboard squares and all gray/white background or haze with a perfectly solid pure black #000000 background. Only saturated orange/red/yellow flame and hot pale-yellow cores and sparks remain visible. No checkerboard, no gray smoke, no white outlines or white halos. Black between the thin tongues, black between cells. The final atlas is intended for additive screen blending in a game; black is therefore the required backdrop. Match the reference fires' delicate hand-painted graphic novel texture. Keep flame bases in every cell aligned at 92% cell height. Do not add any objects, labels, cells or text.

输入是第一版火焰序列，输出为 `public/art/fire-atlas.png`。纯黑背景用于运行时 screen 混合；没有用脚本抠图或重绘素材。


## 根石最终生成提示词（原文）

Create a TRANSPARENT BACKGROUND PNG game sprite sheet with alpha transparency. Twelve isolated hand-inked graphic-novel fantasy terrain props arranged in EXACTLY 4 columns and 3 rows equal square cells, no overlap across cells. TOP ROW: four variants of dark gunmetal upright blade stones, silver warm edges and small rocky foot. MIDDLE ROW: four variants of branching gnarled brown roots with small ferns and moss. BOTTOM ROW: four variants of squat gray blue rock clusters joined with ochre dirt. 2D American graphic novel ink outlines and textured brush shading, restrained natural colors for a moonlit forest game, elevated three quarter camera looking down toward ground. Each sprite fully visible and centered in its cell, ground contact at 85 percent of each cell height. Props should fill about 78 percent of cell width, metal 73 percent of cell height, roots and rocks 53 percent high. ONLY isolated props on real transparent background, PNG with alpha channel. Empty areas and spaces between roots must be transparent. No floor rectangle, no frame, no text, no grids. Export transparency, never draw a checkerboard. Black outlines are part of the props and should remain.

输出：`public/art/formation-atlas.png`。选用中间根系、底部岩块；顶行石柱未接入。图集拥有实际 alpha 通道。

## 金属锋刃最终生成提示词（原文）

A transparent-background PNG sprite sheet: exactly FOUR isolated upright forged sword-blade relics in a single horizontal row, evenly spaced. Game props for a hand-inked American graphic novel fantasy forest. These are unmistakably METAL SWORDS half embedded in the ground: sharp asymmetric cutting blades, very dark gunmetal blue faces, thin bright silver cutting edges, small engraved golden diamond rune. Four different slightly curved or notched silhouettes, small rock and soil foot beneath each, no full sword handles. Matte hand-painted textures and heavy ink contour, three quarter elevated view looking down. Each blade body slim, height 3 times width. Full blade and foot visible, tips at 8 percent and foot at 90 percent image height; each prop stays within its own quarter of image. Medium-wide horizontal canvas. TRUE TRANSPARENT ALPHA BACKGROUND PNG, empty pixels have zero alpha, all props isolated. No scene, no labels, no grid, no checkerboard, no colored backdrop.

输出：`public/art/metal-atlas.png`。四列单行，实际 alpha 通道。两份最终素材均使用内置 image_gen 直接生成，未使用 CLI 或程序抠图。

## 精英狼与狼王图集（2026-09-12，原文）

Create a production 2D game sprite sheet PNG with TRUE TRANSPARENT alpha background. Portrait canvas, exactly FOUR equal columns and SIX equal rows, 24 separate square cells, NO margins between grid cells, no printed grid, no text, no shadows, no floor. Each individual wolf entirely fits its own cell with clear empty padding, ground feet baseline at 79% of cell height. All wolves face RIGHT in a side view with a slight top-down view, consistent registration and proportions in each animation. American graphic novel illustration, bold dark ink contours, hand-painted cool slate fur, limited warm highlights, crisp readable silhouettes, natural quadruped wolf anatomy. Designed for a night forest tactical game. Rows 1-3 are the SAME ELITE WOLF: charcoal blue-black fur, bristling shoulders, nicked ear, visible pale shoulder scar, amber eyes, lean muscular predatory anatomy. Row 1: four sequential distinct galloping running poses, fully extended, landing forelegs, compressed tucked legs, spring off hindlegs. Row 2: four sequential attack poses, crouched anticipation with head low, airborne forward pounce, extended open-jaw bite, braced landing recovery. Row 3: death sequence, recoil head drawn back on hit, knees buckling, falling on side, fully lying dead. Rows 4-6 are the SAME WOLF KING: massive silver-white shaggy mane around neck and chest, dark slate grey body and tail, long rugged muzzle, amber eyes, broad shoulders, powerful forelegs, distinctive imposing natural wolf. NO crown, no armor, no human accessories, no glowing aura. Row 4: four sequential running poses same phases as elite. Row 5: four sequential attack poses crouched anticipation, airborne forward pounce, open-jaw bite, heavy braced landing. Row 6: death sequence recoil, knees buckle, fall, lying dead. Each wolf occupies approx 80% of its square cell width; wolf king's imposing mane and anatomy distinguish it intrinsically, same cell scale. Ensure every one of 24 drawings exists, has full tail and paws, and no sprites overlap their neighboring cells. True alpha transparency, not checkerboard painted into image.

输出：`exec-2aa40d7a-eee7-44c1-b969-50cbb1f7a686.png`，复制为 `public/art/wolf-tiers-atlas.png`。1024×1536，已检查透明像素实际 alpha 为 0。内置工具直接生成；运行时按校准后的行边界、脚底和帧间距读取。原始输出保留在当前任务的 generated_images 目录。
