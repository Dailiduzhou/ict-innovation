// Additive WebM capture: leave the stock Archify scripts intact. In our Chrome
// validation the stock VP9/capture-before-first-paint path produced black frames.
// Paint each frame first, request explicit capture, and prefer supported VP8.
(function () {
  'use strict';
  const menu = document.getElementById('export-menu');
  const nativeRun = Archify.exportMenu.run;
  const status = document.getElementById('arch-message');
  let busy = false;
  const report = text => { status.textContent = text; };
  const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

  function frameSvg(time, scale) {
    const live = document.querySelector('.diagram-container svg');
    const clone = live.cloneNode(true);
    const vb = live.viewBox.baseVal;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', vb.width * scale);
    clone.setAttribute('height', vb.height * scale);
    clone.setAttribute('data-theme', document.documentElement.dataset.theme || 'dark');
    // Both palettes and semantic rules are local; no fonts/images are fetched.
    const css = [...document.querySelectorAll('style')].map(style => style.textContent).join('\n');
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = css + '\nsvg { font-family: ui-monospace, SFMono-Regular, Menlo, "PingFang SC", "Microsoft YaHei", monospace; }\n* { animation: none !important; transition: none !important; }\n.c-video-bg { fill: var(--bg); }';
    clone.insertBefore(style, clone.firstChild);
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('class', 'c-video-bg');
    clone.insertBefore(bg, style.nextSibling);
    for (const [selector, duration] of [['.a-emphasis', .8], ['.a-default', 1.2], ['.a-security', 1], ['.a-dashed', 1]]) {
      for (const path of clone.querySelectorAll(selector)) {
        path.style.strokeDashoffset = String(-20 * ((time % duration) / duration));
        if (selector === '.a-emphasis') path.style.opacity = String(.6 + .2 * (1 - Math.cos(Math.PI * time)));
      }
    }
    for (const motion of clone.querySelectorAll('animateMotion')) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', motion.getAttribute('path'));
      const duration = parseFloat(motion.getAttribute('dur'));
      const point = path.getPointAtLength(path.getTotalLength() * (time % duration) / duration);
      motion.parentNode.setAttribute('cx', point.x);
      motion.parentNode.setAttribute('cy', point.y);
      motion.remove();
    }
    return new XMLSerializer().serializeToString(clone);
  }
  async function paint(ctx, canvas, frame) {
    const url = URL.createObjectURL(new Blob([frame], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const image = new Image();
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('视频帧绘制超时')), 10000);
        image.onload = () => { clearTimeout(timer); resolve(); };
        image.onerror = () => { clearTimeout(timer); reject(new Error('无法加载视频帧')); };
        image.src = url;
      });
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);
    } finally { URL.revokeObjectURL(url); }
  }
  async function exportVideo() {
    if (busy) { report('视频正在导出，请等待或刷新页面取消。'); return; }
    if (typeof MediaRecorder !== 'function' || !HTMLCanvasElement.prototype.captureStream) throw new Error('此浏览器不支持 Canvas 视频导出，请用 GIF 或录屏');
    busy = true;
    let stream, recorder;
    try {
      window.AgeGuardArchitecture.setAuto(false);
      const settings = await showGifSettingsDialog('WebM');
      if (!settings) return;
      const vb = document.querySelector('.diagram-container svg').viewBox.baseVal;
      let scale = settings.scale;
      while (scale > 1 && vb.width * vb.height * scale * scale > 16 * 1024 * 1024) scale--;
      const canvas = document.createElement('canvas');
      canvas.width = vb.width * scale; canvas.height = vb.height * scale;
      const ctx = canvas.getContext('2d', { alpha: false });
      await paint(ctx, canvas, frameSvg(0, scale));
      const manual = typeof window.CanvasCaptureMediaStreamTrack?.prototype?.requestFrame === 'function';
      stream = canvas.captureStream(manual ? 0 : settings.fps);
      const track = stream.getVideoTracks()[0];
      const mimeType = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error('此浏览器没有支持的 WebM 编码器，请用 GIF 或录屏');
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 });
      const chunks = [];
      const stopped = new Promise((resolve, reject) => {
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
        recorder.onerror = event => reject(new Error(event.error?.message || '视频编码失败'));
      });
      // Attach a rejection handler immediately, even if encoding fails mid-loop.
      stopped.catch(() => {});
      recorder.start();
      const total = Math.round(settings.fps * settings.duration);
      for (let i = 0; i < total; i++) {
        const began = performance.now();
        await paint(ctx, canvas, frameSvg(i / settings.fps, scale));
        if (typeof track.requestFrame === 'function') track.requestFrame();
        report(`正在导出 WebM ${Math.round((i + 1) / total * 100)}% · ${scale}× / ${settings.fps}fps。仅连线流动，不含语音。`);
        await delay(Math.max(1, 1000 / settings.fps - (performance.now() - began)));
      }
      // Let the final painted frame reach the encoder before flushing.
      await delay(100);
      recorder.stop();
      const blob = await Promise.race([stopped, delay(10000).then(() => { throw new Error('视频编码结束超时'); })]);
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url; link.download = 'ageguard-conversation-architecture.webm';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      report(`WebM 已生成（${Math.round(blob.size / 1024)} KiB），请播放检查画面。支持范围与解码验证结果见说明。`);
    } finally {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      stream?.getTracks().forEach(track => track.stop());
      busy = false;
    }
  }
  function runVideo() {
    Archify.exportMenu.close(true);
    return exportVideo().catch(error => { report('WebM 未导出成功：' + error.message); });
  }
  // Capture stops the stock delegated click handler only for WebM.
  menu.addEventListener('click', event => {
    const button = event.target.closest('button[data-format="webm"]');
    if (!button || button.disabled) return;
    event.preventDefault(); event.stopImmediatePropagation(); runVideo();
  }, true);
  Archify.exportMenu.run = function (format) { return format === 'webm' ? runVideo() : nativeRun(format); };
})();
