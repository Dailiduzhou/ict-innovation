// Mechanism chapters, NOT measured traces or a strict chronological recording.
// The quoted lines are resolved against the existing fictional scenario at build time.
const edgeContract = {
  voiceIn: [0, 'elder', 'assistant'], voiceOut: [1, 'assistant', 'elder'],
  turnEvent: [2, 'assistant', 'events'], trigger: [3, 'events', 'agent'],
  command: [4, 'agent', 'gateway'], receipt: [5, 'gateway', 'agent'],
  memoryIO: [6, 'gateway', 'memory'], memoryResult: [7, 'memory', 'gateway'],
  replyContext: [8, 'agent', 'assistant'], reminderSave: [9, 'gateway', 'reminder'],
  reminderResult: [10, 'reminder', 'gateway'], share: [11, 'gateway', 'projection'],
  shareRead: [12, 'projection', 'portal'], familyView: [13, 'portal', 'family'],
  familyAction: [14, 'family', 'portal'], collaboration: [15, 'gateway', 'request'],
  collaborationRead: [16, 'request', 'portal'], familySubmit: [17, 'portal', 'gateway']
};
const chapters = [
  {
    id: 'listen', title: '先接住老人的话', label: '01 语音与并行', quoteId: 'A01',
    summary: 'AI 助理负责自然倾听和回应；最终轮次同时流向后台 Agent，不把聊天变成串行填表。',
    input: '陈阿姨讲述鱼的近况。手机持续语音交互是设计目标。',
    process: '语音侧识别轮次、修订与打断；已提交轮次携带来源，异步唤起后台整理。',
    output: '先说“我听到了”，但不提前宣布记忆或提醒已经保存。',
    rule: 'AI 助理与后台 Agent 是逻辑职责，未强制使用两个模型。动画不证明全双工或并行处理已实现。',
    edges: ['voiceIn', 'voiceOut', 'turnEvent', 'trigger'],
    nodes: ['elder', 'assistant', 'events', 'agent'],
    badges: { assistant: '倾听 / 回应', agent: '收到最终轮次' }
  },
  {
    id: 'recall', title: '相关记忆先经过权限校验', label: '02 记忆获取', quoteId: 'B01',
    summary: 'Agent 不会天然“记得一切”。它先用陈阿姨的身份和本轮目的，经网关检索相关个人记忆。',
    input: '“上回鱼缸的事” + 当前用户 elder-chen + 本轮查询目的。',
    process: '网关校验读权限；检索 M01 养鱼背景、M04 鱼的近况，并保留原始来源与版本。',
    output: '仅相关上下文返回 Agent，再交给 AI 助理组织回应；新会话不加载整份旧聊天。',
    rule: '全局记忆 = 同一老人跨会话的个人记忆，不是所有用户或全家共享的档案。提醒另读专门账本。',
    edges: ['command', 'memoryIO', 'memoryResult', 'receipt', 'replyContext', 'voiceOut'],
    nodes: ['elder', 'assistant', 'agent', 'gateway', 'memory'],
    badges: { memory: 'M01 + M04 / 来源', gateway: '先检查读权限' }
  },
  {
    id: 'remember', title: '新增与修订，不是覆盖式摘要', label: '03 记忆新增', quoteId: 'B03',
    summary: '后台从最终原话提取记忆候选；保留设置、来源与版本检查通过后，才新增或修订个人记忆。',
    input: '鱼今天更活泼 → 新近况 M04；小颗粒改薄片 → M03 修订候选。',
    process: '来源绑定会话／轮次／转写修订；网关比较当前版本，提交 M03:v2，旧 v1 标记已替代。',
    output: '个人账本保存带来源的新版本，成功回执经过 Agent 和输出协调再告诉陈阿姨。',
    rule: '临时转写只能准备草稿；改口使旧候选失效。本人允许记住，不等于允许分享给小林。',
    edges: ['turnEvent', 'trigger', 'command', 'memoryIO', 'memoryResult', 'receipt', 'replyContext', 'voiceOut'],
    nodes: ['elder', 'assistant', 'events', 'agent', 'gateway', 'memory'],
    badges: { memory: 'M04 新增 / M03 v1 → v2', gateway: '来源 / 版本 / 保留设置' }
  },
  {
    id: 'remind', title: '确认安排，保存成功才生效', label: '04 个人提醒', quoteId: 'A07',
    summary: '“九点改十点，只这一次”先更新候选，再核对日期、时间与单次规则；本人确认之后才创建计划。',
    input: 'C-R1 九点草稿失效；C-R2 为周六 10:00，Asia/Shanghai，单次。',
    process: '确认凭据绑定 A09 与 C-R2:v2；网关检查版本、幂等并保存计划，未来由确定性调度程序触发。',
    output: '提交成功才说“提醒已保存”。到时结果／本人反馈仍沿网关 → Agent → AI 助理流转。',
    rule: '本人确认 ≠ 已保存 ≠ 通知送达 ≠ 客观完成；一次安排不自动写成永久习惯。',
    edges: ['voiceIn', 'turnEvent', 'trigger', 'command', 'reminderSave', 'reminderResult', 'receipt', 'replyContext', 'voiceOut'],
    nodes: ['elder', 'assistant', 'events', 'agent', 'gateway', 'reminder'],
    badges: { gateway: 'C-R2:v2 / 本人确认', reminder: '周六 10:00 / 仅一次' }
  },
  {
    id: 'consent', title: '只把愿意分享的内容投影出去', label: '05 授权分享', quoteId: 'A13',
    summary: '陈阿姨允许分享鱼的近况和看鱼的回忆，指定接收人小林。私人记忆不会因此整体复制给家属。',
    input: '允许的内容版本 + 接收人 family-lin + 本轮明确许可。',
    process: '网关校验授权，再从允许字段生成近况、原话片段和可聊话题；来源只暴露安全引用。',
    output: 'P01 授权投影；不附整段聊天、个人换水提醒，也不让家属侧模型先读取全部私人资料。',
    rule: '重要 ≠ 可以共享。生成输入、读详情和输出时都复核授权；新接收人和扩权需要另行确认。',
    edges: ['voiceIn', 'turnEvent', 'trigger', 'command', 'share'],
    nodes: ['elder', 'assistant', 'events', 'agent', 'gateway', 'projection'],
    badges: { projection: 'P01 / 仅小林', gateway: '对象 + 范围 + 内容版本' }
  },
  {
    id: 'request', title: '明确求助才进入待办', label: '06 家属待办', quoteId: 'A16',
    summary: '“请小林周日带一袋鱼粮”是具体求助。它与生活分享分开，有独立的对象、许可、版本和状态。',
    input: '行动：带鱼粮；对象：小林；时间：周日；规格：先核对，不凭空选择。',
    process: '澄清后本人确认；通过网关创建 Q01。薄片规格的后续变化，也要单独获准才更新共享请求。',
    output: 'Q01 等待回应，不是小林已经答应，更不是已经购买或带到。',
    rule: '近况与聊天线索不进入必须办结的工单。明确求助才有接手、协商与反馈。留言与请求是分立记录。',
    edges: ['voiceIn', 'turnEvent', 'trigger', 'command', 'collaboration', 'collaborationRead'],
    nodes: ['elder', 'assistant', 'events', 'agent', 'gateway', 'request', 'portal'],
    badges: { request: 'Q01 / 等待回应', portal: '需要你参与' }
  },
  {
    id: 'family', title: '家属先看见生活，再决定如何参与', label: '07 家属可见', quoteId: 'F01',
    summary: '小林通过家属入口读取授权近况与请求，不直接访问妈妈的个人记忆。没有待办时，交流线索仍有价值。',
    input: '小林的登录身份 + 当前有效授权；不是妈妈的全量聊天上下文。',
    process: '分别查询授权投影与收到的明确请求；不生成情绪诊断、孝心分数或必须完成的问候任务。',
    output: '最近的生活 / 下次聊什么 / 需要你参与。三种内容不能都叫“待办”。',
    rule: '图中没有家属 → 私人记忆的直连。原话片段也有授权和保留边界；没有音频时只展示文字。',
    edges: ['shareRead', 'familyView', 'familyAction', 'collaborationRead'],
    nodes: ['family', 'portal', 'projection', 'request'],
    badges: { family: '近况 / 话题 / 明确求助', portal: '仅授权内容' }
  },
  {
    id: 'respond', title: '关心来自小林本人，不由 AI 冒充', label: '08 双向参与', quoteId: 'F02',
    summary: '小林主动留言，也可以接手带鱼粮请求。客户端操作经业务网关入账，AI 不替她编造“已经看过／答应”。',
    input: '小林实际提交的文字留言、接手或完成反馈；本图全部使用剧本模拟。',
    process: '校验发送者、接收设置、授权与请求当前版本；分别记录留言与事项状态。',
    output: 'L01 小林留言；Q01 已接手。已接手仍然不是已完成，家属反馈也不等于客观核验。',
    rule: '不读取或假装知道外部微信和电话。小林未回应时保持等待，不自动扩大接收人或编造回复。',
    edges: ['familyAction', 'familySubmit', 'collaboration', 'collaborationRead'],
    nodes: ['family', 'portal', 'gateway', 'request'],
    badges: { family: '本人留言 / 主动接手', request: 'L01 留言 / Q01 已接手' }
  },
  {
    id: 'return', title: '带着明确来源，把反馈还给老人', label: '09 反馈闭环', quoteId: 'C03',
    summary: '网关返回带来源的业务结果，经 Agent 与 AI 助理统一转述。陈阿姨确认收到后，只关闭这一次鱼粮求助。',
    input: '小林反馈已带到鱼粮；之后陈阿姨确认收到。不能仅凭时间过去自动办结。',
    process: '家属反馈经网关 → Agent → 输出协调；播报“小林反馈说……”，丢弃迟到或旧版本回应。',
    output: '等待回应 → 已接手 → 家属反馈 → 老人确认；不把别人自报说成系统亲眼核验。',
    rule: '真实后台尚未接通。这是职责与信息路径的动态解释，不是实际消息送达、业务恢复或全双工证据。',
    edges: ['familyAction', 'familySubmit', 'receipt', 'replyContext', 'voiceOut', 'voiceIn', 'turnEvent', 'trigger', 'command', 'collaboration'],
    nodes: ['family', 'portal', 'gateway', 'agent', 'assistant', 'elder', 'events', 'request'],
    badges: { assistant: '“小林反馈说……”', request: '本人确认后 / 本次关闭' }
  },
  {
    id: 'deny', title: '拒绝分享，信息在私人侧停住', label: '边界：拒绝分享', quoteId: 'P01', quoteScenario: 'privacy',
    summary: '陈阿姨说“先别告诉小林”，则没有授权投影，也没有通知。个人记忆与已经确认的个人提醒不受影响。',
    input: '明确拒绝本次分享。', process: '共享候选失效；业务网关拒绝外发，不给家属留下旁路提示。',
    output: '家属只看到普通空态，不会知道“妈妈隐瞒了一条内容”。',
    rule: '红色边框表示本次出口关闭，不表示删除全部个人记忆；图中未点亮任何家庭内容出口。',
    edges: ['voiceIn', 'turnEvent', 'trigger', 'command', 'receipt', 'replyContext', 'voiceOut'],
    nodes: ['elder', 'assistant', 'events', 'agent', 'gateway', 'memory'], blocked: ['projection'],
    badges: { gateway: '本次拒绝 / 不外发', projection: '无新投影' }
  },
  {
    id: 'failure', title: '保存失败，不提前宣布成功', label: '边界：保存失败', quoteId: 'X01', quoteScenario: 'failure',
    summary: '本人已经确认，也可能保存失败。失败结果返回 AI 助理如实说明，计划尚未生效；恢复后沿同一幂等标识重试。',
    input: 'C-R2:v2 已确认，但注入模拟存储失败。',
    process: '没有成功事务回执，不创建有效提醒或发送任务；重试沿用 reminder:SA:A09:v2。',
    output: '“还没有保存成功，暂时没有生效”；恢复时最多创建一个 R01。',
    rule: '存储失败是系统必须处理的异常；手机后台、网络和设备能力限制是客观条件，不能混为一谈。',
    edges: ['command', 'receipt', 'replyContext', 'voiceOut'],
    nodes: ['gateway', 'agent', 'assistant', 'elder'], blocked: ['reminder'],
    badges: { gateway: '模拟失败 / 不能说已保存', reminder: '未生效 / 不调度' }
  }
];
const MAIN_COUNT = 9;
export { edgeContract, chapters, MAIN_COUNT };
