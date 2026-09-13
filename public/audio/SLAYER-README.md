# 杀伐音效

`slayer-blades.wav` 是本项目程序生成的原创音效素材，不含外部录音或采样。

- 24 kHz、16 bit、单声道音效图集，39 个片段，共约 786 KB。
- 13 类反馈，每类 3 个音色变体：空挥、快斩、重斩、满蓄重斩、回锋、破甲、受阻、三档蓄力、连斩升阶、斩获回灵、千锋归一。
- 生成源：`src/ui/slayer-sound-bank.ts`；运行 `node scripts/generate-slayer-audio.mjs` 重建素材。
- 运行时只解码一次、按片段播放，不在命中或逐只怪物身上合成。
- `SlayerAudio` 接入 `Soundscape` 及项目统一音效总线，遵守音量、静音和暂停控制。最多 8 个刀声声部，合技压低低优先级声部并请求背景音乐短时降音。
- `artifacts/slayer/slayer-sound-reel.wav` 是按上述次序排列的试听带，间隔 1.25 秒；实际战斗使用相同素材和优先级混音。
- 连斩升阶由战斗事件 `tierRaised` 决定：断连重起重新反馈，暂停或静音恢复同档不重复升阶。`artifacts/slayer/audio-lab.html` 可生成八秒实际付费攻击的浏览器原生混音试听，并检查真实播放次数、峰值和尾音。
