# 全局声音资源

本目录的 `night-theme`、`war-drums`、`tightening-strings`、`wind`、`river`、`embers`、`forest-cues` 由全局声音任务负责。流派负责人另外维护各自命名的技能声音文件。

## 配乐与声音设计

原创编排「东方暗林」第二版：96 BPM、48 小节、120 秒，以 D 宫五声音阶和开放和声为中心。主题、鼓和紧张弦乐拆成同步循环层，分别使用稀疏长笛乐句、柔和大提琴长音、短促打击与弓弦。六段乐句与节奏交替，每八小节留出呼吸；主题中不再循环拨弦或低锣。环境包含风、溪流与营火。

`forest-cues` 为 31 类通用与敌人音效的音频图集。通用布阵、五行施法、命中和停时使用短材质音，代替旧的正弦滑音；三个流派已有命中声时不再叠加通用命中提示。每段独立渲染，片段间留静音，播放时做短淡入淡出；元数据与内容版本号在 `src/audio/catalog.ts`。

24 kHz 源文件输出 OGG 与 MP3，优先 OGG，解码失败后回退 MP3。资源请求携带内容版本号，避免旧配乐缓存。游戏只请求需要的编码版本，原始制作 WAV 与乐器单音不进入游戏加载路径。分项音量之后统一处理低频堆积与刺耳频段，保留重击瞬态和主音量峰值保护。当前调优与验证记录见 `docs/design/26-audio-rework.md`。

## 录音素材来源

- [VS Chamber Orchestra: Community Edition](https://github.com/sgossner/VSCO-2-CE)：Sam Gossner、Simon Dalzell 录制，Elan Hickler / Soundemote 切样。CC0-1.0。固定版本 `440300901dfe9275fd84e0b7763af1f8443ae62e`，逐文件路径与 SHA-256 见 `instrument-sources.json`，许可全文见 `VSCO-CC0.txt`。使用单音进行原创编排。
- [Dog Snarl Grunt Grumble](https://opengameart.org/node/5407)：qubodup，CC0。犬类低吼与呜声经过剪辑、移调和分层，作为狼的动作声音材料。
- [Wolf Monster Sound](https://opengameart.org/content/wolf-monster-sound)：CaveboyTup，CC0。作者以马的鼻息录音制作的幻想怪物叫声，用于本项目的怪物声线。文件校验信息见 `creature-sources.json`。

除以上录音材料，音乐编排、合成气息、拨弦、打击层、环境与事件混音由本项目制作。

## 复现

在项目根目录运行，制作工具需要 Node、FFmpeg、curl 和支持 7z 的 tar（当前 Windows 环境已验证）：

```sh
node scripts/fetch-forest-instruments.mjs
node scripts/fetch-forest-creatures.mjs
node scripts/build-forest-audio.mjs
node scripts/verify-forest-audio.mjs
```

可用 `FFMPEG` 指定编码器路径。制作中间文件位于 `artifacts/audio/`；构建后的游戏仅使用本目录中的成品声音，不依赖外部素材站点。
