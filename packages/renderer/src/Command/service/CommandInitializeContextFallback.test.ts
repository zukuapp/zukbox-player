import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
    setCanvas: vi.fn(), setContext: vi.fn(), setRendererSize: vi.fn(),
    rendererWidth: 0, rendererHeight: 0,
    webgl: vi.fn(), webgpu: vi.fn(), webgpuCtorError: null as Error | null,
    rebind: vi.fn(), resize: vi.fn(), cacheReset: vi.fn()
}));
vi.mock("../../RendererUtil", () => ({
    "$setCanvas": mocks.setCanvas, "$setContext": mocks.setContext, "$samples": 4,
    "$getRendererWidth": () => mocks.rendererWidth, "$getRendererHeight": () => mocks.rendererHeight,
    "$setRendererSize": mocks.setRendererSize
}));
vi.mock("@next2d/cache", () => ({ "$cacheStore": { "reset": mocks.cacheReset } }));
vi.mock("@next2d/webgl", () => ({ "Context": class {
    constructor (...args: unknown[]) { mocks.webgl(...args); }
    resize (...args: unknown[]) { mocks.resize("webgl", ...args); }
} }));
vi.mock("@next2d/webgpu", () => ({ "Context": class {
    constructor (...args: unknown[]) {
        mocks.webgpu(...args);
        if (mocks.webgpuCtorError) { throw mocks.webgpuCtorError; }
    }
    rebindCanvasContext (context: unknown) { mocks.rebind(context); }
    resize (...args: unknown[]) { mocks.resize("webgpu", ...args); }
} }));
import { execute, RendererInitializeError } from "./CommandInitializeContextService";

type Fault = "none" | "preferred-format-throws" | "probe-context-null" | "probe-configure-throws"
    | "validation-error" | "lost-during-probe" | "probe-timeout" | "real-context-null" | "late-validation-error";

/**
 * Fake WebGPU stack. The "real" canvas records every getContext call so the tests can assert
 * that it is never bound to WebGPU unless WebGPU was verified on the probe canvas first.
 */
const installGPU = (fault: Fault) => {
    let resolveLost: (info: unknown) => void = () => {};
    const lost = new Promise((resolve) => { resolveLost = resolve; });
    const scopes: (unknown | null)[] = [];
    const device = {
        lost,
        destroy: vi.fn(() => resolveLost({ "reason": "destroyed", "message": "" })),
        pushErrorScope: vi.fn(() => scopes.push(null)),
        popErrorScope: vi.fn(async () => {
            scopes.pop();
            const error = scopes.length === 0
                && (fault === "validation-error" || fault === "late-validation-error")
                ? Object.assign(new Error("invalid pipeline"), { "constructor": { "name": "GPUValidationError" } })
                : null;
            if (fault === "late-validation-error") {
                // GPU-side validation slower than the verification bound
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }
            return error;
        }),
        createCommandEncoder: vi.fn(() => ({
            beginRenderPass: () => ({ end: () => {} }),
            finish: () => ({})
        })),
        queue: {
            submit: vi.fn(() => {
                if (fault === "lost-during-probe") { resolveLost({ "reason": "unknown", "message": "swap chain" }); }
            }),
            onSubmittedWorkDone: vi.fn(() => fault === "probe-timeout"
                ? new Promise(() => {})
                : fault === "lost-during-probe" ? new Promise(() => {}) : Promise.resolve())
        },
        loseNow: (info: unknown) => resolveLost(info)
    };
    const probeContext = {
        configure: vi.fn(() => { if (fault === "probe-configure-throws") { throw new TypeError("unsupported format"); } }),
        getCurrentTexture: () => ({ createView: () => ({}) })
    };
    vi.stubGlobal("OffscreenCanvas", class {
        constructor (public width: number, public height: number) {}
        getContext (id: string) { return id === "webgpu" && fault !== "probe-context-null" ? probeContext : null; }
    });
    vi.stubGlobal("navigator", { "gpu": {
        requestAdapter: vi.fn().mockResolvedValue({ requestDevice: vi.fn().mockResolvedValue(device) }),
        getPreferredCanvasFormat: vi.fn(() => {
            if (fault === "preferred-format-throws") { throw new Error("no preferred format"); }
            return "bgra8unorm";
        })
    } });
    return { device, probeContext };
};

const realCanvas = (fault: Fault = "none", gl: object | null = {}) => {
    const realGpuContext = { "canvas": { "width": 1, "height": 1 } };
    return {
        width: 1, height: 1,
        addEventListener: vi.fn(),
        getContext: vi.fn((id: string) => {
            if (id === "webgpu") { return fault === "real-context-null" ? null : realGpuContext; }
            return id === "webgl2" ? gl : null;
        }),
        realGpuContext
    };
};

beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.webgpuCtorError = null;
    mocks.rendererWidth = 0; mocks.rendererHeight = 0;
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.restoreAllMocks(); });

describe("renderer capability fallback", () => {
    for (const mode of ["no-api", "null-adapter", "adapter-rejection", "device-rejection"]) {
        it(`renders with WebGL2 when WebGPU has ${mode}`, async () => {
            const gpu = mode === "no-api" ? undefined : {
                requestAdapter: mode === "adapter-rejection"
                    ? vi.fn().mockRejectedValue(new Error("adapter unavailable"))
                    : vi.fn().mockResolvedValue(mode === "null-adapter" ? null : {
                        requestDevice: vi.fn().mockRejectedValue(new Error("device unavailable"))
                    })
            };
            vi.stubGlobal("navigator", gpu ? { gpu } : {});
            const canvas = realCanvas();
            await expect(execute(canvas as unknown as OffscreenCanvas, 2)).resolves.toBe("webgl2");
            expect(canvas.getContext).not.toHaveBeenCalledWith("webgpu");
            expect(mocks.webgl).toHaveBeenCalledWith(expect.anything(), 4, 2);
            expect(mocks.webgpu).not.toHaveBeenCalled();
        });
    }

    for (const fault of ["preferred-format-throws", "probe-context-null", "probe-configure-throws", "validation-error", "lost-during-probe"] as Fault[]) {
        it(`never binds the real canvas to WebGPU and renders with WebGL2 when ${fault}`, async () => {
            vi.useFakeTimers({ "toFake": ["setTimeout", "clearTimeout"] });
            try {
                const { device } = installGPU(fault);
                const canvas = realCanvas();
                const pending = execute(canvas as unknown as OffscreenCanvas, 1);
                await vi.runAllTimersAsync();
                await expect(pending).resolves.toBe("webgl2");
                expect(canvas.getContext).not.toHaveBeenCalledWith("webgpu");
                expect(canvas.getContext).toHaveBeenCalledWith("webgl2", expect.any(Object));
                expect(device.destroy).toHaveBeenCalled();
                expect(mocks.rebind).not.toHaveBeenCalled();
            } finally {
                vi.useRealTimers();
            }
        });
    }

    it("treats a slow but alive verification frame as WebGPU-capable (timeout is not a failure)", async () => {
        vi.useFakeTimers({ "toFake": ["setTimeout", "clearTimeout"] });
        try {
            const { device } = installGPU("probe-timeout");
            const pending = execute(realCanvas() as unknown as OffscreenCanvas, 1);
            await vi.runAllTimersAsync();
            await expect(pending).resolves.toBe("webgpu");
            expect(device.destroy).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it("reports a validation error that arrives after the verification bound as a loss", async () => {
        vi.useFakeTimers({ "toFake": ["setTimeout", "clearTimeout"] });
        try {
            installGPU("late-validation-error");
            const onLost = vi.fn();
            const pending = execute(realCanvas() as unknown as OffscreenCanvas, 1, "auto", onLost);
            await vi.advanceTimersByTimeAsync(2100);
            await expect(pending).resolves.toBe("webgpu");
            expect(onLost).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(5000);
            expect(onLost).toHaveBeenCalledWith(expect.objectContaining({ "backend": "webgpu", "reason": "validation" }));
        } finally {
            vi.useRealTimers();
        }
    });

    it("never binds the real canvas when the WebGPU Context constructor throws (configure / pipeline creation)", async () => {
        const { device } = installGPU("none");
        mocks.webgpuCtorError = new TypeError("GPUCanvasContext.configure failed");
        const canvas = realCanvas();
        await expect(execute(canvas as unknown as OffscreenCanvas, 1)).resolves.toBe("webgl2");
        expect(canvas.getContext).not.toHaveBeenCalledWith("webgpu");
        expect(device.destroy).toHaveBeenCalled();
        expect(mocks.webgl).toHaveBeenCalledOnce();
    });

    it("keeps a verified WebGPU renderer and moves it onto the real canvas", async () => {
        const { device, probeContext } = installGPU("none");
        const canvas = realCanvas();
        await expect(execute(canvas as unknown as OffscreenCanvas, 1)).resolves.toBe("webgpu");
        expect(mocks.webgpu).toHaveBeenCalledWith(device, probeContext, "bgra8unorm", 1);
        expect(mocks.rebind).toHaveBeenCalledWith(canvas.realGpuContext);
        expect(mocks.webgl).not.toHaveBeenCalled();
        expect(device.destroy).not.toHaveBeenCalled();
    });

    it("falls back to WebGL2 when the real canvas refuses a webgpu context after verification", async () => {
        const { device } = installGPU("real-context-null");
        const canvas = realCanvas("real-context-null");
        await expect(execute(canvas as unknown as OffscreenCanvas, 1)).resolves.toBe("webgl2");
        expect(device.destroy).toHaveBeenCalled();
    });

    it("reports a canvas-bound failure when configuring the real canvas throws", async () => {
        installGPU("none");
        mocks.rebind.mockImplementationOnce(() => { throw new TypeError("configure failed on real canvas"); });
        const canvas = realCanvas();
        const error = await execute(canvas as unknown as OffscreenCanvas, 1).catch((e) => e);
        expect(error).toBeInstanceOf(RendererInitializeError);
        expect(error.canvasBound).toBe(true);
        expect(error.backend).toBe("webgpu");
        expect(canvas.getContext).not.toHaveBeenCalledWith("webgl2", expect.anything());
    });

    it("notifies the caller when the WebGPU device is lost after initialization", async () => {
        const { device } = installGPU("none");
        const onLost = vi.fn();
        await execute(realCanvas() as unknown as OffscreenCanvas, 1, "auto", onLost);
        device.loseNow({ "reason": "unknown", "message": "GPU reset" });
        await Promise.resolve(); await Promise.resolve();
        expect(onLost).toHaveBeenCalledWith({ "backend": "webgpu", "reason": "unknown", "message": "GPU reset" });
    });

    it("does not report its own intentional destroy as a loss when re-initialized", async () => {
        const { device } = installGPU("none");
        const onLost = vi.fn();
        await execute(realCanvas() as unknown as OffscreenCanvas, 1, "auto", onLost);
        await execute(realCanvas() as unknown as OffscreenCanvas, 1, "webgl2", onLost);
        await Promise.resolve(); await Promise.resolve();
        expect(device.destroy).toHaveBeenCalled();
        expect(onLost).not.toHaveBeenCalled();
    });

    it("skips WebGPU entirely when WebGL2 is requested (canvas re-creation path)", async () => {
        installGPU("none");
        const canvas = realCanvas();
        await expect(execute(canvas as unknown as OffscreenCanvas, 1, "webgl2")).resolves.toBe("webgl2");
        expect((navigator as unknown as { gpu: { requestAdapter: ReturnType<typeof vi.fn> } }).gpu.requestAdapter).not.toHaveBeenCalled();
        expect(canvas.addEventListener).not.toHaveBeenCalled();
    });

    it("re-applies a known renderer size to a re-created canvas", async () => {
        vi.stubGlobal("navigator", {});
        mocks.rendererWidth = 640; mocks.rendererHeight = 360;
        await execute(realCanvas() as unknown as OffscreenCanvas, 1, "webgl2");
        expect(mocks.setRendererSize).toHaveBeenCalledWith(640, 360);
        expect(mocks.resize).toHaveBeenCalledWith("webgl", 640, 360, true);
        expect(mocks.cacheReset).toHaveBeenCalled();
    });

    it("removes the replaced WebGL2 canvas listener and ignores a queued stale loss", async () => {
        vi.stubGlobal("navigator", {});
        const previous = { ...realCanvas(), removeEventListener: vi.fn() };
        const next = { ...realCanvas(), removeEventListener: vi.fn() };
        const oldLost = vi.fn();
        const newLost = vi.fn();
        await execute(previous as unknown as OffscreenCanvas, 1, "webgl2", oldLost);
        const oldHandler = previous.addEventListener.mock.calls[0][1] as (event: Event) => void;
        await execute(next as unknown as OffscreenCanvas, 1, "webgl2", newLost);
        expect(previous.removeEventListener).toHaveBeenCalledWith("webglcontextlost", oldHandler);
        oldHandler(new Event("webglcontextlost"));
        expect(oldLost).not.toHaveBeenCalled();
        const nextHandler = next.addEventListener.mock.calls[0][1] as (event: Event) => void;
        nextHandler(new Event("webglcontextlost"));
        expect(newLost).toHaveBeenCalledOnce();
    });

    it("watches WebGL2 context loss when a loss callback is provided", async () => {
        vi.stubGlobal("navigator", {});
        const canvas = realCanvas();
        const onLost = vi.fn();
        await execute(canvas as unknown as OffscreenCanvas, 1, "auto", onLost);
        expect(canvas.addEventListener).toHaveBeenCalledWith("webglcontextlost", expect.any(Function), { "once": true });
        const handler = canvas.addEventListener.mock.calls[0][1] as (event: { preventDefault: () => void }) => void;
        handler({ preventDefault: vi.fn() });
        expect(onLost).toHaveBeenCalledWith({ "backend": "webgl2", "reason": "webglcontextlost", "message": "" });
    });

    it("retries WebGL2 when context creation fails transiently right after a WebGPU loss", async () => {
        vi.useFakeTimers({ "toFake": ["setTimeout", "clearTimeout"] });
        try {
            vi.stubGlobal("navigator", {});
            const gl = {};
            let attempts = 0;
            const canvas = { width: 1, height: 1, addEventListener: vi.fn(),
                getContext: vi.fn((id: string) => id === "webgl2" && ++attempts >= 3 ? gl : null) };
            const pending = execute(canvas as unknown as OffscreenCanvas, 1);
            await vi.runAllTimersAsync();
            await expect(pending).resolves.toBe("webgl2");
            expect(attempts).toBe(3);
            expect(mocks.webgl).toHaveBeenCalledWith(gl, 4, 1);
        } finally {
            vi.useRealTimers();
        }
    });

    it("fails explicitly when neither graphics backend is available", async () => {
        vi.useFakeTimers({ "toFake": ["setTimeout", "clearTimeout"] });
        try {
            vi.stubGlobal("navigator", { gpu: { requestAdapter: vi.fn().mockResolvedValue(null) } });
            const canvas = { getContext: vi.fn(() => null), width: 1, height: 1 };
            const pending = execute(canvas as unknown as OffscreenCanvas, 1).catch((e) => e);
            await vi.runAllTimersAsync();
            const error = await pending;
            expect(error).toBeInstanceOf(RendererInitializeError);
            expect(error.message).toContain("webgl2 is not supported");
            expect(error.canvasBound).toBe(false);
            expect(canvas.getContext).toHaveBeenCalledTimes(6);
            expect(mocks.setContext).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });
});
