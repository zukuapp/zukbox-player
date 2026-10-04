import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
    setCanvas: vi.fn(), setContext: vi.fn(),
    webgl: vi.fn(), webgpu: vi.fn()
}));
vi.mock("../../RendererUtil", () => ({
    "$setCanvas": mocks.setCanvas, "$setContext": mocks.setContext, "$samples": 4
}));
vi.mock("@next2d/webgl", () => ({ "Context": class {
    constructor (...args: unknown[]) { mocks.webgl(...args); }
} }));
vi.mock("@next2d/webgpu", () => ({ "Context": class {
    constructor (...args: unknown[]) { mocks.webgpu(...args); }
} }));
import { execute } from "./CommandInitializeContextService";
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
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
            const gl = {};
            const canvas = { getContext: vi.fn((id: string) => id === "webgl2" ? gl : null) };
            await execute(canvas as unknown as OffscreenCanvas, 2);
            expect(canvas.getContext).toHaveBeenCalledWith("webgl2", expect.any(Object));
            expect(mocks.webgl).toHaveBeenCalledWith(gl, 4, 2);
            expect(mocks.webgpu).not.toHaveBeenCalled();
        });
    }
    it("keeps an available WebGPU renderer", async () => {
        const device = { destroy: vi.fn() }, context = {};
        vi.stubGlobal("navigator", { gpu: {
            requestAdapter: vi.fn().mockResolvedValue({ requestDevice: vi.fn().mockResolvedValue(device) }),
            getPreferredCanvasFormat: () => "bgra8unorm"
        } });
        const canvas = { getContext: vi.fn(() => context) };
        await execute(canvas as unknown as OffscreenCanvas, 1);
        expect(mocks.webgpu).toHaveBeenCalledWith(device, context, "bgra8unorm", 1);
        expect(mocks.webgl).not.toHaveBeenCalled();
        expect(device.destroy).not.toHaveBeenCalled();
    });
    it("releases an unused WebGPU device before WebGL2 fallback", async () => {
        const device = { destroy: vi.fn() }, gl = {};
        vi.stubGlobal("navigator", { gpu: {
            requestAdapter: vi.fn().mockResolvedValue({ requestDevice: vi.fn().mockResolvedValue(device) })
        } });
        const canvas = { getContext: vi.fn((id: string) => id === "webgl2" ? gl : null) };
        await execute(canvas as unknown as OffscreenCanvas, 1);
        expect(device.destroy).toHaveBeenCalledOnce();
        expect(mocks.webgl).toHaveBeenCalledWith(gl, 4, 1);
    });
    it("fails explicitly when neither graphics backend is available", async () => {
        vi.stubGlobal("navigator", { gpu: { requestAdapter: vi.fn().mockResolvedValue(null) } });
        const canvas = { getContext: vi.fn(() => null) };
        await expect(execute(canvas as unknown as OffscreenCanvas, 1)).rejects.toThrow("webgl2 is not supported");
        expect(mocks.setContext).not.toHaveBeenCalled();
    });
});
