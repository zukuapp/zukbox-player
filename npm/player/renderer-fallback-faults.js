// Real-browser fault injection for check-renderer-fallback.mjs (test-only, not shipped).
// Main-thread init script. Prepends a fault-injection prelude into the player's inline renderer worker
// (the worker source string is the only Blob part that contains "requestAdapter").
(function () {
  const MODE = window.__FAULT_MODE__ || 'none';
  window.__probe = [];
  function workerPrelude(MODE) {
    const post = (o) => { try { self.postMessage({ __probe: Object.assign({ ts: Math.round(performance.now()) }, o) }); } catch (e) {} };
    post({ t: 'prelude', mode: MODE });
    self.addEventListener('error', (e) => post({ t: 'worker-error', msg: String(e.message) }));
    self.addEventListener('unhandledrejection', (e) => post({ t: 'unhandledrejection', msg: String(e.reason && (e.reason.message || e.reason)) }));
    const OrigOffscreenCanvas = self.OffscreenCanvas;
    // canvases created inside the worker are scratch/probe canvases; the stage canvas arrives transferred
    self.OffscreenCanvas = class extends OrigOffscreenCanvas { constructor(w, h) { super(w, h); this.__scratch = true; } };
    const origGetContext = OrigOffscreenCanvas.prototype.getContext;
    OrigOffscreenCanvas.prototype.getContext = function (id, opts) {
      if (MODE === 'getcontext-null' && id === 'webgpu') { if (this.__scratch) { post({ t: 'getContext', id, scratch: true, result: 'null(injected)' }); return null; } post({ t: 'getContext', id, result: 'null(injected)' }); return null; }
      if (MODE === 'no-backend' && id === 'webgl2') { post({ t: 'getContext', id, result: 'null(injected)' }); return null; }
      let r;
      try { r = origGetContext.call(this, id, opts); } catch (e) { post({ t: 'getContext', id, threw: String(e) }); throw e; }
      if (this.width > 8 || this.height > 8 || id !== '2d') post({ t: 'getContext', id, scratch: !!this.__scratch, result: r ? r.constructor.name : 'null', w: this.width, h: this.height });
      return r;
    };
    if (self.GPU) {
      const origReqAdapter = GPU.prototype.requestAdapter;
      GPU.prototype.requestAdapter = async function (o) {
        if (MODE === 'null-adapter' || MODE === 'no-backend') { post({ t: 'adapter', result: 'null(injected)' }); return null; }
        const a = await origReqAdapter.call(this, o);
        post({ t: 'adapter', result: a ? 'GPUAdapter' : 'null' });
        return a;
      };
      if (MODE === 'preferred-format-throws') {
        GPU.prototype.getPreferredCanvasFormat = function () { post({ t: 'inject', what: 'getPreferredCanvasFormat throws' }); throw new Error('injected getPreferredCanvasFormat failure'); };
      }
    }
    if (self.GPUAdapter) {
      const origReqDevice = GPUAdapter.prototype.requestDevice;
      GPUAdapter.prototype.requestDevice = async function (d) {
        if (MODE === 'device-reject') { post({ t: 'inject', what: 'requestDevice rejects' }); throw new DOMException('injected requestDevice failure', 'OperationError'); }
        const dev = await origReqDevice.call(this, d);
        post({ t: 'device', result: 'GPUDevice' });
        dev.lost.then((info) => post({ t: 'device-lost', reason: info.reason, message: String(info.message).slice(0, 160) }));
        dev.addEventListener('uncapturederror', (e) => post({ t: 'uncapturederror', msg: String(e.error && e.error.message).slice(0, 200) }));
        if (MODE === 'device-lost-init') { post({ t: 'inject', what: 'device.destroy() before renderer init' }); dev.destroy(); }
        if (MODE === 'device-lost-after') setTimeout(() => { post({ t: 'inject', what: 'device.destroy() 2500ms after init' }); dev.destroy(); }, 2500);
        return dev;
      };
    }
    if (self.GPUCanvasContext && MODE === 'configure-throws') {
      GPUCanvasContext.prototype.configure = function () { post({ t: 'inject', what: 'configure throws' }); throw new TypeError('injected GPUCanvasContext.configure failure'); };
    }
    if (self.GPUCanvasContext && MODE === 'configure-throws-real') {
      const o = GPUCanvasContext.prototype.configure;
      GPUCanvasContext.prototype.configure = function (c) { if (!this.canvas.__scratch) { post({ t: 'inject', what: 'configure throws on the stage canvas only' }); throw new TypeError('injected stage-canvas configure failure'); } return o.call(this, c); };
    }
    if (self.GPUDevice && MODE === 'ctor-throws') {
      GPUDevice.prototype.createShaderModule = function () { post({ t: 'inject', what: 'createShaderModule throws' }); throw new Error('injected createShaderModule failure'); };
    }
    if (self.GPUDevice && MODE === 'shader-invalid') {
      const o = GPUDevice.prototype.createShaderModule; let n = 0;
      GPUDevice.prototype.createShaderModule = function (desc) { if (!n++) post({ t: 'inject', what: 'invalid WGSL (validation error, no throw)' }); return o.call(this, Object.assign({}, desc, { code: desc.code + '\n fn @@invalid( {' })); };
    }
  }
  const prelude = '(' + workerPrelude.toString() + ')(' + JSON.stringify(MODE) + ');\n';
  const OrigBlob = window.Blob;
  function PatchedBlob(parts, opts) {
    if (Array.isArray(parts)) {
      const i = parts.findIndex((p) => typeof p === 'string' && p.includes('requestAdapter'));
      if (i >= 0) { parts = parts.slice(0, i).concat([prelude], parts.slice(i)); window.__probe.push({ t: 'main', what: 'prelude injected into renderer worker blob' }); }
    }
    return new OrigBlob(parts, opts);
  }
  PatchedBlob.prototype = OrigBlob.prototype;
  Object.setPrototypeOf(PatchedBlob, OrigBlob);
  window.Blob = PatchedBlob;
  const OrigWorker = window.Worker;
  window.addEventListener('next2d-renderer', (e) => window.__probe.push(Object.assign({ t: 'status-event' }, e.detail)));
  window.__renderStats = { posted: 0, returned: 0, raf: 0, postedBytes: 0 };
  const origRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => { window.__renderStats.raf++; return origRaf(cb); };
  window.Worker = class extends OrigWorker {
    postMessage(m, t) { if (m && m.command === 'render') { window.__renderStats.posted++; window.__renderStats.postedBytes += m.buffer ? m.buffer.byteLength : 0; } return super.postMessage(m, t); }
    constructor(u, o) {
      super(u, o);
      this.addEventListener('message', (e) => { if (e.data && e.data.message === 'render') window.__renderStats.returned++; });
      this.addEventListener('message', (e) => { if (e.data && e.data.__probe) window.__probe.push(e.data.__probe); else if (e.data && e.data.message && e.data.message !== 'render') window.__probe.push({ t: 'main-recv', message: e.data.message, backend: e.data.backend || null, detail: e.data.error || e.data.reason || null }); });
      this.addEventListener('error', (e) => window.__probe.push({ t: 'main-worker-error-event', msg: e.message }));
    }
  };
})();
