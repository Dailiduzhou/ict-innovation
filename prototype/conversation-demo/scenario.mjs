// Fictional fixtures and deterministic replay only. This is NOT a backend,
// authentication/consent service, ASR, LLM, notification system, or database.
const OWNER = 'elder-chen';
const FAMILY = 'family-lin';
const event = (tool, status, detail, data = {}) => ({ tool, status, detail, data });
const cue = (id, act, session, when, speaker, text, note, events = [], ops = [], focus = 'voice') =>
  ({ id, act, session, when, speaker, text, note, events, ops, focus });
const source = (session, turn, text) => ({ session, turn, revision: 1, final: true, text });
const seedSource = source('S-00', 'T-02', '我养了几条鱼，女儿小林小时候也爱看。现在用的是小颗粒鱼粮。');

function initialState() {
  return {
    owner: OWNER, session: null, context: [],
    memories: [
      { id: 'M01', kind: '生活背景', text: '陈阿姨在家养鱼，愿意聊鱼的近况。', version: 1, status: '已记录', source: seedSource, recordedAt: '2026-10-20', visibility: 'private' },
      { id: 'M02', kind: '关系上下文', text: '小林是女儿；小时候喜欢站在鱼缸旁看鱼。', version: 1, status: '已记录', source: seedSource, recordedAt: '2026-10-20', visibility: 'private' },
      { id: 'M03', kind: '进行中的事情', text: '当前使用小颗粒鱼粮。', version: 1, status: '已记录', source: seedSource, recordedAt: '2026-10-20', visibility: 'private' }
    ].map(m => ({ ...m, owner: OWNER })),
    memoryHistory: [], candidates: [], confirmations: [], grants: [],
    reminders: [], projections: [], requests: [], messages: [],
    dedupe: {}, receipts: []
  };
}

const main = [
  cue('A00', 0, 'S-A', '10月23日 周五 19:30', 'system', '先认识陈阿姨，再听她聊今天。',
    '虚构人物与数据。已选定陈阿姨的模拟账号；私有生活记忆保留设置已开启。小林是已关联家人，但没有读取私人记忆的权限。',
    [event('session.open', '模拟会话', '加载身份与使用目的，不加载整份历史。', { actor: OWNER, purpose: 'conversation', timezone: 'Asia/Shanghai', retention: '普通生活记忆允许保留；非永久', recipient: FAMILY })]),
  cue('A01', 0, 'S-A', '周五 19:30', 'elder', '小安，今天鱼又活泼起来了。前两天我还担心呢。',
    '先回应生活，而不是急着提取工单。当前最终转写作为后台整理输入。',
    [event('turn.final', '模拟转写', 'S-A / A01 / rev1；临时转写不能触发外发。', { revision: 1, final: true }),
     event('memory.search', '检索命中', '仅查陈阿姨、与养鱼相关的有效记录；不读取其他老人数据。', { owner: OWNER, query: '养鱼，鱼的近况', topK: 2, hits: ['M01:v1', 'M02:v1'] })], [], 'memory'),
  cue('A02', 0, 'S-A', '周五 19:30', 'agent', '听起来它们今天精神好多了。您上次说，小林小时候也爱站在鱼缸旁看，是吗？',
    '回复使用有来源的旧记忆；同时后台准备新近况，语音不必等待整理全部完成。并行关系是设计演示。',
    [event('memory.propose', '候选', '只记录“陈阿姨说鱼今天更活泼”，不推断鱼已康复或老人心理状态。', { id: 'C-M04', source: 'S-A/A01:rev1', visibility: 'private' })],
    [{ type: 'propose', id: 'C-M04', kind: 'memory', data: { recordId: 'M04', kind: '生活近况', text: '10月23日陈阿姨自述：鱼比前两天活泼。', sourceTurn: 'A01' } }], 'memory'),
  cue('A03', 0, 'S-A', '周五 19:31', 'elder', '是呀。她一看就是半天。这件小事你帮我记着，下次咱们接着聊。',
    '这是个人记忆，不是家庭共享授权。后台模拟提交成功后，才能更新“我记住的事”。',
    [event('memory.commit', '模拟成功', '来源与保留设置通过；新增 M04:v1。', { candidate: 'C-M04', owner: OWNER, key: 'mem:SA:A01:r1', result: 'M04:v1', share: false })],
    [{ type: 'commit', id: 'C-M04', key: 'mem:SA:A01:r1' }], 'memory'),
  cue('A04', 0, 'S-A', '周五 19:31', 'agent', '这次鱼的近况已经记下了。以后聊起鱼缸，我能接着这件事聊。',
    '仅在模拟账本返回成功后说“记下了”。页面重载会恢复剧本，不证明真实数据库持久化。',
    [event('output.coordinate', '模拟回执', '将 M04:v1 的提交结果交给当前轮次播报；不播报过期结果。', { committed: 'M04:v1' })]),
  cue('A05', 0, 'S-A', '周五 19:32', 'elder', '明天九点提醒我给鱼缸换水。',
    '先提取草稿；不能因为识别到时间就直接创建提醒。',
    [event('reminder.propose', '待确认', '由本地故事日期解析“明天”：10月24日。', { candidate: 'C-R1', due: '2026-10-24T09:00:00+08:00', recurrence: 'once', enabled: false })],
    [{ type: 'propose', id: 'C-R1', kind: 'reminder', data: { recordId: 'R01', title: '按自己的原有安排给鱼缸换水', due: '2026-10-24T09:00:00+08:00', recurrence: 'once' } }], 'candidate'),
  cue('A06', 0, 'S-A', '周五 19:32', 'agent', '我先和您核对一下，明天……',
    '下一句是脚本中的插话。字幕与系统朗读不能证明全双工或真实 VAD 打断。',
    [event('voice.output', '脚本播报', '输出协调预留打断与取消；本页按预设顺序演出。')]),
  cue('A07', 0, 'S-A', '周五 19:32', 'elder', '等等，不是九点，是十点。只提醒这一次。',
    '“等等”取消旧回应；改口使九点候选失效，但不是取消所有提醒。',
    [event('turn.corrected', '旧候选失效', 'C-R1 不再可提交。建立十点候选 C-R2，仍未启用。', { supersedes: 'C-R1', candidate: 'C-R2', sourceTurn: 'A07', candidateVersion: 2 })],
    [{ type: 'invalidate', id: 'C-R1' }, { type: 'propose', id: 'C-R2', kind: 'reminder', version: 2, data: { recordId: 'R01', title: '按自己的原有安排给鱼缸换水', due: '2026-10-24T10:00:00+08:00', recurrence: 'once' } }], 'candidate'),
  cue('A08', 0, 'S-A', '周五 19:32', 'agent', '好的，是明天，也就是十月二十四日周六上午十点，只提醒一次。按这个时间设，可以吗？',
    '将绝对日期、时区内时间和单次规则说清楚。一次安排不写成长期习惯。',
    [event('confirmation.prepare', '等待本人', '确认必须绑定当前候选版本，不能接受模型自行填 confirmed=true。', { candidate: 'C-R2', version: 2, action: 'create-reminder' })], [], 'gateway'),
  cue('A09', 0, 'S-A', '周五 19:32', 'elder', '对，就按这个时间设。',
    '从模拟认证会话中的明确应答形成确认凭据，此时尚未保存提醒。',
    [event('confirmation.record', '已确认未保存', '绑定 C-R2:v2 和这一次应答。', { evidence: 'S-A/A09:rev1', candidate: 'C-R2', version: 2 })],
    [{ type: 'confirm', id: 'C-R2' }], 'gateway'),
  cue('A10', 0, 'S-A', '周五 19:32', 'system', '后台把已确认的安排交给业务网关。',
    '网关负责身份、确认、版本、幂等和写入。这里的校验与提交都是本地剧本回放。',
    [event('reminder.commit', '模拟成功', '一次性计划与发送任务的事务关系为设计契约；本页没有实际调度器。', { candidate: 'C-R2', expectedVersion: 2, key: 'reminder:SA:A09:v2', result: 'R01:scheduled', outbox: 'simulated' })],
    [{ type: 'commit', id: 'C-R2', key: 'reminder:SA:A09:v2' }], 'gateway'),
  cue('A11', 0, 'S-A', '周五 19:32', 'agent', '提醒已保存：明天上午十点，只提醒这一次。您也可以随时问我或取消。',
    '“已保存”不等于将来必达。普通手机后台、系统权限和网络是客观条件，真实调度尚未实现是另一件事。',
    [event('output.coordinate', '模拟成功反馈', '只播报已提交的 R01，不播报失效的九点草稿。', { reminder: 'R01', due: '2026-10-24T10:00:00+08:00' })], [], 'reminder'),
  cue('A12', 0, 'S-A', '周五 19:33', 'agent', '鱼活泼起来这件事，还有小林小时候看鱼的回忆，您愿意让我只分享给小林吗？换水提醒不一起发。',
    '从明确选定的字段形成共享候选，不把私人记忆全文交给家属侧模型。',
    [event('share.propose', '尚未共享', '限定接收人、内容、原话片段与用途；生成候选不等于授权。', { candidate: 'C-S1', recipient: FAMILY, source: ['M02:v1', 'M04:v1'] })],
    [{ type: 'propose', id: 'C-S1', kind: 'share', data: { recordId: 'P01', recipient: FAMILY, summary: '妈妈说今天鱼比前两天活泼，也聊起你小时候在鱼缸旁看鱼。', quote: '她一看就是半天。', quoteSource: 'S-A/A03:rev1', topic: '下次联系时，可以问问那几条鱼后来怎么样了。', sources: ['M02:v1', 'M04:v1', 'S-A/A03:rev1'] } }], 'share'),
  cue('A13', 0, 'S-A', '周五 19:33', 'elder', '可以，就把鱼的近况和这段回忆给小林看。别把我们整段聊天都发过去。',
    '逐条授权只覆盖刚刚核对的近况与回忆，不允许所有亲属访问私人记忆。',
    [event('consent.grant', '模拟授权', '授权内容版本与接收人绑定；输入和输出均需复核。', { candidate: 'C-S1', recipient: FAMILY, scope: 'share', evidence: 'S-A/A13:rev1' })],
    [{ type: 'confirm', id: 'C-S1' }, { type: 'grant', id: 'C-S1', scope: 'share' }], 'share'),
  cue('A14', 0, 'S-A', '周五 19:33', 'system', '生成小林可见的授权投影。',
    '家属侧仅得到授权摘要、来源和话题。原话在此只以文字呈现，没有真实录音，也不合成妈妈的原声。',
    [event('projection.commit', '模拟成功', '先检查授权再生成家属可见内容；不是拿到全量隐私后再过滤。', { projection: 'P01', key: 'share:SA:A13:v1', recipient: FAMILY, includesPrivateReminder: false })],
    [{ type: 'commit', id: 'C-S1', key: 'share:SA:A13:v1' }], 'share'),
  cue('A15', 0, 'S-A', '周五 19:33', 'agent', '只把这两件事整理给小林，没有附上整段聊天。',
    '本页“整理给”指生成模拟可见内容，不表示真实消息已送达、已读或发生了外部通话。',
    [event('projection.read', '权限限定', '当前 P01 只对 family-lin 可见。', { recipient: FAMILY, projection: 'P01' })]),
  cue('A16', 0, 'S-A', '周五 19:34', 'elder', '对了，鱼粮也快没了，想请小林周日回来时带一袋。',
    '明确求助才进入事项跟进；品牌与规格未知，不能凭空选定。',
    [event('request.propose', '待澄清', '与分享独立建模；小林还没有接手。', { candidate: 'C-Q1', recipient: FAMILY, requestedFor: '2026-10-25', specification: '待核对' })],
    [{ type: 'propose', id: 'C-Q1', kind: 'request', data: { recordId: 'Q01', recipient: FAMILY, title: '周日回来时帮妈妈带一袋鱼粮', requestedFor: '2026-10-25', specification: '规格待核对' } }], 'request'),
  cue('A17', 0, 'S-A', '周五 19:34', 'agent', '我向小林转达：周日回来时帮您带一袋鱼粮，规格先和您核对。就发给她一个人，可以吗？',
    '确认对象、行动、时间和分享许可，不把“想请”当成家属已经答应。',
    [event('confirmation.prepare', '等待本人', '请求与生活分享有不同的许可范围。', { candidate: 'C-Q1', recipient: FAMILY, action: 'create-request' })], [], 'gateway'),
  cue('A18', 0, 'S-A', '周五 19:34', 'elder', '可以，只发给小林。规格让她先问我。',
    '请求获得逐次确认与窄范围许可，再提交模拟请求。',
    [event('request.commit', '模拟成功', 'Q01 进入等待回应；没有推定接手，也没有自动买东西。', { key: 'request:SA:A18:v1', result: 'Q01:requested' })],
    [{ type: 'confirm', id: 'C-Q1' }, { type: 'grant', id: 'C-Q1', scope: 'request' }, { type: 'commit', id: 'C-Q1', key: 'request:SA:A18:v1' }], 'request'),
  cue('A19', 0, 'S-A', '周五 19:34', 'agent', '已经整理好这条请求，等小林回应。她还没有答应，我不会替她说答应了。',
    '近况是一条，求助是另一条；对方暂不回应不会触发催促、扩大发送或自动办结。',
    [event('request.status', '等待回应', '系统内状态不等于家属现实行为。', { request: 'Q01', status: 'requested' })], [], 'request'),

  cue('B00', 1, 'S-B', '10月24日 周六 09:00 · 时间跳转', 'system', '新的会话开始。上一轮工作上下文已清空。',
    '个人账本按脚本重建保留，不把上一轮消息直接塞进新会话。此处不证明真实进程重启或存储恢复。',
    [event('session.open', '模拟新会话', 'S-B 的 context 从空开始；按需检索长期记录。', { session: 'S-B', previousContextLoaded: false })], [], 'memory'),
  cue('B01', 1, 'S-B', '周六 09:00', 'elder', '上回鱼缸的事你还记得吗？今天几点提醒我？',
    '先确认检索范围，再分别读取个人记忆与提醒专门对象；摘要不充当提醒账本。',
    [event('memory.search', '按需召回', '生活背景与近况：M01、M04；本人的提醒：R01。', { owner: OWNER, query: '鱼缸，上回近况，今天提醒', hits: ['M01:v1', 'M04:v1'], reminderIds: ['R01'] })], [], 'memory'),
  cue('B02', 1, 'S-B', '周六 09:00', 'agent', '记得。您昨天说鱼又活泼起来了；还有今天上午十点的一次换水提醒。',
    '每个说法都有脚本来源；检索失败时应承认暂时查不到，不编造记得。',
    [event('context.attach', '来源可追溯', '将最小相关记录附到这轮回复，不附上整份历史。', { sources: ['S-A/A01:rev1', 'R01'], privateScope: OWNER })]),
  cue('B03', 1, 'S-B', '周六 09:01', 'elder', '鱼粮现在换成薄片的了，不是原来的小颗粒。帮我把这个记清楚。',
    '对旧记忆作显式修订，不把新旧说法合成一个矛盾摘要。',
    [event('memory.revise', '修订候选', '检索到 M03:v1；准备 v2，来源是本轮明确纠正。', { candidate: 'C-M03v2', record: 'M03', expectedVersion: 1, proposedVersion: 2 })],
    [{ type: 'propose', id: 'C-M03v2', kind: 'memory', version: 2, data: { recordId: 'M03', kind: '进行中的事情', text: '当前使用薄片鱼粮；已替代原来的小颗粒。', expectedVersion: 1 } }], 'memory'),
  cue('B04', 1, 'S-B', '周六 09:01', 'system', '修订记忆 M03，并保留来源与替代关系。',
    '旧版保留为最小化修订证据，不再参与当前事实召回；原始音频并非永久保存。',
    [event('memory.commit', '模拟成功', '比较版本后提交 v2；迟到 v1 结果不能覆盖新意愿。', { record: 'M03', expectedVersion: 1, resultVersion: 2, key: 'mem:SB:B03:v2' })],
    [{ type: 'commit', id: 'C-M03v2', key: 'mem:SB:B03:v2' }], 'memory'),
  cue('B05', 1, 'S-B', '周六 09:01', 'agent', '已经改成薄片鱼粮。要把小林那条请求的规格也更新为薄片吗？这需要您另外同意。',
    '私人记忆变更不自动扩展已共享请求；新的规格先成为请求变更候选。',
    [event('request.revise', '等待新确认', 'Q01:v1 不直接被私人记忆覆盖。', { candidate: 'C-Q2', record: 'Q01', expectedVersion: 1, specification: '薄片鱼粮；品牌和包装由小林再核对' })],
    [{ type: 'propose', id: 'C-Q2', kind: 'request', version: 2, data: { recordId: 'Q01', recipient: FAMILY, title: '周日回来时帮妈妈带一袋鱼粮', requestedFor: '2026-10-25', specification: '薄片鱼粮；品牌和包装需再核对', expectedVersion: 1 } }], 'request'),
  cue('B06', 1, 'S-B', '周六 09:01', 'elder', '好，告诉小林是薄片的，品牌和袋子大小再让她问我。',
    '新的共享范围绑定 Q01:v2，再次校验接收人和记录版本。',
    [event('request.commit', '模拟更新', '只更新已确认的规格，不新增第二条求助。', { record: 'Q01', resultVersion: 2, key: 'request:SB:B06:v2', recipient: FAMILY })],
    [{ type: 'confirm', id: 'C-Q2' }, { type: 'grant', id: 'C-Q2', scope: 'request' }, { type: 'commit', id: 'C-Q2', key: 'request:SB:B06:v2' }], 'request'),
  cue('B07', 1, 'S-B', '周六 09:01', 'agent', '请求里的规格也更新了，仍然只有这一条，等小林回应。',
    '同一请求版本升级；来源、授权与状态仍分开。',
    [event('request.status', '等待回应', 'Q01:v2；小林尚未操作。', { request: 'Q01', version: 2, status: 'requested' })], [], 'request'),
  cue('B08', 1, 'S-B', '周六 10:00 · 模拟时钟', 'agent', '陈阿姨，现在上午十点了。您安排的那次鱼缸换水提醒到了。',
    '模拟展示：调度到时、终端展示与本人反馈是三个状态。本页没有系统通知或真实调度。',
    [event('reminder.display', '模拟终端展示', '只触发 R01 的单次实例；不代表手机后台必达。', { reminder: 'R01', clock: 'fixture', instance: 'R01/2026-10-24T10:00+08:00' })],
    [{ type: 'reminder.display', id: 'R01' }], 'reminder'),
  cue('B09', 1, 'S-B', '周六 10:00', 'elder', '我刚才已经弄好了，这次不用再提醒。',
    '记录为“本人自报完成”，不是传感器证明；不取消任何其他未来计划。',
    [event('reminder.feedback', '本人自报', '只关闭这一次提醒实例。', { reminder: 'R01', result: 'reported_done', evidence: 'S-B/B09:rev1' })],
    [{ type: 'reminder.feedback', id: 'R01' }], 'reminder'),
  cue('B10', 1, 'S-B', '周六 10:00', 'agent', '好，这一次记为您说已经完成，不再重复提醒。',
    '没有从一次完成推断换水频率，也不向小林公开个人提醒。',
    [event('reminder.status', '单次结束', '提醒实例闭环与家属求助闭环彼此独立。', { reminder: 'R01', status: 'reported_done', shared: false })], [], 'reminder'),

  cue('F00', 2, 'S-F', '10月24日 周六 12:00 · 家属视角', 'system', '小林打开“最近的生活”。',
    '切换为小林的模拟身份。查询入口只允许家属授权投影和她收到的请求，不提供妈妈的私人记忆。',
    [event('family.query', '最小授权输入', '不检索 M01～M04，也不读取换水提醒。', { actor: FAMILY, projectionIds: ['P01'], requestIds: ['Q01:v2'], privateMemoryRead: false })], [], 'share'),
  cue('F01', 2, 'S-F', '周六 12:00', 'family', '原来鱼好多了。下次和妈妈聊，我就问问那几条鱼。',
    '这是脚本里的家属反应，不是 Agent 代发的关心，也不产生必须完成的问候工单。',
    [event('topic.review', '可选话题', '近况和话题没有“接手／完成”状态；系统不知道她是否打了外部电话。', { projection: 'P01', taskCreated: false })], [], 'share'),
  cue('F02', 2, 'S-F', '周六 12:01', 'family', '我还记得小时候看鱼，周日回来一起看看。',
    '脚本中由小林主动提交的留言；不是 AI 冒充女儿生成或自动发送。妈妈的设置允许接收小林的文字留言。',
    [event('message.submit', '模拟提交', '发送者、正文版本、接收设置通过；目前只记录提交，未声称老人听到。', { sender: FAMILY, recipient: OWNER, message: 'L01', version: 1 })],
    [{ type: 'message.submit', id: 'L01', text: '我还记得小时候看鱼，周日回来一起看看。' }], 'message'),
  cue('F03', 2, 'S-F', '周六 12:01', 'family', '鱼粮这件事我接下了，品牌和包装我先找妈妈核对。',
    '脚本中的接手操作；状态从等待回应到已接手，尚未办结。具体规格核对发生在故事时间跳转中，不冒充系统读取微信。',
    [event('request.accept', '模拟接手', '校验小林是指定接收人且 Q01:v2 仍有效。', { actor: FAMILY, request: 'Q01', expectedVersion: 2, result: 'accepted' })],
    [{ type: 'request.accept', id: 'Q01', expectedVersion: 2 }], 'request'),
  cue('C00', 2, 'S-C', '10月25日 周日 16:00 · 时间跳转', 'system', '陈阿姨再次打开助理；小林的留言此时才被转达。',
    '故事时间跳转不等于真实送达或外部通话。下面只演示系统内留言与明确反馈。',
    [event('message.read', '模拟转达准备', '按本人接收设置取 L01，保留真实发送者字段。', { recipient: OWNER, message: 'L01', sender: FAMILY })], [], 'message'),
  cue('C01', 2, 'S-C', '周日 16:00', 'agent', '小林留了一句话：“我还记得小时候看鱼，周日回来一起看看。”鱼粮请求她也接下了，还没有提交完成反馈。',
    '系统朗读是助理转述，不模拟小林本人声音；接手不等于完成。',
    [event('message.relay', '模拟已转达', '明确说“小林留言”；没有新增虚构的女儿回复。', { message: 'L01', sender: FAMILY, requestStatus: 'accepted' })],
    [{ type: 'message.relay', id: 'L01' }], 'message'),
  cue('C02', 2, 'S-C', '周日 16:00', 'elder', '她还记得呀。等她回来，我再给她看看。',
    '不把一句开心回应推断成情绪评分；没有新待办也值得继续聊天。',
    [event('turn.final', '普通闲聊', '本轮不强行生成记忆或任务。', { taskCreated: false, diagnosis: false })]),
  cue('F04', 2, 'S-F2', '周日 17:00 · 家属操作', 'family', '我和妈妈核对好规格，鱼粮已经带到了。',
    '小林主动提交完成反馈，是她的自报；系统不声称用传感器或外部聊天核实。',
    [event('request.feedback', '模拟家属反馈', '接手后才允许提交反馈，形成最小来源记录。', { actor: FAMILY, request: 'Q01', expectedVersion: 2, result: 'reported_done' })],
    [{ type: 'request.finish', id: 'Q01', expectedVersion: 2 }], 'request'),
  cue('C03', 2, 'S-C2', '周日 17:01 · 老人端', 'agent', '小林反馈说，核对好规格的鱼粮已经带到了。',
    '准确归因于小林，不把第三方自报说成系统亲眼确认。',
    [event('request.relay', '模拟转达', '向请求发起人反馈，不广播给其他家人。', { request: 'Q01', origin: 'S-F2/F04:rev1', recipient: OWNER })], [], 'request'),
  cue('C04', 2, 'S-C2', '周日 17:01', 'elder', '嗯，拿到了。你帮我把这件事收起来吧。',
    '老人确认收到后，关闭这次求助。不是“孝心分数”，也不要求对生活分享逐条打卡。',
    [event('request.close', '模拟闭环', '等待回应 → 已接手 → 家属反馈 → 本人确认收到。', { request: 'Q01', result: 'closed', evidence: 'S-C2/C04:rev1' })],
    [{ type: 'request.close', id: 'Q01' }], 'request'),
  cue('END', 2, 'S-C2', '演示结束', 'system', '记住生活，延续交流，需要时才办事。',
    '全部为预设数据与本地回放。已展示：私有记忆新增／跨会话召回／修订、受控提醒、授权近况与话题、家属留言、明确求助闭环。可切换拒绝分享和保存失败分支。',
    [event('demo.boundary', '证据边界', '没有 ASR、线上模型、真实数据库、通知发送或全双工测试。', { execution: 'deterministic local replay', realUserData: false, persistedBusinessData: false })], [], 'summary')
];

const consentIndex = main.findIndex(c => c.id === 'A13');
const commitIndex = main.findIndex(c => c.id === 'A10');
const privacy = [
  ...main.slice(0, consentIndex),
  cue('P01', 0, 'S-A', '周五 19:33 · 拒绝分支', 'elder', '这次先别告诉小林，留着咱们下次聊就好。',
    '拒绝只影响共享，不自动删除本人已经允许保留的私有记忆。',
    [event('consent.deny', '不外发', '不创建授权投影或通知，不发送“妈妈有一条不愿分享的内容”。', { candidate: 'C-S1', result: 'denied', notification: false })],
    [{ type: 'deny', id: 'C-S1' }], 'share'),
  cue('P02', 0, 'S-A', '周五 19:33', 'agent', '好的，这次不分享。这些近况留在您自己的记忆里，换水提醒仍然是您的个人安排。',
    '尊重不分享，不向家属留下旁路提示。',
    [event('projection.guard', '无投影', '分享候选已拒绝；本分支没有共享许可。', { projectionCount: 0, requestCount: 0 })], [], 'share'),
  cue('P03', 2, 'S-F', '随后 · 小林打开页面（模拟）', 'system', '家属端没有新的共享内容。',
    '家属端只显示普通空态，不显示拒绝原因、私人原话或隐私内容的存在提示。',
    [event('family.query', '普通空态', '小林没有私人记忆权限。管理员演示侧可见边界事件，不代表家属侧可见。', { actor: FAMILY, projections: [], requests: [], privateMemoryRead: false })], [], 'share')
];
const failure = [
  ...main.slice(0, commitIndex),
  cue('X01', 0, 'S-A', '周五 19:32 · 保存失败分支', 'agent', '这个提醒还没有保存成功，暂时没有生效。我会用同一个操作标识重试，不重复创建。',
    '确认意愿与保存结果是两件事。失败回执出现前不能提前说“已保存”。',
    [event('reminder.commit', '模拟失败', '注入存储失败；R01 不存在，发送任务也未创建。', { key: 'reminder:SA:A09:v2', result: 'storage_unavailable', enabled: false })],
    [{ type: 'commit', id: 'C-R2', key: 'reminder:SA:A09:v2', fail: true }], 'gateway'),
  cue('X02', 0, 'S-A', '周五 19:32 · 模拟恢复', 'system', '有界重试成功，沿用同一个幂等标识。',
    '本页按钮和时间轴只回放重试结果，不是在真实存储系统中恢复。',
    [event('reminder.retry', '模拟成功', '同一命令创建唯一的 R01；确认仍绑定 C-R2:v2。', { key: 'reminder:SA:A09:v2', result: 'R01:scheduled' })],
    [{ type: 'commit', id: 'C-R2', key: 'reminder:SA:A09:v2' }], 'gateway'),
  cue('X03', 0, 'S-A', '周五 19:32 · 重复回执', 'system', '同一提交再次到达，不再新增第二条提醒。',
    '幂等检查在本地回放器中可测试；它不是生产数据库的唯一约束或崩溃恢复证明。',
    [event('gateway.dedupe', '复用已有结果', '重复提交返回原 R01。', { key: 'reminder:SA:A09:v2', result: 'already_applied', count: 1 })],
    [{ type: 'commit', id: 'C-R2', key: 'reminder:SA:A09:v2' }], 'gateway'),
  ...main.slice(commitIndex + 1)
];

const scenarios = {
  main: { title: '完整故事', description: '生活 → 记忆 → 授权 → 家人回应', steps: main, entry: 0, seconds: 300 },
  privacy: { title: '拒绝分享', description: '从分享确认点分叉；私人记忆不变成家属内容', steps: privacy, entry: consentIndex, seconds: 125 },
  failure: { title: '保存失败', description: '从提交点分叉；失败不生效，恢复不重复', steps: failure, entry: commitIndex, seconds: 320 }
};

// Explicit, bounded local state transitions make snapshots and branch replay
// reproducible. They illustrate contracts; they do NOT enforce real security.
function applyOp(state, op, step, src) {
  const candidate = state.candidates.find(c => c.id === op.id);
  const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
  if (op.type === 'propose') {
    requireValue(!candidate, `duplicate candidate ${op.id}`);
    let candidateSource = src;
    if (op.data.sourceTurn) {
      candidateSource = state.context.find(s => s.turn === op.data.sourceTurn);
      requireValue(candidateSource, 'missing original source');
    }
    state.candidates.push({ id: op.id, kind: op.kind, version: op.version || 1, owner: state.owner,
      status: 'candidate', data: structuredClone(op.data), source: structuredClone(candidateSource) });
  } else if (op.type === 'invalidate' || op.type === 'deny') {
    requireValue(candidate, 'missing candidate');
    candidate.status = op.type === 'deny' ? 'denied' : 'superseded';
  } else if (op.type === 'confirm' || op.type === 'grant') {
    requireValue(candidate && candidate.status === 'candidate', 'candidate is not current');
    requireValue(step.speaker === 'elder', 'only authenticated elder evidence can confirm');
    if (op.type === 'confirm') state.confirmations.push({ candidate: op.id, version: candidate.version, actor: OWNER, source: src });
    else {
      requireValue(candidate.data.recipient === FAMILY, 'unknown recipient');
      requireValue(op.scope === candidate.kind, 'scope mismatch');
      state.grants.push({ candidate: op.id, version: candidate.version, recipient: FAMILY, scope: op.scope, source: src, active: true });
    }
  } else if (op.type === 'commit') {
    requireValue(candidate && ['candidate', 'committed'].includes(candidate.status), 'candidate is stale or denied');
    requireValue(candidate.owner === state.owner, 'owner mismatch');
    requireValue(candidate.source.final, 'partial transcript cannot commit');
    if (state.dedupe[op.key]) {
      requireValue(state.dedupe[op.key] === candidate.id, 'idempotency key reused for another command');
      state.receipts.push({ step: step.id, result: 'already_applied', key: op.key });
      return;
    }
    if (candidate.kind !== 'memory') {
      requireValue(state.confirmations.some(c => c.candidate === candidate.id && c.version === candidate.version && c.actor === OWNER), 'missing version-bound confirmation');
    }
    if (['share', 'request'].includes(candidate.kind)) {
      requireValue(state.grants.some(g => g.active && g.candidate === candidate.id && g.version === candidate.version && g.recipient === candidate.data.recipient && g.scope === candidate.kind), 'missing scoped permission');
    }
    if (op.fail) {
      state.receipts.push({ step: step.id, result: 'storage_unavailable', key: op.key });
      return;
    }
    const data = structuredClone(candidate.data);
    const common = { ...data, id: data.recordId, version: candidate.version, source: candidate.source };
    if (candidate.kind === 'memory') {
      const old = state.memories.find(m => m.id === data.recordId);
      requireValue((old?.version || 0) === (data.expectedVersion || 0), 'memory version conflict');
      if (old) {
        state.memoryHistory.push({ ...structuredClone(old), status: 'superseded', replacedBy: candidate.version });
        state.memories = state.memories.filter(m => m.id !== old.id);
      }
      state.memories.push({ ...common, owner: state.owner, visibility: 'private', status: '已记录', recordedAt: step.when });
    } else if (candidate.kind === 'reminder') {
      requireValue(!state.reminders.some(r => r.id === data.recordId), 'reminder already exists');
      state.reminders.push({ ...common, owner: state.owner, status: 'scheduled', confirmation: state.confirmations.find(c => c.candidate === candidate.id) });
    } else if (candidate.kind === 'share') {
      state.projections.push({ ...common, status: 'available', grant: candidate.id });
    } else if (candidate.kind === 'request') {
      const old = state.requests.find(r => r.id === data.recordId);
      requireValue((old?.version || 0) === (data.expectedVersion || 0), 'request version conflict');
      requireValue(!old || old.status === 'requested', 'cannot silently overwrite accepted request');
      state.requests = state.requests.filter(r => r.id !== data.recordId);
      state.requests.push({ ...common, status: 'requested', grant: candidate.id });
    }
    candidate.status = 'committed';
    state.dedupe[op.key] = candidate.id;
    state.receipts.push({ step: step.id, result: 'committed', key: op.key });
  } else if (op.type.startsWith('reminder.')) {
    const reminder = state.reminders.find(r => r.id === op.id);
    requireValue(reminder, 'missing reminder');
    if (op.type === 'reminder.display') {
      requireValue(reminder.status === 'scheduled', 'invalid reminder display');
      reminder.status = 'displayed';
    } else {
      requireValue(step.speaker === 'elder' && reminder.status === 'displayed', 'invalid completion evidence');
      reminder.status = 'reported_done'; reminder.feedbackSource = src;
    }
  } else if (op.type.startsWith('message.')) {
    if (op.type === 'message.submit') {
      requireValue(step.speaker === 'family', 'message must have real sender evidence in script');
      requireValue(!state.messages.some(m => m.id === op.id), 'duplicate message');
      state.messages.push({ id: op.id, sender: FAMILY, recipient: OWNER, text: op.text, status: 'submitted', source: src });
    } else {
      const message = state.messages.find(m => m.id === op.id);
      requireValue(message && message.status === 'submitted', 'missing submitted message');
      message.status = 'relayed';
    }
  } else if (op.type.startsWith('request.')) {
    const request = state.requests.find(r => r.id === op.id);
    requireValue(request, 'missing request');
    if (op.expectedVersion) requireValue(request.version === op.expectedVersion, 'request version conflict');
    if (op.type === 'request.accept') {
      requireValue(step.speaker === 'family' && request.recipient === FAMILY && request.status === 'requested', 'invalid acceptance');
      request.status = 'accepted'; request.acceptedSource = src;
    } else if (op.type === 'request.finish') {
      requireValue(step.speaker === 'family' && request.status === 'accepted', 'finish requires recipient acceptance');
      request.status = 'reported_done'; request.feedbackSource = src;
    } else if (op.type === 'request.close') {
      requireValue(step.speaker === 'elder' && request.status === 'reported_done', 'close requires elder receipt');
      request.status = 'closed'; request.closedSource = src;
    } else throw new Error(`unknown transition ${op.type}`);
  } else throw new Error(`unknown operation ${op.type}`);
}

function stateAt(scenarioId, index) {
  const scenario = scenarios[scenarioId];
  if (!scenario) throw new Error('unknown scenario');
  const state = initialState();
  for (const step of scenario.steps.slice(0, index + 1)) {
    if (step.session !== state.session) { state.context = []; state.session = step.session; }
    const src = source(step.session, step.id, step.text);
    if (step.speaker !== 'system') state.context.push(src);
    for (const op of step.ops) applyOp(state, op, step, src);
  }
  return state;
}

function familyView(state, actor = FAMILY) {
  const allowed = (record, scope) => record.recipient === actor && state.grants.some(g =>
    g.active && g.candidate === record.grant && g.recipient === actor && g.scope === scope && g.version === record.version);
  // References are safe provenance; raw candidate/source text can contain
  // unshared clauses. Never forward the internal object wholesale.
  const reference = src => ({ session: src.session, turn: src.turn, revision: src.revision });
  const authorizationSource = record => reference(state.grants.find(g =>
    g.active && g.candidate === record.grant && g.version === record.version && g.recipient === actor).source);
  return structuredClone({
    projections: state.projections.filter(p => allowed(p, 'share')).map(p => ({
      id: p.id, version: p.version, recipient: p.recipient, summary: p.summary,
      quote: p.quote, quoteSource: p.quoteSource, topic: p.topic, sources: p.sources,
      source: reference(p.source), authorizationSource: authorizationSource(p)
    })),
    requests: state.requests.filter(r => allowed(r, 'request')).map(r => ({
      id: r.id, version: r.version, recipient: r.recipient, title: r.title,
      requestedFor: r.requestedFor, specification: r.specification, status: r.status,
      source: reference(r.source), authorizationSource: authorizationSource(r)
    })),
    messages: state.messages.filter(m => m.sender === actor).map(m => ({
      id: m.id, sender: m.sender, recipient: m.recipient, text: m.text,
      status: m.status, source: reference(m.source)
    }))
  });
}

function schedule(scenarioId) {
  const scenario = scenarios[scenarioId];
  const weights = scenario.steps.map(s => Math.max(3, s.speaker === 'system' ? 4 : Array.from(s.text).length / 4.2 + 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  let at = 0;
  return weights.map((weight, index) => {
    const duration = weight / sum * scenario.seconds;
    const item = { index, start: at, end: at + duration, duration };
    at += duration;
    return item;
  });
}

const DEMO = {
  title: '把生活接着聊', owner: OWNER, family: FAMILY,
  acts: ['01 / 先听见生活', '02 / 下次仍记得', '03 / 让家人接住'],
  speakers: { elder: '陈阿姨', agent: '小安 · Agent', family: '小林 · 女儿', system: '演示说明' },
  scenarios
};
export { DEMO, initialState, stateAt, schedule, applyOp, familyView };
