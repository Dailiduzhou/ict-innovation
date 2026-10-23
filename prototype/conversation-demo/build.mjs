import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DEMO, schedule, stateAt } from './scenario.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const renderer = path.join(root, '.agents/skills/dynamic-archify/renderers/sequence/render-sequence.mjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ageguard-archify-'));
const output = path.join(root, 'prototype/conversation-demo.html');
function replaceOnce(text, needle, value) {
  if (text.split(needle).length !== 2) throw new Error(`Expected one integration anchor: ${needle}`);
  return text.replace(needle, () => value);
}
try {
  // The renderer owns schema and layout checks. Never alter the skill renderer.
  const rendered = path.join(temp, 'sequence.html');
  const child = spawnSync(process.execPath, [renderer, path.join(here, 'flow.sequence.json'), rendered], {
    cwd: root, timeout: 15000, encoding: 'utf8', maxBuffer: 1024 * 1024
  });
  if (child.error || child.status !== 0) throw new Error(child.error?.message || child.stderr || 'renderer failed');
  if (child.stderr) process.stderr.write(child.stderr);
  let html = fs.readFileSync(rendered, 'utf8');
  const scenario = fs.readFileSync(path.join(here, 'scenario.mjs'), 'utf8').replace(/^export \{[^\n]+\};\s*$/m, '');
  const player = fs.readFileSync(path.join(here, 'player.js'), 'utf8');
  const css = fs.readFileSync(path.join(here, 'player.css'), 'utf8');
  const markup = fs.readFileSync(path.join(here, 'player.html'), 'utf8');
  if (/<\/script/i.test(scenario + player)) throw new Error('Escape closing script tags before embedding');
  html = replaceOnce(html, '<html lang="en"', '<html lang="zh-CN"');
  html = replaceOnce(html, '</head>', `  <style id="ageguard-player-styles">\n${css}\n  </style>\n</head>`);
  html = replaceOnce(html, '    <!-- Main Diagram -->', `${markup}\n    <details class="demo-diagram" id="demo-diagram">\n      <summary>查看完整链路时序图 / 导出 PNG、SVG 或流动动画</summary>\n      <p>设计总览，不是调用追踪实测。时间向下，箭头按源 → 目标流动。右上角 Export 仅导出下方时序图，不包含播放器、对话面板或语音；整页演示请使用屏幕录制。GIF / WebM 只包含连接流动，受浏览器能力和内存限制。</p>\n    <!-- Main Diagram -->`);
  html = replaceOnce(html, '    <!-- Footer -->', '    </details>\n\n    <!-- Footer -->');
  // Keep legend arrows behind component rectangles too, without changing renderer code.
  const legend = html.match(/        <!-- Legend -->[\s\S]*?(?=\n      <\/svg>)/);
  if (!legend) throw new Error('missing generated legend');
  html = replaceOnce(html, legend[0], '');
  html = replaceOnce(html, '        <!-- Activations -->', `${legend[0]}\n\n        <!-- Activations -->`);
  html = replaceOnce(html, '</body>', `  <script id="ageguard-player-script">\n(function () {\n'use strict';\n${scenario}\n${player}\n})();\n  </script>\n</body>`);
  // All script-derived snapshots must be valid before shipping the page.
  for (const [id, scene] of Object.entries(DEMO.scenarios)) {
    for (let i = 0; i < scene.steps.length; i++) stateAt(id, i);
  }
  fs.writeFileSync(output, html);

  const format = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const script = [
    '# AgeGuard · 把生活接着聊：完整演示脚本',
    '> 由 scenario.mjs 自动生成。人物、日期、台词、转写、工具调用、授权、保存、通知、家属操作均为虚构回放。不是已接通产品或真实用户研究。',
    '## 讲解方法',
    '打开 ../conversation-demo.html，默认静音。播放主线约五分钟；系统朗读可选，较长句会等待，因此实际时长可增加。左右方向键逐步、空格播放/暂停；焦点在表单、按钮或导出菜单内时不接管。T 切主题、E 导出时序图。切换分支从比较点开始，前置状态由该分支自身剧本重建；“从头回放”回到该分支首句。',
    '## 场景前提',
    '地点为陈阿姨家，手机基础入口。虚构日期：2026-10-23（周五）至 10-25（周日），Asia/Shanghai。种子记忆源于虚构 S-00/T-02（10-20）：养鱼、小林是女儿且小时候爱看鱼、旧鱼粮是小颗粒。本人允许保留普通生活记忆，家属只可读授权投影；小林文字留言的接收设置已允许。',
    '## 三种不同产物',
    '| 产物 | 来源 | 谁可见 | 是否要求办结 |\n|---|---|---|---|\n| 生活近况与可聊话题 | 明确许可的鱼近况与回忆 | 仅小林 | 否 |\n| 单次换水提醒 | 改口后核对并确认的安排 | 仅陈阿姨 | 本人反馈关闭单次实例 |\n| 带鱼粮求助 | 指定小林、时间、行动与分享许可 | 陈阿姨与小林 | 接手、反馈、本人确认 |',
    '## 证据纪律',
    '工具名和字段是演示契约。按顺序回放不证明后台真正并行；脚本插话不证明全双工；内存状态不证明持久化；图中调度不证明通知必达；家属自报不证明客观完成。保存失败是必须处理的系统异常；普通手机后台、网络及系统音色差异是客观条件，两者不能混为一谈。'
  ];
  for (const [id, scene] of Object.entries(DEMO.scenarios)) {
    const times = schedule(id);
    script.push(`## ${scene.title} / ${id}\n\n${scene.description}。共 ${scene.steps.length} 步，静音时间轴 ${format(scene.seconds)}。`);
    for (let i = 0; i < scene.steps.length; i++) {
      const step = scene.steps[i];
      script.push(`### ${step.id} · ${format(times[i].start)} · ${DEMO.speakers[step.speaker]}\n\n**${step.when} / ${step.session}**\n\n> ${step.text}\n\n讲解：${step.note}\n\n${step.events.map(e => `- \`${e.tool}\` **${e.status}**：${e.detail}\n  - 字段：\`${JSON.stringify(e.data)}\``).join('\n')}`);
    }
  }
  fs.writeFileSync(path.join(here, 'script.md'), script.join('\n\n') + '\n');
  console.log(`Built ${path.relative(root, output)} (${Math.round(Buffer.byteLength(html) / 1024)} KiB)`);
  console.log('Built prototype/conversation-demo/script.md');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
