import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
    canvas: null as HTMLCanvasElement | null,
    boot: vi.fn(), register: vi.fn(), resize: vi.fn(), cacheReset: vi.fn(),
    player: { "rendererWidth": 640, "rendererHeight": 360 },
    stage: { "changed": false }
}));
vi.mock("../../Player", () => ({ "$player": mocks.player }));
vi.mock("../../CoreUtil", () => ({
    "$devicePixelRatio": 1,
    "$getCanvas": () => mocks.canvas,
    "$setCanvas": (canvas: HTMLCanvasElement) => { mocks.canvas = canvas; }
}));
vi.mock("@next2d/display", () => ({ "stage": mocks.stage }));
vi.mock("@next2d/cache", () => ({ "$cacheStore": { "reset": mocks.cacheReset } }));
vi.mock("../service/CanvasBootOffscreenCanvasService", () => ({ "execute": mocks.boot }));
vi.mock("./CanvasRegisterEventUseCase", () => ({ "execute": mocks.register }));
vi.mock("../../Player/service/PlayerResizePostMessageService", () => ({ "execute": mocks.resize }));

const load = async () => {
    vi.resetModules();
    return await import("./CanvasRendererRecoveryUseCase");
};

beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "<div id=\"stage\"></div>";
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width: 640px; height: 360px;";
    document.getElementById("stage")!.appendChild(canvas);
    mocks.canvas = canvas;
    mocks.stage.changed = false;
});

describe("CanvasRendererRecoveryUseCase", () => {
    it("replaces a WebGPU-bound canvas and re-initializes WebGL2 on a fresh one when the device is lost", async () => {
        const { handleRendererMessage, $rendererStatus } = await load();
        const previous = mocks.canvas!;
        const events: unknown[] = [];
        window.addEventListener("next2d-renderer", (e) => events.push((e as CustomEvent).detail));

        handleRendererMessage({ "data": { "message": "rendererLost", "backend": "webgpu", "reason": "unknown", "detail": "GPU reset" } } as MessageEvent);

        const next = document.querySelector("#stage canvas") as HTMLCanvasElement;
        expect(next).not.toBe(previous);
        expect(previous.isConnected).toBe(false);
        expect(next.style.width).toBe("640px");
        expect(mocks.canvas).toBe(next);
        expect(mocks.register).toHaveBeenCalledWith(next);
        expect(mocks.boot).toHaveBeenCalledWith(next, "webgl2");
        expect(mocks.resize).toHaveBeenCalledWith(true);
        expect(mocks.cacheReset).toHaveBeenCalled();
        expect(mocks.stage.changed).toBe(true);
        expect($rendererStatus).toMatchObject({ "state": "recovering", "recoveries": 1 });
        expect(events.at(-1)).toMatchObject({ "state": "recovering", "reason": "webgpu lost: unknown (GPU reset)" });

        handleRendererMessage({ "data": { "message": "rendererReady", "backend": "webgl2" } } as MessageEvent);
        expect($rendererStatus).toMatchObject({ "state": "ready", "backend": "webgl2" });
    });

    it("re-creates the canvas only when the failed initialization already bound it", async () => {
        const { handleRendererMessage, $rendererStatus } = await load();
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        handleRendererMessage({ "data": { "message": "rendererInitFailed", "backend": "webgpu", "canvasBound": true, "error": "configure" } } as MessageEvent);
        expect(mocks.boot).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), "webgl2");

        mocks.boot.mockClear();
        handleRendererMessage({ "data": { "message": "rendererInitFailed", "backend": "webgl2", "canvasBound": false, "error": "webgl2 is not supported." } } as MessageEvent);
        expect(mocks.boot).not.toHaveBeenCalled();
        expect($rendererStatus).toMatchObject({ "state": "failed", "reason": "webgl2 is not supported." });
        errorSpy.mockRestore();
    });

    it("stops re-creating canvases after the recovery limit (no loops)", async () => {
        const { handleRendererMessage, $rendererStatus } = await load();
        for (let i = 0; i < 5; i++) {
            handleRendererMessage({ "data": { "message": "rendererLost", "backend": "webgl2", "reason": "webglcontextlost" } } as MessageEvent);
        }
        expect(mocks.boot).toHaveBeenCalledTimes(2);
        expect($rendererStatus.state).toBe("failed");
    });

    it("ignores unrelated worker messages", async () => {
        const { handleRendererMessage } = await load();
        handleRendererMessage({ "data": { "message": "render", "buffer": new Float32Array(1) } } as MessageEvent);
        handleRendererMessage({ "data": null } as MessageEvent);
        expect(mocks.boot).not.toHaveBeenCalled();
    });
});
