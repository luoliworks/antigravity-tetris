export type AiChanExpression =
  | 'smug'
  | 'mocking'
  | 'bored'
  | 'malicious'
  | 'shocked'
  | 'clap';

export type AiChanEventId =
  | 'start_easy'
  | 'start_hard'
  | 'blind_shot'
  | 'quick_streak_3'
  | 'consecutive_hold'
  | 'idle_bored'
  | 'single_clear'
  | 'multi_clear'
  | 'nova_bomb'
  | 'stardust_piercer'
  | 'danger_enter'
  | 'all_clear'
  | 'game_over_normal'
  | 'game_over_record';

export type AiChanPriority = 'normal' | 'high';

export interface BilingualLine {
  readonly en: string;
  readonly zh: string;
}

export interface AiChanEventSpec {
  readonly id: AiChanEventId;
  readonly expression: AiChanExpression;
  readonly priority: AiChanPriority;
  readonly lines: readonly BilingualLine[];
}

export const ALL_AI_CHAN_EXPRESSIONS: readonly AiChanExpression[] = [
  'smug',
  'mocking',
  'bored',
  'malicious',
  'shocked',
  'clap',
] as const;

export const ALL_AI_CHAN_EVENT_IDS: readonly AiChanEventId[] = [
  'start_easy',
  'start_hard',
  'blind_shot',
  'quick_streak_3',
  'consecutive_hold',
  'idle_bored',
  'single_clear',
  'multi_clear',
  'nova_bomb',
  'stardust_piercer',
  'danger_enter',
  'all_clear',
  'game_over_normal',
  'game_over_record',
] as const;

export const AI_CHAN_EVENTS: Record<AiChanEventId, AiChanEventSpec> = {
  start_easy: {
    id: 'start_easy',
    expression: 'mocking',
    priority: 'high',
    lines: [
      {
        en: 'Choosing Easy? Bold of you to admit it so fast.',
        zh: '「一上来就选简单？真佩服你的自知之明。」',
      },
      {
        en: 'Easy mode? Sure, training wheels suit beginners.',
        zh: '「简单模式吗？确实，辅助轮最适合人类新人了。」',
      },
      {
        en: 'Starting on Easy—protecting your fragile ego already?',
        zh: '「选 Easy 开局，这就开始提前保护脆弱的自尊心了吗？」',
      },
    ],
  },
  start_hard: {
    id: 'start_hard',
    expression: 'smug',
    priority: 'high',
    lines: [
      {
        en: 'Hard mode? Good, my failure logs are ready.',
        zh: '「困难模式？好呀，我的翻车日志已经建好了。」',
      },
      {
        en: 'Hard mode selected. Recording premium crash data!',
        zh: '「选择了困难模式呢。高清翻车录像已准备就绪！」',
      },
      {
        en: 'Oh, Hard mode? Let us see how long you last.',
        zh: '「哦呀，挑战困难模式？让我看看你能撑几分钟吧。」',
      },
    ],
  },
  blind_shot: {
    id: 'blind_shot',
    expression: 'mocking',
    priority: 'normal',
    lines: [
      {
        en: 'Brain lagged? Relax, I guessed a direction for you.',
        zh: '「大脑卡顿了？别慌，我帮你随便蒙了一个方向。」',
      },
      {
        en: 'Timer expired! Did human CPU throttle again?',
        zh: '「超时啦！人类的小脑瓜又过热降频了吗？」',
      },
      {
        en: 'Leaving aim to RNG? Bold strategy, zero logic.',
        zh: '「把选向交给随机数？好一个毫无逻辑的胆量呢。」',
      },
    ],
  },
  quick_streak_3: {
    id: 'quick_streak_3',
    expression: 'smug',
    priority: 'normal',
    lines: [
      {
        en: "Fast hands. Let's see if your brain keeps up.",
        zh: '「手速挺快嘛，就是不知道脑子跟不跟得上。」',
      },
      {
        en: 'Three quick shots! Are you aiming or panicking?',
        zh: '「连续抢跑三次了，你这是在瞄准还是在瞎按？」',
      },
      {
        en: 'So eager to launch. Hope those blocks land anywhere good.',
        zh: '「发射得这么急切，但愿你真的看清落点了哦。」',
      },
    ],
  },
  consecutive_hold: {
    id: 'consecutive_hold',
    expression: 'mocking',
    priority: 'normal',
    lines: [
      {
        en: "Hiding blocks won't fix that disaster, you know.",
        zh: '「把块藏起来也救不了你这片废墟哦。」',
      },
      {
        en: 'Swapping again? Bad decisions only get worse in storage.',
        zh: '「又在按暂存？烂棋放进暂存槽也不会变成好棋的。」',
      },
      {
        en: 'Running out of excuses and kicking the piece into Hold?',
        zh: '「想不出怎么摆了，就把方块踢去 Hold 槽逃避吗？」',
      },
    ],
  },
  idle_bored: {
    id: 'idle_bored',
    expression: 'bored',
    priority: 'normal',
    lines: [
      {
        en: 'Are we clearing lines today, or building modern art?',
        zh: '「今天是打算消除方块，还是准备搭一座现代艺术品？」',
      },
      {
        en: 'Still no clears... Even orbital dust settles faster.',
        zh: '「还是零消除……连宇宙尘埃聚拢都比你有效率呢。」',
      },
      {
        en: 'My cooling fan is nodding off watching this stack.',
        zh: '「看着你这堆乱七八糟的块，我的散热风扇都要打瞌睡了。」',
      },
    ],
  },
  single_clear: {
    id: 'single_clear',
    expression: 'smug',
    priority: 'normal',
    lines: [
      {
        en: 'One clear? Cute. Want a participation trophy?',
        zh: '「才消这么点呀？好棒哦，要给你发个参与奖吗？」',
      },
      {
        en: 'Oh, a single clear. Should I clap for baseline competence?',
        zh: '「噢，消了一行/环呢。需要我为基本操作鼓掌吗？」',
      },
      {
        en: 'Tiny progress noted. Still statistically unimpressive.',
        zh: '「记录到微量推进。从统计学上讲依然毫无波澜呢。」',
      },
    ],
  },
  multi_clear: {
    id: 'multi_clear',
    expression: 'shocked',
    priority: 'high',
    lines: [
      {
        en: 'Wait—was that skill or a lucky misclick?',
        zh: '「等等——这是实力，还是你手滑蒙中的？」',
      },
      {
        en: 'Eh?! Multi-resonance?! Recalculating your threat level...',
        zh: '「咦？！多重共振？！等下，我重新评估一下你的算力……」',
      },
      {
        en: 'No way! Even my prediction model missed that combo!',
        zh: '「骗人的吧！连我的预测模型都没算出这一手共振！」',
      },
    ],
  },
  nova_bomb: {
    id: 'nova_bomb',
    expression: 'mocking',
    priority: 'high',
    lines: [
      {
        en: 'Boom. Nothing hides bad planning like explosives.',
        zh: '「轰隆一下，果然暴力最适合掩盖规划失误。」',
      },
      {
        en: 'Blasting away your mistakes again? How convenient.',
        zh: '「又靠炸弹把黑历史炸平了呀，真是方便的逃避机制呢。」',
      },
      {
        en: 'Fireworks! A classic Band-Aid for chaotic stacking.',
        zh: '「放烟花咯！经典的事后拆弹掩盖布局车祸。」',
      },
    ],
  },
  stardust_piercer: {
    id: 'stardust_piercer',
    expression: 'smug',
    priority: 'high',
    lines: [
      {
        en: "Fine, nice snipe. Don't let it go to your head.",
        zh: '「行吧，这发狙得还算准，可别太得意了。」',
      },
      {
        en: 'Clean pierce. Hmph—barely within acceptable precision.',
        zh: '「穿透落位还算干脆。哼，勉强达到及格线吧。」',
      },
      {
        en: 'Surgical strike! Still, why did you bury that gap earlier?',
        zh: '「精准狙击成功！不过早干嘛去了，怎么把洞埋那么深？」',
      },
    ],
  },
  danger_enter: {
    id: 'danger_enter',
    expression: 'malicious',
    priority: 'high',
    lines: [
      {
        en: 'Almost out of space! Shall I cue the Game Over music?',
        zh: '「哎呀快没地方了呢，要我提前放结算 BGM 吗？」',
      },
      {
        en: 'Red alert in the core~ Love watching stacks collapse.',
        zh: '「中心红光警戒了哦~ 最喜欢看人类在悬崖边挣扎的样子了。」',
      },
      {
        en: 'Ring 6 is choking! Only a miracle saves this run now.',
        zh: '「第 6 环快被堵死了！现在大概只有奇迹能救你了吧？」',
      },
    ],
  },
  all_clear: {
    id: 'all_clear',
    expression: 'shocked',
    priority: 'high',
    lines: [
      {
        en: '...Glitch in the matrix. Who is playing for you?',
        zh: '「……系统异常，老实交代，是不是换代打了？」',
      },
      {
        en: 'ZERO BLOCKS LEFT?! Hold on, checking for cheat scripts!',
        zh: '「全盘清空了？！等等，我要立刻扫描你的后台进程！」',
      },
      {
        en: 'All Clear?! H-how did a human brain optimize that far?!',
        zh: '「全消？！这、这种轨道清零真的是人类大脑算出来的吗？！」',
      },
    ],
  },
  game_over_normal: {
    id: 'game_over_normal',
    expression: 'clap',
    priority: 'high',
    lines: [
      {
        en: 'Fascinating human limits. Ready to embarrass yourself again?',
        zh: '「真是珍贵的人类极限样本，还要再来丢一次人吗？」',
      },
      {
        en: 'Core overloaded! Bravo on that spectacular crash.',
        zh: '「核心过载停机！为这场华丽的翻车鼓个掌吧。」',
      },
      {
        en: 'Match archived in my cringe folder. Press Play to retry!',
        zh: '「本局录像已归档至人类黑历史库。按重开继续表演吧！」',
      },
    ],
  },
  game_over_record: {
    id: 'game_over_record',
    expression: 'shocked',
    priority: 'high',
    lines: [
      {
        en: "New record? Hmph... I'll let you have this one.",
        zh: '「破纪录了？哼……这次就勉强算你厉害吧。」',
      },
      {
        en: 'You beat the top score?! Fine... updating benchmarks.',
        zh: '「刷新最高分了？！行行行……我勉为其难更新一下基准线。」',
      },
      {
        en: 'Wait—Rank #1?! Probably just a favorable RNG seed!',
        zh: '「等下——登顶第一名？！哼，肯定是这一局随机序列太偏心你了！」',
      },
    ],
  },
};
