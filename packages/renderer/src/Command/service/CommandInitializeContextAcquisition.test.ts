import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ setCanvas: vi.fn(), setContext: vi.fn(), webgl: vi.fn() }));
vi.mock("../../RendererUtil", () => ({
    "$setCanvas": mocks.setCanvas, "$setContext": mocks.setContext, "$samples": 4,
    "$getRendererWidth": () => 0, "$getRendererHeight": () => 0, "$setRendererSize": vi.fn()
}));
vi.mock("@next2d/cache", () => ({ "$cacheStore": { "reset": vi.fn() } }));
vi.mock("@next2d/webgl", () => ({ "Context": class {
    constructor (...args: unknown[]) { mocks.webgl(...args); }
} }));
vi.mock("@next2d/webgpu", () => ({ "Context": class {} }));
import { execute } from "./CommandInitializeContextService";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const canvas = () => ({ width: 1, height: 1, getContext: vi.fn((id: string) => id === "webgl2" ? {} : null) });
const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((r, j) => { resolve = r; reject = j; });
    return { promise, resolve, reject };
};

describe("bounded renderer capability acquisition", () => {
    it("renders on WebGL2 when adapter discovery never settles and ignores a late adapter", async () => {
        vi.useFakeTimers();
        const request = deferred<{ requestDevice: ReturnType<typeof vi.fn> }>();
        const requestDevice = vi.fn();
        vi.stubGlobal("navigator", { gpu: { requestAdapter: () => request.promise } });
        const target = canvas();
        let backend: string | undefined;
        const pending = execute(target as unknown as OffscreenCanvas, 1).then((value) => { backend = value; });
        await vi.advanceTimersByTimeAsync(2100);
        expect(backend).toBe("webgl2");
        await pending;
        request.resolve({ requestDevice });
        await Promise.resolve(); await Promise.resolve();
        expect(requestDevice).not.toHaveBeenCalled();
        expect(target.getContext).not.toHaveBeenCalledWith("webgpu");
    });

    it("renders on WebGL2 when device creation never settles and destroys a late device", async () => {
        vi.useFakeTimers();
        const request = deferred<GPUDevice>();
        const device = { destroy: vi.fn() } as unknown as GPUDevice;
        vi.stubGlobal("navigator", { gpu: { requestAdapter: async () => ({ requestDevice: () => request.promise }) } });
        const target = canvas();
        let backend: string | undefined;
        const pending = execute(target as unknown as OffscreenCanvas, 1).then((value) => { backend = value; });
        await vi.advanceTimersByTimeAsync(2100);
        expect(backend).toBe("webgl2");
        await pending;
        request.resolve(device);
        await Promise.resolve(); await Promise.resolve();
        expect(device.destroy).toHaveBeenCalledExactlyOnceWith();
        expect(target.getContext).not.toHaveBeenCalledWith("webgpu");
    });

    it("observes a late device rejection after choosing WebGL2", async () => {
        vi.useFakeTimers();
        const request = deferred<GPUDevice>();
        vi.stubGlobal("navigator", { gpu: { requestAdapter: async () => ({ requestDevice: () => request.promise }) } });
        let backend: string | undefined;
        const pending = execute(canvas() as unknown as OffscreenCanvas, 1).then((value) => { backend = value; });
        await vi.advanceTimersByTimeAsync(2100);
        expect(backend).toBe("webgl2");
        await pending;
        request.reject(new Error("late device rejection"));
        await Promise.resolve(); await Promise.resolve();
        expect(mocks.webgl).toHaveBeenCalledOnce();
    });
});
