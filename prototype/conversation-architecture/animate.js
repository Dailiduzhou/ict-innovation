// Pure presentation controller. No backend, microphone, model, or messaging API.
(function () {
  'use strict';
  const data = ARCH_STORY;
  const $ = id => document.getElementById(id);
  const svg = document.querySelector('.diagram-container svg');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0;
  let overview = false;
  let automatic = !preference.matches;
  let flowing = !preference.matches;
  let period = 9000;
  let elapsed = 0;
  let last = performance.now();
  const getChapter = () => data.chapters[current];

  function motion() {
    svg.classList.toggle('c-flow-paused', !flowing);
    if (typeof svg.pauseAnimations === 'function') {
      if (flowing) svg.unpauseAnimations(); else svg.pauseAnimations();
    }
    $('arch-flow').checked = flowing;
  }
  function render() {
    const chapter = getChapter();
    const keys = overview ? Object.keys(data.edges) : chapter.edges;
    const activeEdges = new Set(keys.map(key => data.edges[key][0]));
    const activeNodes = new Set(overview ? data.nodes : chapter.nodes);
    for (const group of svg.querySelectorAll('[data-edge]')) {
      group.classList.toggle('is-active', activeEdges.has(Number(group.dataset.edge)));
    }
    for (const group of svg.querySelectorAll('[data-node]')) {
      group.classList.toggle('is-active', activeNodes.has(group.dataset.node));
      group.classList.toggle('is-blocked', !overview && (chapter.blocked || []).includes(group.dataset.node));
    }
    for (const badge of svg.querySelectorAll('[data-badge]')) {
      badge.textContent = overview ? '' : chapter.badges?.[badge.dataset.badge] || '';
    }
    $('arch-now-title').textContent = overview ? '四个角色，一条受控的信息闭环' : chapter.title;
    $('arch-now-summary').textContent = overview ? '老人 ↔ AI 助理负责交流；后台 Agent 通过业务网关读取与更新私人记忆，生成获准的提醒、分享与求助；家属本人回应，再将有来源的结果转达老人。' : chapter.summary;
    $('arch-now-quote').textContent = overview ? '“记住重要的生活，在本人可控制的范围内，帮助家人接着聊、接着做。”' : `“${chapter.quote}”`;
    $('arch-now-source').textContent = overview ? '设计总览 / 虚构养鱼情景；不是实时调用追踪' : `虚构原话 ${chapter.quoteSource} / 章节按机制组织，不是实测时间顺序`;
    $('arch-input').textContent = overview ? '老人语音与家属本人的操作，均保留来源和明确身份。' : chapter.input;
    $('arch-process').textContent = overview ? '最终轮次 → Agent 候选 → 业务网关；读权限、确认、版本、幂等与持久化不交给模型自行决定。' : chapter.process;
    $('arch-output').textContent = overview ? '个人记忆、个人提醒、授权近况、明确求助、本人留言彼此分立；结果经统一输出协调转达。' : chapter.output;
    $('arch-rule').textContent = overview ? '不把所有聊天变成工单，不把私人记忆交给家属，不把模拟当作真实实现。AI 助理与 Agent 是职责划分，不强制两个模型。' : chapter.rule;
    $('arch-svg-title').textContent = overview ? '四角色 / 双向信息闭环' : `${current < data.mainCount ? String(current + 1).padStart(2, '0') : '边界'} / ${chapter.title}`;
    $('arch-svg-quote').textContent = overview ? '语音交互与后台整理并行；所有副作用经业务校验' : chapter.shortQuote;
    $('arch-position').textContent = overview ? '总览' : current < data.mainCount ? `${String(current + 1).padStart(2, '0')} / ${data.mainCount}` : '边界分支';
    $('arch-overview').textContent = overview ? '返回分步' : '架构总览';
    $('arch-overview').setAttribute('aria-pressed', String(overview));
    $('arch-auto').checked = automatic;
    document.querySelectorAll('[data-chapter]').forEach(button => {
      const selected = !overview && button.dataset.chapter === chapter.id;
      if (selected) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
    });
    $('arch-progress').value = elapsed / period;
    motion();
  }
  function select(id, keepAuto = false) {
    const next = data.chapters.findIndex(chapter => chapter.id === id);
    if (next < 0) throw new Error('Unknown architecture chapter');
    current = next;
    overview = false;
    elapsed = 0;
    if (!keepAuto) automatic = false;
    render();
  }
  function next() { select(data.chapters[current >= data.mainCount - 1 ? 0 : current + 1].id); }
  function previous() { select(data.chapters[current > 0 && current < data.mainCount ? current - 1 : data.mainCount - 1].id); }
  function setAuto(enabled) {
    automatic = enabled;
    if (automatic && (overview || current >= data.mainCount)) { current = 0; overview = false; elapsed = 0; }
    last = performance.now();
    render();
  }
  function setFlow(enabled) { flowing = enabled; motion(); }
  function showOverview() { overview = !overview; automatic = false; elapsed = 0; render(); }

  $('arch-tabs').addEventListener('click', event => {
    const button = event.target.closest('[data-chapter]');
    if (button) select(button.dataset.chapter);
  });
  $('arch-next').addEventListener('click', next);
  $('arch-prev').addEventListener('click', previous);
  $('arch-overview').addEventListener('click', showOverview);
  $('arch-auto').addEventListener('change', event => setAuto(event.target.checked));
  $('arch-flow').addEventListener('change', event => setFlow(event.target.checked));
  $('arch-period').addEventListener('change', event => { period = Number(event.target.value); elapsed = 0; });
  $('arch-zoom').addEventListener('change', event => { $('arch-scale').style.width = `${Number(event.target.value)}%`; });
  $('arch-fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $('arch-view').requestFullscreen();
    } catch (_) { $('arch-message').textContent = '此浏览器无法进入页面全屏，可使用浏览器自带全屏功能。'; }
  });
  // Freeze chapter changes before the stock exporter captures current SVG.
  // Flowing dots remain available for animated GIF/WebM export.
  $('btn-export').addEventListener('click', () => {
    automatic = false;
    $('arch-auto').checked = false;
    $('arch-message').textContent = '已暂停自动讲解，导出当前章节的图；可先点“架构总览”导出完整信息流。';
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { automatic = false; flowing = false; render(); }
  });
  preference.addEventListener?.('change', event => {
    if (event.matches) { automatic = false; flowing = false; render(); }
  });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest('input, select, textarea, button, summary, [contenteditable], [role="menu"]')) return;
    if ($('export-menu').classList.contains('open') || $('archify-gif-dialog').classList.contains('open')) return;
    if (event.code === 'Space') { event.preventDefault(); setAuto(!automatic); }
    if (event.key === 'ArrowRight') { event.preventDefault(); next(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); previous(); }
  });
  function tick(now) {
    if (automatic) {
      elapsed += Math.min(250, Math.max(0, now - last));
      if (elapsed >= period) select(data.chapters[(current + 1) % data.mainCount].id, true);
      $('arch-progress').value = elapsed / period;
    }
    last = now;
    requestAnimationFrame(tick);
  }
  render();
  if (preference.matches) $('arch-message').textContent = '已尊重系统“减少动态效果”设置：自动讲解与流动均关闭，可手动开启。';
  window.AgeGuardArchitecture = Object.freeze({
    select, next, previous, showOverview, setAuto, setFlow,
    inspect: () => ({ current: getChapter().id, overview, automatic, flowing, elapsed,
      edges: overview ? Object.keys(data.edges) : [...getChapter().edges],
      blocked: overview ? [] : [...(getChapter().blocked || [])] })
  });
  requestAnimationFrame(tick);
})();
