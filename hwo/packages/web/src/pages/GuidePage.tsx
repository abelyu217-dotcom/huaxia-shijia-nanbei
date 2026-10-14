/**
 * GuidePage —— 游戏说明 / 新手引导页
 *
 * 参考 Rim Attack 游戏说明页：
 *   - 新手引导 tab：分步骤展示游戏入门流程（5-7 步）
 *     每步显示标题、描述、操作提示，已完成的步骤显示绿色对勾
 *     （完成状态保存在 localStorage，key: hwo_guide_steps）
 *   - FAQ tab：常见问题列表（10+ 条），可展开 / 折叠的问答
 *   - 规则手册 tab：游戏规则分类展示（赛季 / 球员能力 / 战术 / 训练 /
 *     交易 / 经济），每个分类可展开详情
 *
 * 页面不需要 props；标签页切换与展开折叠均使用本地 state。
 */

import { useEffect, useState } from "react";

type GuideTab = "onboarding" | "faq" | "rules";

interface OnboardingStep {
  id: string;
  title: string;
  desc: string;
  tip: string;
}

interface FaqItem {
  id: string;
  q: string;
  a: string;
}

interface RuleSection {
  id: string;
  title: string;
  summary: string;
  details: { label: string; text: string }[];
}

const GUIDE_STEPS_KEY = "hwo_guide_steps";

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "step-register",
    title: "注册账号并领取球队",
    desc: "完成账号注册后即可在主页领取一支球队，开启你的执教之旅。",
    tip: "前往登录页注册，首次登录将自动分配初始球队与基础阵容。",
  },
  {
    id: "step-roster",
    title: "查看阵容，了解球员能力",
    desc: "进入我的球队页查看现有球员，重点关注 OVR、潜力、位置与性格。",
    tip: "前往 我的球队 → 阵容 标签，点击球员卡片查看详细能力。",
  },
  {
    id: "step-lineup",
    title: "设置首发阵容和出场时间",
    desc: "挑选首发五人并分配出场时间，合理安排轮换避免体力透支。",
    tip: "前往 我的球队 → 阵容 标签，拖动球员到首发位并调整分钟数。",
  },
  {
    id: "step-tactic",
    title: "配置战术（基础模式开始）",
    desc: "新手建议先使用基础战术模式，熟悉节奏后再切换高级自定义。",
    tip: "前往 我的球队 → 战术 标签，选择进攻侧重 / 防守侧重 / 末节策略。",
  },
  {
    id: "step-schedule",
    title: "推进赛程，查看比赛结果",
    desc: "在赛程页推进一日，结算当日全部比赛并查看比分与技术统计。",
    tip: "前往 赛程 页，点击「推进一日」按钮，再点开比赛查看战报。",
  },
  {
    id: "step-train",
    title: "训练球员提升能力",
    desc: "通过生涯页的训练 Drill 提升球员能力，按潜力分配训练资源。",
    tip: "前往 生涯 页，选择球员与 Drill 后执行训练，能力将随评级提升。",
  },
  {
    id: "step-trade",
    title: "参与交易和选秀补强阵容",
    desc: "通过交易页发起 P2P 报价、签约自由球员，或在选秀页挑选新秀。",
    tip: "前往 交易 页发起报价，或前往 选秀 页按乐透顺位挑选新秀。",
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    id: "faq-lineup",
    q: "如何设置首发阵容？",
    a: "前往 我的球队 → 阵容 标签，将目标球员拖入首发槽位，并调整每位球员的出场时间。建议保留 2-3 名替补以保证轮换深度。",
  },
  {
    id: "faq-tactic",
    q: "战术怎么选？",
    a: "前往 我的球队 → 战术 标签。新手建议从基础模式开始，选择进攻侧重与防守侧重即可；熟悉后再切换高级模式自定义每节策略。",
  },
  {
    id: "faq-train",
    q: "怎么训练球员？",
    a: "前往 生涯 页，选择目标球员与训练 Drill 后执行训练。Drill 评级越高，能力提升越明显；潜力高的球员成长空间更大。",
  },
  {
    id: "faq-trade",
    q: "如何交易球员？",
    a: "前往 交易 页发起 P2P 报价，向其他经理提出球员互换 / 选秀权 / 薪资补偿等方案，对方接受后即成交。也可在交易页签约自由球员。",
  },
  {
    id: "faq-draft",
    q: "选秀怎么操作？",
    a: "前往 选秀 页，按乐透顺位依次挑选新秀。休赛期会开启选秀大会，球探报告会标注各新秀的潜力与即战力评级。",
  },
  {
    id: "faq-salary",
    q: "薪资帽是什么？",
    a: "薪资帽是球队薪资总额的上限。前往 财务 页可查看当前薪资总额、剩余空间与奢侈税情况，超额将触发处罚机制。",
  },
  {
    id: "faq-scout",
    q: "球探有什么用？",
    a: "前往 球探 页，球探会持续发现潜力新秀并生成观察报告。可将心仪球员加入观察名单，便于休赛期选秀与交易决策。",
  },
  {
    id: "faq-playoff",
    q: "如何查看季后赛对阵？",
    a: "前往 季后赛 页，常规赛结束后将自动生成东西部种子与对阵表。季后赛采用淘汰赛制，胜者晋级下一轮。",
  },
  {
    id: "faq-daily",
    q: "每日奖励怎么领？",
    a: "点击顶栏「每日奖励」按钮即可领取当日奖励，连续登录可累积更丰厚的奖励，包含 Coins、Credits 与道具。",
  },
  {
    id: "faq-arena",
    q: "竞技场怎么玩？",
    a: "前往 竞技场 页挑战其他玩家球队，胜出可获得竞技场积分与赛季排名奖励，是检验阵容强度的快速通道。",
  },
  {
    id: "faq-coins",
    q: "Coins 和 Credits 有什么区别？",
    a: "Coins 为游戏内基础货币，可通过比赛与任务获取；Credits 为高级货币，主要用于稀有球员卡与外观道具，可通过每日奖励或活动获取。",
  },
];

const RULE_SECTIONS: RuleSection[] = [
  {
    id: "rule-season",
    title: "赛季规则",
    summary: "常规赛 + 季后赛两阶段构成完整赛季。",
    details: [
      {
        label: "常规赛",
        text: "所有球队按既定赛程进行循环比赛，按胜率排定东西部积分榜，决定季后赛种子席位。",
      },
      {
        label: "季后赛",
        text: "东西部各取前 4 名种子，采用 4 强单败淘汰制：半决赛 1v4 / 2v3，胜者会师决赛，决出总冠军。",
      },
      {
        label: "休赛期",
        text: "赛季结束后进入休赛期，开启选秀大会、自由球员签约与青训结业，期间可大幅调整阵容。",
      },
    ],
  },
  {
    id: "rule-player",
    title: "球员能力",
    summary: "OVR / 潜力 / 位置 / 性格共同决定球员价值。",
    details: [
      {
        label: "OVR（综合评分）",
        text: "球员当前即战力的综合评分，0-99 分，越高代表当前实力越强。",
      },
      {
        label: "潜力",
        text: "球员未来成长上限，潜力高的球员通过训练能获得更大提升，是新秀评估的核心指标。",
      },
      {
        label: "位置",
        text: "球员擅长的场上位置（PG / SG / SF / PF / C），在擅长的位置上能力加成更高。",
      },
      {
        label: "性格",
        text: "影响球员训练效率、战术执行度与团队化学反应，如领袖型提升队友表现，懒散型训练效率下降。",
      },
    ],
  },
  {
    id: "rule-tactic",
    title: "战术系统",
    summary: "进攻侧重 / 防守侧重 / 末节策略三维度配置。",
    details: [
      {
        label: "进攻侧重",
        text: "决定球队进攻倾向，如内线强攻、外线投射、快攻反击等，需结合球员位置与能力选择。",
      },
      {
        label: "防守侧重",
        text: "决定防守风格，如人盯人、区域联防、全场紧逼等，影响对手命中率与失误率。",
      },
      {
        label: "末节策略",
        text: "第四节关键时刻的战术倾向，如保住领先、追分模式等，直接影响末节执行力与体能消耗。",
      },
    ],
  },
  {
    id: "rule-train",
    title: "训练系统",
    summary: "Drill / 评级 / 效果三要素决定训练收益。",
    details: [
      {
        label: "Drill（训练科目）",
        text: "不同 Drill 对应不同能力维度，如投篮 Drill 提升投射、防守 Drill 提升防守，需按球员短板选择。",
      },
      {
        label: "评级",
        text: "每次训练会给出评级（S/A/B/C），评级越高能力提升越多，受球员潜力与性格影响。",
      },
      {
        label: "效果",
        text: "训练效果会累积到球员能力上，潜力高的球员单次训练收益更大，长期训练可显著提升 OVR。",
      },
    ],
  },
  {
    id: "rule-trade",
    title: "交易系统",
    summary: "P2P 交易 + 自由球员签约两种补强方式。",
    details: [
      {
        label: "P2P 交易",
        text: "经理间发起报价，可包含球员、选秀权与薪资补偿，对方接受后成交，受薪资帽与合同限制。",
      },
      {
        label: "自由球员签约",
        text: "自由球员池会定期刷新，薪资空间充足的球队可直接签约即战力球员或潜力新秀，先到先得。",
      },
    ],
  },
  {
    id: "rule-economy",
    title: "经济系统",
    summary: "薪资帽 / 合同 / Coins / Credits 四类资源管理。",
    details: [
      {
        label: "薪资帽",
        text: "球队薪资总额上限，超额将触发奢侈税或处罚，需在交易与续约时统筹规划。",
      },
      {
        label: "合同",
        text: "球员合同包含年限与年薪，到期后成为自由球员，续约需考虑薪资空间与球员价值。",
      },
      {
        label: "Coins",
        text: "游戏内基础货币，可通过比赛、任务与每日奖励获取，用于训练、签约等日常开销。",
      },
      {
        label: "Credits",
        text: "高级货币，主要通过活动与每日奖励获取，用于稀有球员卡与外观道具，价值更高。",
      },
    ],
  },
];

function readCompletedSteps(): Set<string> {
  try {
    const raw = localStorage.getItem(GUIDE_STEPS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function saveCompletedSteps(set: Set<string>): void {
  try {
    localStorage.setItem(GUIDE_STEPS_KEY, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

export function GuidePage() {
  const [tab, setTab] = useState<GuideTab>("onboarding");
  const [completed, setCompleted] = useState<Set<string>>(() =>
    readCompletedSteps(),
  );
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);
  const [openRuleId, setOpenRuleId] = useState<string | null>(null);

  // 完成状态持久化到 localStorage
  useEffect(() => {
    saveCompletedSteps(completed);
  }, [completed]);

  function toggleStep(id: string) {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleToggleFaq(id: string) {
    setOpenFaqId((prev) => (prev === id ? null : id));
  }

  function handleToggleRule(id: string) {
    setOpenRuleId((prev) => (prev === id ? null : id));
  }

  const completedCount = completed.size;
  const totalSteps = ONBOARDING_STEPS.length;

  return (
    <div className="page guide-page">
      <header className="page-head">
        <h2>游戏说明</h2>
        <p className="muted">
          新手引导、常见问题与规则手册，参考 Rim Attack 游戏说明页。
        </p>
      </header>

      <div className="tab-nav guide-tabs">
        <button
          type="button"
          className={`tab${tab === "onboarding" ? " is-active" : ""}`}
          onClick={() => setTab("onboarding")}
        >
          新手引导
        </button>
        <button
          type="button"
          className={`tab${tab === "faq" ? " is-active" : ""}`}
          onClick={() => setTab("faq")}
        >
          FAQ
        </button>
        <button
          type="button"
          className={`tab${tab === "rules" ? " is-active" : ""}`}
          onClick={() => setTab("rules")}
        >
          规则手册
        </button>
      </div>

      {tab === "onboarding" && (
        <section className="panel">
          <div className="panel-head">
            <h2>新手引导</h2>
            <span className="hint">
              已完成 {completedCount}/{totalSteps} · 点击步骤可标记完成
            </span>
          </div>
          <div className="panel-body">
            <ol className="guide-steps">
              {ONBOARDING_STEPS.map((step, idx) => {
                const isDone = completed.has(step.id);
                return (
                  <li
                    key={step.id}
                    className={`guide-step${isDone ? " is-done" : ""}`}
                  >
                    <button
                      type="button"
                      className={`guide-step-num${
                        isDone ? " is-done" : ""
                      }`}
                      onClick={() => toggleStep(step.id)}
                      aria-pressed={isDone}
                      title={isDone ? "标记为未完成" : "标记为已完成"}
                    >
                      {isDone ? "✓" : idx + 1}
                    </button>
                    <div className="guide-step-main">
                      <div className="guide-step-title">{step.title}</div>
                      <p className="guide-step-desc">{step.desc}</p>
                      <div className="guide-step-tip">
                        <span className="guide-step-tip-label">操作提示</span>
                        <span className="guide-step-tip-text">{step.tip}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      )}

      {tab === "faq" && (
        <section className="panel">
          <div className="panel-head">
            <h2>常见问题</h2>
            <span className="hint">
              共 {FAQ_ITEMS.length} 条 · 点击展开 / 折叠
            </span>
          </div>
          <div className="panel-body">
            <ul className="faq-list">
              {FAQ_ITEMS.map((item) => {
                const expanded = openFaqId === item.id;
                return (
                  <li
                    key={item.id}
                    className={`faq-item${expanded ? " is-expanded" : ""}`}
                  >
                    <button
                      type="button"
                      className="faq-q"
                      onClick={() => handleToggleFaq(item.id)}
                      aria-expanded={expanded}
                    >
                      <span className="faq-q-text">{item.q}</span>
                      <span
                        className={`faq-chevron${
                          expanded ? " is-open" : ""
                        }`}
                        aria-hidden="true"
                      >
                        ▾
                      </span>
                    </button>
                    {expanded && <div className="faq-a">{item.a}</div>}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {tab === "rules" && (
        <section className="panel">
          <div className="panel-head">
            <h2>规则手册</h2>
            <span className="hint">
              共 {RULE_SECTIONS.length} 个分类 · 点击展开详情
            </span>
          </div>
          <div className="panel-body">
            <ul className="rule-list">
              {RULE_SECTIONS.map((section) => {
                const expanded = openRuleId === section.id;
                return (
                  <li
                    key={section.id}
                    className={`rule-section${
                      expanded ? " is-expanded" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="rule-section-head"
                      onClick={() => handleToggleRule(section.id)}
                      aria-expanded={expanded}
                    >
                      <span className="rule-section-title">{section.title}</span>
                      <span className="rule-section-summary">
                        {section.summary}
                      </span>
                      <span
                        className={`rule-section-chevron${
                          expanded ? " is-open" : ""
                        }`}
                        aria-hidden="true"
                      >
                        ▾
                      </span>
                    </button>
                    {expanded && (
                      <dl className="rule-section-details">
                        {section.details.map((d, i) => (
                          <div className="rule-detail" key={i}>
                            <dt>{d.label}</dt>
                            <dd>{d.text}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
