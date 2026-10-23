// Runs after the embedded scenario module, inside the build's single IIFE.
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const json = value => escapeHtml(JSON.stringify(value, null, 2));
const clock = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
let scenarioId = 'main';
let timeline = schedule(scenarioId);
let index = 0;
let elapsed = 0;
let playing = false;
let speed = 1;
let lastFrame = 0;
let snapshot = stateAt(scenarioId, index);
let speechGeneration = 0;
let audioPending = false;
let audioDeadline = 0;
let speechWatchdog = null;
let audioAvailable = typeof window.speechSynthesis?.speak === 'function' && typeof window.SpeechSynthesisUtterance === 'function';
const synthesis = audioAvailable ? window.speechSynthesis : null;
const reminderLabels = { scheduled: '已保存 · 未到时间', displayed: '模拟到时展示 · 待本人反馈', reported_done: '本人自报完成 · 本次结束' };
const requestLabels = { requested: '等待小林回应', accepted: '小林已接手 · 尚未办结', reported_done: '小林反馈已带到 · 待妈妈确认', closed: '妈妈确认收到 · 本次已收起' };
const chapterAnchors = [ ['A00', '01 生活与记忆'], ['A05', '02 改口与提醒'], ['A12', '03 授权与求助'], ['B00', '04 新会话与纠错'], ['B08', '05 模拟到时'], ['F00', '06 家人接住'], ['F04', '07 反馈闭环'] ];

function announce(text) { $('demo-announcement').textContent = text; }
function audioStatus(text) { $('demo-audio-status').textContent = text; }
function cancelSpeech() {
  speechGeneration++;
  audioPending = false;
  clearTimeout(speechWatchdog);
  speechWatchdog = null;
  if (synthesis) { try { synthesis.cancel(); } catch (_) {} }
}
function speakCurrent() {
  cancelSpeech();
  if (!playing || !$('demo-voice').checked || !audioAvailable) return;
  const step = DEMO.scenarios[scenarioId].steps[index];
  if (step.speaker === 'system') return;
  try {
    const voices = synthesis.getVoices().filter(v => /^zh(?:-|_|$)/i.test(v.lang));
    if (!voices.length) {
      $('demo-voice').checked = false;
      audioStatus('当前未找到可用中文系统语音，已继续静音字幕。可安装中文语音后重新勾选；演示不会等待或卡住。');
      return;
    }
    voices.sort((a, b) => Number(b.localService) - Number(a.localService));
    const utterance = new SpeechSynthesisUtterance(step.text);
    utterance.lang = 'zh-CN';
    utterance.voice = voices[(step.speaker === 'agent' ? 1 : 0) % voices.length];
    utterance.rate = Math.min(2, speed * .98);
    utterance.pitch = step.speaker === 'agent' ? .95 : 1.05;
    const generation = speechGeneration;
    audioPending = true;
    const limit = Math.min(30000, Math.max(8000, Array.from(step.text).length / 2 * 1000 + 5000));
    audioDeadline = performance.now() + limit;
    const fail = message => {
      if (generation !== speechGeneration) return;
      cancelSpeech();
      $('demo-voice').checked = false;
      audioStatus(message);
    };
    utterance.onend = () => {
      if (generation !== speechGeneration) return;
      audioPending = false;
      clearTimeout(speechWatchdog);
    };
    utterance.onerror = () => fail('系统朗读不可用，已切换静音字幕。可继续播放和逐步查看。');
    speechWatchdog = setTimeout(() => fail('系统语音未及时完成，已停止朗读并继续字幕；没有把语音异常当成业务成功。'), limit);
    synthesis.speak(utterance);
    audioStatus(`系统合成朗读 · 非原始录音 · ${utterance.voice.localService ? '系统报告为本地语音' : '系统语音可能需要网络'}。暂停后继续会重读当前句；较长语句会等待朗读结束。`);
  } catch (_) {
    cancelSpeech();
    $('demo-voice').checked = false;
    audioStatus('无法启动系统朗读，已继续静音字幕。');
  }
}

function controls() {
  const steps = DEMO.scenarios[scenarioId].steps;
  $('demo-play').textContent = playing ? '暂停演示' : elapsed >= DEMO.scenarios[scenarioId].seconds ? '重新播放' : '播放演示';
  $('demo-play').setAttribute('aria-pressed', String(playing));
  $('demo-prev').disabled = index === 0;
  $('demo-next').disabled = index === steps.length - 1;
  $('demo-orb').classList.toggle('is-active', playing && ['elder', 'agent'].includes(steps[index].speaker));
  $('demo-time').textContent = `${clock(elapsed)} / ${clock(DEMO.scenarios[scenarioId].seconds)}`;
  $('demo-progress').value = elapsed;
  $('demo-progress').setAttribute('aria-valuetext', `${clock(elapsed)}，${steps[index].id}，共${clock(DEMO.scenarios[scenarioId].seconds)}`);
  $('demo-step-count').textContent = `${String(index + 1).padStart(2, '0')} / ${steps.length}`;
}
function pause() {
  playing = false;
  cancelSpeech();
  controls();
}
function play() {
  if (playing) { pause(); return; }
  if (elapsed >= DEMO.scenarios[scenarioId].seconds) { elapsed = 0; index = 0; render(); }
  playing = true;
  lastFrame = performance.now();
  controls();
  speakCurrent();
}
function seek(nextIndex) {
  pause();
  index = Math.max(0, Math.min(DEMO.scenarios[scenarioId].steps.length - 1, nextIndex));
  elapsed = timeline[index].start;
  render();
}
function jumpToId(id) {
  const nextIndex = DEMO.scenarios[scenarioId].steps.findIndex(s => s.id === id);
  if (nextIndex >= 0) seek(nextIndex);
}
function chooseScenario(id) {
  if (!DEMO.scenarios[id]) return;
  pause();
  scenarioId = id;
  timeline = schedule(id);
  // Reset the old scenario's index before any control render. A completed
  // long story can otherwise index past the end of the shorter privacy branch.
  index = 0;
  elapsed = 0;
  $('demo-progress').max = DEMO.scenarios[id].seconds;
  document.querySelectorAll('[data-scenario]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scenario === id)));
  renderChapters();
  renderTranscript();
  seek(DEMO.scenarios[id].entry);
  announce(`${DEMO.scenarios[id].title}。从比较点开始；前置状态由共有剧本重建，未继承其他分支的分享或操作。`);
}

function renderChapters() {
  const steps = DEMO.scenarios[scenarioId].steps;
  const chapters = chapterAnchors.filter(([id]) => steps.some(s => s.id === id));
  if (scenarioId !== 'main') chapters.push([scenarioId === 'privacy' ? 'P01' : 'X01', '对照分支']);
  $('demo-chapters').innerHTML = chapters.map(([id, label]) => `<button type="button" data-jump="${id}">${escapeHtml(label)}</button>`).join('');
}
function renderTranscript() {
  $('demo-transcript').innerHTML = DEMO.scenarios[scenarioId].steps.map((step, i) => `<li><button type="button" data-jump="${step.id}" aria-label="跳到 ${step.id}">${step.id}<br>${clock(timeline[i].start)}</button><div><strong>${escapeHtml(DEMO.speakers[step.speaker])} / ${escapeHtml(step.when)}</strong><p>${escapeHtml(step.text)}</p><small>${escapeHtml(step.note)}</small><small>事件：${step.events.map(e => escapeHtml(`${e.tool} [${e.status}]`)).join(' · ')}</small></div></li>`).join('');
}
function renderChat(step) {
  const visible = DEMO.scenarios[scenarioId].steps.slice(0, index + 1).filter(s => s.session === step.session && ['elder', 'agent'].includes(s.speaker)).slice(-4);
  $('demo-chat').innerHTML = visible.length ? visible.map(s => `<li class="${s.speaker === 'elder' ? 'demo-from-elder' : ''}"><span>${escapeHtml(DEMO.speakers[s.speaker])} / ${s.id}</span>${escapeHtml(s.text)}</li>`).join('') : '<li class="demo-chat-empty">当前没有播放给陈阿姨的对话。<br>家属的页面操作不自动在老人端出声。</li>';
  $('demo-chat').scrollTop = $('demo-chat').scrollHeight;
  $('demo-speaking').textContent = step.speaker === 'elder' ? '陈阿姨说话 · Agent 倾听（演示）' : step.speaker === 'agent' ? 'Agent 统一播报（演示）' : step.speaker === 'family' ? '当前是家属端操作' : '场景说明 / 时间跳转';
  $('demo-caption-speaker').textContent = step.speaker === 'family' ? '老人端未播放这一句' : DEMO.speakers[step.speaker];
  $('demo-caption-text').textContent = step.speaker === 'family' ? '小林正在家属端查看或操作。这句话没有直接播放给陈阿姨；只有获准转达的留言和反馈，才会在后续出现。' : step.text;
  const reminder = snapshot.reminders[0];
  $('demo-personal-reminder').innerHTML = reminder ? `个人安排 / ${escapeHtml(reminderLabels[reminder.status])}<span>10月24日 周六 10:00 · Asia/Shanghai · 单次<br>不会因生活分享而自动同步给家属</span>` : '个人提醒尚未生效<span>识别出时间或口头确认，不等于已经保存。</span>';
}
function renderBackend(step) {
  const focusIndex = ['voice', 'memory', 'candidate', 'gateway', 'reminder', 'share', 'request', 'message', 'summary'].indexOf(step.focus);
  const stage = focusIndex === 0 ? 0 : focusIndex <= 2 ? 1 : focusIndex <= 4 ? 2 : 3;
  $('demo-pipeline').innerHTML = ['最终轮次', '检索与候选', '校验与提交', '受控输出'].map((label, i) => `<span class="${stage === i ? 'is-current' : ''}">${label}</span>`).join('');
  $('demo-source').textContent = `${step.session} / ${step.id}`;
  $('demo-events').innerHTML = step.events.map(e => `<article class="demo-event"><div><code>${escapeHtml(e.tool)}</code><span class="demo-event-status">${escapeHtml(e.status)}</span></div><p>${escapeHtml(e.detail)}</p><details><summary>查看输入 / 结果字段（模拟）</summary><pre>${json(e.data)}</pre></details></article>`).join('');
  $('demo-memory-count').textContent = `${snapshot.memories.length} 条有效记录`;
  $('demo-memories').innerHTML = snapshot.memories.slice().reverse().map(m => {
    const previous = snapshot.memoryHistory.find(old => old.id === m.id && old.replacedBy === m.version);
    return `<article class="demo-memory"><strong>${m.id} : v${m.version} / ${escapeHtml(m.kind)}</strong>${previous ? `<small>旧 v${previous.version}（已替代）：${escapeHtml(previous.text)}</small>` : ''}<p>${escapeHtml(m.text)}</p><small>来源 ${m.source.session}/${m.source.turn}:rev${m.source.revision} · 仅本人<br>记录时间 ${escapeHtml(m.recordedAt)} · 状态：${escapeHtml(m.status)}</small></article>`;
  }).join('');
  $('demo-state').textContent = JSON.stringify({ notice: '讲解者视角；不是家属可见数据；本地确定性回放', session: snapshot.session, contextTurns: snapshot.context.map(s => s.turn), candidates: snapshot.candidates, confirmations: snapshot.confirmations, memoryHistory: snapshot.memoryHistory, lastReceipts: snapshot.receipts.slice(-3) }, null, 2);
}
function renderFamily(step) {
  // Deliberately pass only the authorized projection into this renderer.
  const view = familyView(snapshot);
  const blocks = [];
  for (const projection of view.projections) {
    blocks.push(`<article class="demo-family-card"><h4>最近的生活 / 妈妈愿意分享</h4><p>${escapeHtml(projection.summary)}</p><blockquote>“${escapeHtml(projection.quote)}”</blockquote><small>文字原话片段 · 非原始录音<br>来源 ${escapeHtml(projection.sources.join(' · '))}<br>授权 S-A/A13 · 接收人：仅小林</small></article>`);
    blocks.push(`<article class="demo-family-card demo-topic"><h4>下次聊什么 / 可选的关怀线索</h4><p>${escapeHtml(projection.topic)}</p><small>不是心理诊断，不产生必须完成的问候工单。</small></article>`);
  }
  for (const request of view.requests) {
    const count = ['requested', 'accepted', 'reported_done', 'closed'].indexOf(request.status) + 1;
    let action = '';
    if (request.status === 'requested') action = '<button type="button" data-jump="F03">演示小林接手 →</button>';
    else if (request.status === 'accepted') action = '<button type="button" data-jump="F04">演示小林反馈 →</button>';
    else if (request.status === 'reported_done') action = '<button type="button" data-jump="C04">演示妈妈确认收到 →</button>';
    blocks.push(`<article class="demo-family-card demo-request"><h4>需要你参与 / 明确求助</h4><p>${escapeHtml(request.title)}</p><small>${escapeHtml(request.specification)}<br>确认 ${request.authorizationSource.session}/${request.authorizationSource.turn} · Q01:v${request.version}<br>请求时间：10月25日 周日 · 接收人：小林</small><span class="demo-request-status">${escapeHtml(requestLabels[request.status])}</span><div class="demo-request-steps" aria-hidden="true">${[1, 2, 3, 4].map(n => `<span class="${n <= count ? 'done' : ''}"></span>`).join('')}</div><small>等待回应 → 接手 → 家属反馈 → 本人确认</small>${action}</article>`);
  }
  for (const message of view.messages) blocks.push(`<article class="demo-family-card"><h4>小林主动留下的文字 / 剧本模拟</h4><p>“${escapeHtml(message.text)}”</p><small>发送者：小林 · ${message.status === 'relayed' ? '已在剧本后续转达给妈妈' : '模拟已提交；尚未转达给妈妈'}<br>不由 Agent 冒充小林，也不合成她的声音。</small></article>`);
  if (!blocks.length) blocks.push('<div class="demo-empty"><div class="demo-empty-symbol" aria-hidden="true">↗</div><strong>暂时没有新的共享内容</strong><p>等有了妈妈愿意分享的近况，<br>再来看看她最近在关心什么。</p></div>');
  if (step.speaker === 'family') blocks.push(`<article class="demo-family-card"><h4>当前家属台词 / 预设演出</h4><p>${escapeHtml(step.text)}</p><small>这是脚本中的小林，不是真实家属操作回执。</small></article>`);
  $('demo-family-content').innerHTML = blocks.join('');
}
function render() {
  const step = DEMO.scenarios[scenarioId].steps[index];
  snapshot = stateAt(scenarioId, index);
  $('demo-act').textContent = DEMO.acts[step.act];
  $('demo-scene').textContent = step.speaker === 'system' ? step.text : `${step.id} / ${DEMO.speakers[step.speaker]}${step.focus === 'memory' ? ' · 记忆读写' : ''}`;
  $('demo-when').textContent = step.when;
  $('demo-note').textContent = step.note;
  renderChat(step);
  renderBackend(step);
  renderFamily(step);
  const jumps = [...$('demo-chapters').querySelectorAll('[data-jump]')];
  const currentChapter = jumps.filter(b => DEMO.scenarios[scenarioId].steps.findIndex(s => s.id === b.dataset.jump) <= index).sort((a, b) => DEMO.scenarios[scenarioId].steps.findIndex(s => s.id === b.dataset.jump) - DEMO.scenarios[scenarioId].steps.findIndex(s => s.id === a.dataset.jump))[0];
  jumps.forEach(b => { if (b === currentChapter) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
  controls();
}
function tick(now) {
  if (playing) {
    const delta = Math.min(.25, Math.max(0, (now - lastFrame) / 1000)) * speed;
    let next = elapsed + delta;
    if (audioPending && now < audioDeadline) next = Math.min(next, timeline[index].end - .001);
    elapsed = Math.min(next, DEMO.scenarios[scenarioId].seconds);
    const nextIndex = timeline.findIndex(t => elapsed < t.end);
    if (nextIndex >= 0 && nextIndex !== index) {
      index = nextIndex;
      render();
      speakCurrent();
    }
    if (elapsed >= DEMO.scenarios[scenarioId].seconds) pause();
    controls();
  }
  lastFrame = now;
  requestAnimationFrame(tick);
}

$('demo-play').addEventListener('click', play);
$('demo-prev').addEventListener('click', () => seek(index - 1));
$('demo-next').addEventListener('click', () => seek(index + 1));
$('demo-reset').addEventListener('click', () => seek(0));
$('demo-speed').addEventListener('change', e => { speed = Number(e.target.value); if (playing) speakCurrent(); });
$('demo-voice').addEventListener('change', () => {
  if ($('demo-voice').checked) { if (playing) speakCurrent(); else audioStatus('系统朗读已选中。点击播放后尝试中文语音；暂停或跳转会立即停止。'); }
  else { cancelSpeech(); audioStatus('静音字幕模式。没有麦克风采集或真实语音识别。'); }
});
$('demo-progress').addEventListener('input', e => {
  pause();
  elapsed = Number(e.target.value);
  index = timeline.findIndex(t => elapsed < t.end);
  if (index < 0) index = timeline.length - 1;
  render();
});
$('conversation-demo').addEventListener('click', e => {
  const scenario = e.target.closest('[data-scenario]');
  if (scenario) chooseScenario(scenario.dataset.scenario);
  const jump = e.target.closest('[data-jump]');
  if (jump) { jumpToId(jump.dataset.jump); announce('已跳转到剧本步骤，尚未执行真实家属操作。'); }
});
$('demo-fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if ($('conversation-demo').requestFullscreen) await $('conversation-demo').requestFullscreen();
    else throw new Error('unsupported');
  } catch (_) { announce('当前浏览器不能进入全屏，请使用浏览器的全屏功能。'); audioStatus('全屏未开启。演示可继续；也可使用浏览器全屏。'); }
});
$('demo-download-script').addEventListener('click', () => {
  const scenario = DEMO.scenarios[scenarioId];
  const parts = ['# AgeGuard · ' + scenario.title, '> 虚构情景与本地回放。不是实际 ASR、模型、持久化、授权、通知或真实家属记录。', ...scenario.steps.map((s, i) => `## ${s.id} · ${clock(timeline[i].start)} · ${DEMO.speakers[s.speaker]}\n\n${s.when}\n\n${s.text}\n\n讲解：${s.note}\n\n事件：\n${s.events.map(e => '- ' + e.tool + ' [' + e.status + ']：' + e.detail + '\n\n```json\n' + JSON.stringify(e.data, null, 2) + '\n```').join('\n')}`)];
  const url = URL.createObjectURL(new Blob([parts.join('\n\n')], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `ageguard-${scenarioId}-script.md`; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
  if (e.target.closest('input, select, textarea, button, summary, [contenteditable], [role="menu"], .archify-dialog-overlay.open')) return;
  if ($('export-menu').classList.contains('open') || $('archify-gif-dialog').classList.contains('open')) return;
  if (e.code === 'Space') { e.preventDefault(); play(); }
  if (e.key === 'ArrowRight') { e.preventDefault(); seek(index + 1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); seek(index - 1); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('pagehide', pause);
if (!audioAvailable) { $('demo-voice').disabled = true; audioStatus('此浏览器不支持系统朗读；静音字幕、逐步回放和时序图仍可使用。'); }
if (synthesis) { try { synthesis.getVoices(); } catch (_) { audioAvailable = false; $('demo-voice').disabled = true; } }
renderChapters();
renderTranscript();
render();
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const syncMotion = () => {
  const svg = document.querySelector('.diagram-container svg');
  if (svg && typeof svg.pauseAnimations === 'function') {
    if (motionPreference.matches) svg.pauseAnimations(); else svg.unpauseAnimations();
  }
};
syncMotion();
motionPreference.addEventListener?.('change', syncMotion);
// Small inspectable controller for browser checks and live presenting. No backend access.
window.AgeGuardDemo = Object.freeze({
  chooseScenario, jumpToId, pause, play,
  inspect: () => ({ scenarioId, index, elapsed, playing, step: DEMO.scenarios[scenarioId].steps[index].id, state: structuredClone(snapshot), family: familyView(snapshot) })
});
requestAnimationFrame(tick);
