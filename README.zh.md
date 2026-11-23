# Antigravity Tetris（反重力方块）

> **1920 × 1080 原生渲染 · 16×16 中心八向发射 × 混合消行与同心环共振 · Gemini AI 娘实时毒舌陪伴**

基于 **Phaser 3 + Vite + TypeScript + Vitest** 构建的街机解谜网页游戏：从正中央 `4 × 4` 核心向四周 **8 个方向**发射晶体方块，通过四向整行/列即时消除与 6 层同心环 8 向外扩共振清空外圈，并在腹黑毒舌 **Gemini AI-chan** 与程序化 Synthwave/Lo-Fi 五声音阶电音的陪伴下冲击分难度高分榜。

---

## 核心特性

- **16 × 16 中心八向发射与三级贴墙滑行**
  - 正中 `4 × 4` 核心区生成方块，悬停期间自由调整 8 向（`↑ ↓ ← → ↖ ↗ ↙ ↘`）与 SRS 旋转，外围实时投影“斜飞 + 贴墙滑行”后的精确落点虚影（Ghost Piece）。
  - 飞行全程支持微调与加速，触障触发三向滑行与 `0.25s` 锁定宽限期；生成 `0.5s` 内选向发射触发 **`QUICK!`** 抢跑加分与 `+8%` 充能。
- **同心环优先 + 四向消行 + 四边共振混合消除**
  - **同心环大奖**：内圈（第 2–6 环）填满即直接爆环，内侧残余块（含凸入中心格）按 8 方向局部外扩，拐角 45° 弹出彻底杜绝死角封堵。
  - **四向整行/列即时消 & 十字消**：外围任意横行或竖列填满 16 格立即消除并向对应外墙半区塌陷；横纵同时填满触发 `Cross Clear`。
  - **四边全环共振（`全环共振！`）**：消除北 / 南 / 西 / 东方向行/列即点亮对应棋盘霓虹边框，集齐 `4/4` 四边立即引爆**全环共振**——清空最外圈（第 1 环）全部残留方块并将内侧方块 8 向外扩 1 格，奖励 `1,200 × Level × Flow` 分数与 **`+35%` 星核充能**，随后重置四边进入下一轮收集。
  - **消环/消行/共振优先于 Game Over 判定**：所有消除与外扩/塌陷均在死亡判定前结算，濒死瞬间可通过第 4 边共振外扩极限救场。
- **双难度与星核急救系统（Charge = 100%）**
  - **`EASY` · Nova Bomb（3×3 星爆弹）**：撞击首个障碍或外墙后炸毁周围 `3 × 3` 区域解围。
  - **`HARD` · Stardust Piercer（1×1 穿透弹）**：沿 8 向射线穿透实心阻挡射向最外侧空洞，飞行经过任意外围空洞时可随时按发射/瞬降键就地定格狙击。
- **零切换三套并行输入**
  - **小数字键盘（单手八向）**、**WASD / 方向键（和弦斜向锁存）** 与 **鼠标（绕中心径向瞄准 + 点击）** 同步生效，零模式切换成本。
- **完整 UI 流与防偷看护盾**
  - `Title Screen → Gameplay ⇄ Pause Overlay → Game Over` 完整流转；支持 **EN / 简体中文** 实时热切换（含气泡同句实时翻译）、暂停高斯模糊防偷看护盾（恢复前 `0.6s` 倒计时）与 `localStorage` 分难度 **Easy / Hard Top 5** 本地榜单。
- **Gemini AI-chan 看板娘系统**
  - 从概念立绘提取 6 套 `512×512` 表情（`Smug / Mocking / Bored / Malicious / Shocked / Clap`），覆盖 **14 类战局事件 × 3 句共 42 句双语台词**；具备 6–8 秒普通冷却、高优先级打断、洗牌防重复与 `Shocked → Smug` 1 秒嘴硬转折。
- **星晶视效与纯 Web Audio API 合成音频**
  - 落地 `1.0 → 1.08 → 1.0` 微弹与火花、消除白光 Hitstop 定帧（`50ms / 80ms / 100–105ms`）、棋盘独立微震、顺时针棱镜扫光波、菱形碎片与彩虹冲击波。
  - 内置 `96 BPM` C 大调五声音阶（`Cadd9 -> Am7 -> Fmaj7 -> G6`）程序化 Synthwave/Lo-Fi BGM 序列器（含暂停低通闪避与濒危动态鼓点层）与全事件五声音阶 SFX，并预留外部音频热替换接口。

---

## 快速开始

### 环境要求

- Node.js 18+

### 安装与运行

```bash
# 安装依赖
npm install

# 启动本地开发服务器并在浏览器游玩
npm run dev

# 运行全量单元测试（10 个测试文件 / 64 项测试）
npm test

# TypeScript 类型检查 + 生产构建（输出至 dist/）
npm run build

# 预览生产构建产物
npm run preview
```

> **Windows PowerShell 提示**：若系统策略限制执行 `npm.ps1`，请直接改用 `npm.cmd`（如 `npm.cmd run dev`、`npm.cmd test`、`npm.cmd run build`）。

---

## 操作键位速查

三套输入方案始终同时启用：

| 操作动作 | 小数字键盘 | WASD / 方向键 | 鼠标 + 辅键 |
| :--- | :--- | :--- | :--- |
| **中心八向选向** | `7 8 9` / `4 6` / `1 2 3` | 单键正四向；双键和弦斜向（如 `W+A`） | 绕中心移动鼠标自动吸附 8 向 |
| **顺/逆时针旋转** | `0` / `Enter` / `+` / `-` | **`Space`（顺时针）** / `Q` `Z`（逆）/ `E` `X`（顺） | 鼠标右键 / 滚轮 |
| **发射 / 瞬降 / 穿透定格** | `5` | **`Enter` / `F`** | 棋盘内左键点击 |
| **飞行微调 & 加速** | `7 8 9` / `4 6` / `1 2 3` | `WASD` / 方向键 | 配合键盘或悬停精准瞄准 |
| **暂存方块（Hold）** | `.` | `C` | 鼠标中键 / 侧键 |
| **释放蓄能星核** | `/` | `Shift` | 点击 HUD 蓄能条 |
| **暂停 / 重开** | `Esc` / `P`（暂停）· `R`（重开） | `Esc` / `P`（暂停）· `R`（重开） | 点击 HUD 按钮 |

---

## 项目结构

```text
antigravity-tetris/
├── GDD/                                 # 游戏设计文档、流程 SVG 与看板娘原画概念图
│   ├── gdd_v2_0_way_concentric_tetris.md
│   └── 游戏流程图.svg
├── public/assets/aichan/                # 裁切后的 6 套 512×512 AI-chan 立绘精灵
├── scripts/
│   └── extract-aichan.ps1               # 从 GDD 概念图裁切生成立绘的 PowerShell 脚本
└── src/
    ├── main.ts                          # Phaser 3 入口配置（1920×1080 FIT 居中）
    ├── core/                            # 纯 TS 无头核心规则引擎与 5 组单元测试（无 Phaser/DOM 依赖）
    ├── mascot/                          # 纯 TS Gemini AI-chan 状态机、42 句台词库与单元测试
    ├── audio/                           # Web Audio API 合成引擎、C 大调五声音阶计算与单元测试
    ├── input/                           # 三套并行输入协调器与角度映射单元测试
    ├── storage/                         # localStorage 偏好设置与 Easy/Hard Top-5 榜单管理
    ├── i18n/                            # EN / ZH 双语字典与热切换工具
    ├── render/                          # 棋盘/特效、HUD 与看板娘 Phaser 渲染器
    ├── ui/                              # 玻璃态组件、键位/高分榜弹窗、防偷看暂停遮罩与结算页
    └── scenes/                          # TitleScene（标题与难度选择）& GameScene（对局主循环）
```

---

## 外部音频替换接口（可选）

游戏默认使用零依赖的程序化 Web Audio API 合成 BGM 与音效；如需替换为外部 `.ogg` / `.mp3` / `.wav` 音频资源，可在启动阶段调用 `audioEngine.configureOverrides`：

```ts
import { audioEngine } from './src/audio';

audioEngine.configureOverrides({
  bgm: {
    main: '/audio/bgm-main.ogg',
    danger: '/audio/bgm-danger.ogg',
  },
  sfx: {
    nova_blast: '/audio/sfx-nova.ogg',
    clear_multi: '/audio/sfx-multi-clear.ogg',
  },
});
```

未配置或加载失败的条目会自动无缝回退至内置程序化合成音频。

---

## 设计文档

- [游戏设计文档（GDD v2.2）](GDD/gdd_v2_0_way_concentric_tetris.md)
- [游戏状态流转图](GDD/游戏流程图.svg)
