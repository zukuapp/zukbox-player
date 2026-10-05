import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
    initialize: vi.fn(), render: vi.fn(), resize: vi.fn(), capture: vi.fn(), setRendererSize: vi.fn(), posted: [] as unknown[][]
}));
vi.mock("./Command/service/CommandInitializeContextService", () => {
    class RendererInitializeError extends Error {
        constructor (message: string, public backend: string, public canvasBound: boolean) { super(message); }
    }
    return { "execute": mocks.initialize, RendererInitializeError };
});
vi.mock("./Command/service/CommandResizeService", () => ({ "execute": mocks.resize }));
vi.mock("./Command/usecase/CommandRenderUseCase", () => ({ "execute": mocks.render }));
vi.mock("./Command/service/CommandRemoveCacheService", () => ({ "execute": vi.fn() }));
vi.mock("./Command/usecase/CommandCaptureUseCase", () => ({ "execute": mocks.capture }));
vi.mock("@next2d/cache", () => ({ "$cacheStore": { "reset": vi.fn() } }));
vi.mock("./RendererUtil", () => ({ "$setRendererSize": mocks.setRendererSize }));
import { CommandController } from "./CommandController";
import { RendererInitializeError } from "./Command/service/CommandInitializeContextService";

const renderMessage = () => ({ "command": "render", "buffer": new Float32Array(8), "length": 4, "imageBitmaps": null });
const initMessage = (backend?: string) => ({ "command": "initialize", "canvas": {}, "devicePixelRatio": 1, backend });

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); mocks.posted.length = 0; });
const stubPost = () => vi.stubGlobal("postMessage", (...args: unknown[]) => { mocks.posted.push(args); });

describe("CommandController renderer failure handling", () => {
    it("does not stay active forever when initialization throws, and reports the failure", async () => {
        stubPost();
        mocks.initialize.mockRejectedValueOnce(new RendererInitializeError("webgpu canvas configuration failed", "webgpu", true));
        const controller = new CommandController();
        controller.queue.push(initMessage() as never, renderMessage() as never);
        await controller.execute();
        expect(controller.state).toBe("deactivate");
        expect(mocks.posted[0][0]).toMatchObject({ "message": "rendererInitFailed", "backend": "webgpu", "canvasBound": true });
        // the render that followed hands its transferred buffer back instead of being dropped
        expect(mocks.posted[1][0]).toMatchObject({ "message": "render", "error": "renderer is not ready" });
        expect(mocks.render).not.toHaveBeenCalled();
    });

    it("processes later messages after a failed initialization (no deadlock)", async () => {
        stubPost();
        mocks.initialize.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("webgl2");
        const controller = new CommandController();
        controller.queue.push(initMessage() as never);
        await controller.execute();
        controller.queue.push(initMessage("webgl2") as never, renderMessage() as never);
        await controller.execute();
        expect(mocks.initialize).toHaveBeenLastCalledWith({}, 1, "webgl2", expect.any(Function));
        expect(mocks.posted.map((p) => (p[0] as { message: string }).message))
            .toEqual(["rendererInitFailed", "rendererReady", "render"]);
        expect(mocks.render).toHaveBeenCalledOnce();
    });

    it("forwards a later backend loss to the main thread", async () => {
        stubPost();
        mocks.initialize.mockImplementationOnce(async (_c: unknown, _d: unknown, _b: unknown, onLost: (d: unknown) => void) => {
            setTimeout(() => onLost({ "backend": "webgpu", "reason": "unknown", "message": "reset" }), 0);
            return "webgpu";
        });
        const controller = new CommandController();
        controller.queue.push(initMessage() as never);
        await controller.execute();
        await new Promise((r) => setTimeout(r, 5));
        expect(mocks.posted.map((p) => p[0])).toEqual([
            { "message": "rendererReady", "backend": "webgpu" },
            { "message": "rendererLost", "backend": "webgpu", "reason": "unknown", "detail": "reset" }
        ]);
        expect(controller.rendererReady).toBe(false);
    });

    it("answers a failed capture instead of leaving the main thread waiting", async () => {
        stubPost();
        mocks.initialize.mockResolvedValueOnce("webgpu");
        mocks.capture.mockRejectedValueOnce(new Error("Device was lost before mapping was resolved."));
        const controller = new CommandController();
        controller.queue.push(initMessage() as never, {
            "command": "capture", "buffer": new Float32Array(4), "length": 2,
            "width": 1, "height": 1, "bgColor": 0, "bgAlpha": 0, "imageBitmaps": null
        } as never);
        await controller.execute();
        expect(mocks.posted[1][0]).toMatchObject({ "message": "capture", "imageBitmap": null });
        expect(controller.state).toBe("deactivate");
    });

    it("remembers a resize that arrives while no renderer is ready instead of failing it", async () => {
        stubPost();
        mocks.initialize.mockRejectedValueOnce(new RendererInitializeError("configure", "webgpu", true));
        const controller = new CommandController();
        controller.queue.push(initMessage() as never, { "command": "resize", "buffer": new Float32Array([640, 360, 1]) } as never);
        await controller.execute();
        expect(mocks.resize).not.toHaveBeenCalled();
        expect(mocks.setRendererSize).toHaveBeenCalledWith(640, 360);
        expect(mocks.posted.map((p) => (p[0] as { message: string }).message)).toEqual(["rendererInitFailed"]);
    });
});
