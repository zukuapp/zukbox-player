import { Context as WebGLContext } from "@next2d/webgl";
import { Context as WebGPUContext } from "@next2d/webgpu";
import { $cacheStore } from "@next2d/cache";
import {
    $setCanvas,
    $setContext,
    $samples,
    $getRendererWidth,
    $getRendererHeight,
    $setRendererSize
} from "../../RendererUtil";

/**
 * @description 開発時用のフラグ
 *              Flag for development use
 *
 * @type {boolean}
 * @private
 */
const useWebGPU: boolean = true;

/**
 * @description WebGPU検証の待機上限(ms)。超過は失敗ではなく「遅いが生存」として扱い、
 *              遅れて届いた失敗は初期化後の消失として通知する。
 *              Upper bound (ms) for each WebGPU verification wait. Exceeding it is treated as
 *              "slow but alive", not as a failure; a failure that arrives later is reported as
 *              a post-initialisation loss.
 *
 * @type {number}
 * @private
 */
const PROBE_TIMEOUT_MS: number = 2000;

const TIMEOUT: unique symbol = Symbol("timeout");

const withTimeout = <T> (promise: Promise<T>): Promise<T | typeof TIMEOUT> =>
{
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
        promise,
        new Promise<typeof TIMEOUT>((resolve): void => {
            timer = setTimeout((): void => resolve(TIMEOUT), PROBE_TIMEOUT_MS);
        })
    ]).finally((): void => clearTimeout(timer));
};

const nextTask = (): Promise<void> =>
{
    return new Promise<void>((resolve): void => { setTimeout(resolve, 0) });
};

/**
 * @description 描画バックエンドの指定
 *              Requested renderer backend
 */
export type RendererBackendRequest = "auto" | "webgl2";

/**
 * @description 初期化後に描画バックエンドが失われた時の通知
 *              Notification sent when an initialised backend is lost later
 */
export type RendererLostCallback = (detail: {
    backend: "webgpu" | "webgl2";
    reason: string;
    message: string;
}) => void;

/**
 * @description 初期化に失敗した時の例外。canvasBound が true の場合、
 *              このOffscreenCanvasは別のコンテキストを返せないため新しいcanvasが必要。
 *              Initialisation error. When canvasBound is true this OffscreenCanvas is already
 *              bound to another context type and a fresh canvas is required to recover.
 */
export class RendererInitializeError extends Error
{
    public readonly canvasBound: boolean;
    public readonly backend: "webgpu" | "webgl2";

    constructor (message: string, backend: "webgpu" | "webgl2", canvas_bound: boolean, cause?: unknown)
    {
        super(message);
        this.name = "RendererInitializeError";
        this.backend = backend;
        this.canvasBound = canvas_bound;
        if (cause !== undefined) {
            (this as { cause?: unknown }).cause = cause;
        }
    }
}

/**
 * @description 意図的に破棄したデバイス(lost通知を抑止する)
 *              Devices destroyed on purpose (their lost notification is suppressed)
 *
 * @type {WeakSet<GPUDevice>}
 * @private
 */
const $intentionallyDestroyed: WeakSet<GPUDevice> = new WeakSet();

/**
 * @description 現在使用中のデバイス
 *              Device currently in use
 *
 * @type {GPUDevice | null}
 * @private
 */
let $activeDevice: GPUDevice | null = null;

const destroyDevice = (device: GPUDevice | null): void =>
{
    if (!device) {
        return ;
    }
    $intentionallyDestroyed.add(device);
    try {
        device.destroy();
    } catch {
        // already lost
    }
};

const describe = (error: unknown): string =>
{
    if (error && typeof error === "object" && "message" in error) {
        return String((error as { message: unknown }).message);
    }
    return String(error);
};

/**
 * @description 検証済みWebGPUコンテキスト
 *              Verified WebGPU context
 */
interface IVerifiedWebGPU {
    context: WebGPUContext;
    device: GPUDevice;
    // resolves with an error message when a slow verification fails after binding
    lateFailure: Promise<string | null>;
}

/**
 * @description 本番canvasに触れずにWebGPUを検証し、検証済みのContextを返す。
 *              失敗時はnullを返し、本番canvasは未バインドのまま(WebGL2が使用可能)。
 *              Verify WebGPU without touching the real canvas and return a verified context.
 *              Returns null on failure; the real canvas stays unbound so WebGL2 remains usable.
 *
 * @param  {OffscreenCanvas} canvas
 * @param  {number} device_pixel_ratio
 * @return {Promise<IVerifiedWebGPU | null>}
 * @private
 */
const createVerifiedWebGPUContext = async (
    canvas: OffscreenCanvas,
    device_pixel_ratio: number
): Promise<IVerifiedWebGPU | null> => {

    const gpu = navigator.gpu as GPU;
    let device: GPUDevice | null = null;
    try {
        const adapter = await gpu.requestAdapter();
        if (!adapter) {
            return null;
        }
        device = await adapter.requestDevice();

        let lost = false;
        device.lost.then((): void => { lost = true }, (): void => { lost = true });

        const preferredFormat = gpu.getPreferredCanvasFormat();

        // Throwaway canvas: once getContext("webgpu") is called on the real canvas it can
        // never return a webgl2 context again, so every fallible step happens here first.
        const probe = new OffscreenCanvas(Math.max(1, canvas.width), Math.max(1, canvas.height));
        const probeContext = probe.getContext("webgpu") as GPUCanvasContext | null;
        if (!probeContext) {
            throw new Error("probe canvas has no webgpu context");
        }
        probeContext.configure({
            "device": device,
            "format": preferredFormat,
            "alphaMode": "premultiplied"
        });

        // 1) Presentation probe (cheap): some browsers only fail - and destroy the device -
        //    when the first swap-chain texture is allocated.
        const encoder = device.createCommandEncoder();
        encoder.beginRenderPass({
            "colorAttachments": [{
                "view": probeContext.getCurrentTexture().createView(),
                "clearValue": { "r": 0, "g": 0, "b": 0, "a": 0 },
                "loadOp": "clear",
                "storeOp": "store"
            }]
        }).end();
        device.queue.submit([encoder.finish()]);
        const frame = await withTimeout(Promise.race([
            device.queue.onSubmittedWorkDone().then((): string => "done"),
            device.lost.then((): string => "lost")
        ]));
        // the lost promise can settle a task after the submitted work completes
        await nextTask();
        if (frame === "lost" || lost) {
            throw new Error("webgpu device was lost by the first canvas frame");
        }

        // 2) Full renderer construction (configure + pipelines) against the probe canvas.
        device.pushErrorScope("out-of-memory");
        device.pushErrorScope("internal");
        device.pushErrorScope("validation");
        const context = new WebGPUContext(device, probeContext, preferredFormat, device_pixel_ratio);
        const scopes = Promise.all([
            device.popErrorScope(),
            device.popErrorScope(),
            device.popErrorScope()
        ]).then((errors): string | null => {
            const error = errors.find((value) => value !== null);
            return error ? `webgpu ${error.constructor.name}: ${error.message}` : null;
        });

        const scopeResult = await withTimeout(scopes);
        if (typeof scopeResult === "string") {
            throw new Error(scopeResult);
        }
        if (lost) {
            throw new Error("webgpu device was lost during renderer construction");
        }

        return {
            context,
            device,
            // a late rejection (device lost) is already reported through device.lost
            "lateFailure": scopeResult === TIMEOUT
                ? scopes.catch((): null => null)
                : Promise.resolve(null)
        };

    } catch (error) {
        destroyDevice(device);
        console.warn("[renderer] WebGPU unavailable, using WebGL2:", describe(error));
        return null;
    }
};

/**
 * @description WebGL2コンテキスト作成の再試行間隔(ms)。WebGPUデバイスが破棄された直後は
 *              GPUチャネルの再接続中でwebgl2の作成が一時的に失敗するため。
 *              Retry delays (ms) for WebGL2 context creation. Right after a WebGPU device is
 *              destroyed the GPU channel is being re-established and webgl2 creation can fail
 *              transiently; a failed getContext() leaves the canvas unbound, so retrying is safe.
 *
 * @type {number[]}
 * @private
 */
const WEBGL2_RETRY_DELAYS_MS: number[] = [50, 150, 300, 600, 1000];

const acquireWebGL2 = async (canvas: OffscreenCanvas): Promise<WebGL2RenderingContext | null> =>
{
    const attributes: WebGLContextAttributes = {
        "stencil": true,
        "premultipliedAlpha": true,
        "antialias": false,
        "depth": false
    };
    let gl = canvas.getContext("webgl2", attributes) as WebGL2RenderingContext | null;
    for (let idx = 0; !gl && idx < WEBGL2_RETRY_DELAYS_MS.length; ++idx) {
        await new Promise<void>((resolve): void => {
            setTimeout(resolve, WEBGL2_RETRY_DELAYS_MS[idx]);
        });
        gl = canvas.getContext("webgl2", attributes) as WebGL2RenderingContext | null;
    }
    return gl;
};

/**
 * @description 既にレンダラーサイズが決まっている場合(再初期化時)、新しいcanvasへ反映する
 *              When the renderer size is already known (re-initialisation), apply it to the new canvas
 *
 * @return {void}
 * @private
 */
const restoreRendererSize = (context: WebGLContext | WebGPUContext): void =>
{
    const width  = $getRendererWidth();
    const height = $getRendererHeight();
    if (!width || !height) {
        return ;
    }
    $setRendererSize(width, height);
    context.resize(width, height, true);
    $cacheStore.reset();
};

/**
 * @description OffscreenCanvasからWebGL2またはWebGPUのコンテキストを取得
 *              Get WebGL2 or WebGPU context from OffscreenCanvas
 *
 * @param  {OffscreenCanvas} canvas
 * @param  {number} device_pixel_ratio
 * @param  {RendererBackendRequest} [backend="auto"]
 * @param  {RendererLostCallback} [on_lost]
 * @return {Promise<"webgpu" | "webgl2">}
 * @method
 * @public
 */
export const execute = async (
    canvas: OffscreenCanvas,
    device_pixel_ratio: number,
    backend: RendererBackendRequest = "auto",
    on_lost?: RendererLostCallback
): Promise<"webgpu" | "webgl2"> => {

    // Release the device of a previous (lost or replaced) renderer.
    destroyDevice($activeDevice);
    $activeDevice = null;

    // Set OffscreenCanvas
    $setCanvas(canvas);

    if (useWebGPU && backend === "auto" && "gpu" in navigator) {
        const verified = await createVerifiedWebGPUContext(canvas, device_pixel_ratio);
        if (verified) {
            const { context, device } = verified;
            // Point of no return: the real canvas is bound to WebGPU from here on.
            const canvasContext = canvas.getContext("webgpu") as GPUCanvasContext | null;
            if (!canvasContext) {
                destroyDevice(device);
            } else {
                try {
                    context.rebindCanvasContext(canvasContext);
                } catch (error) {
                    destroyDevice(device);
                    throw new RendererInitializeError(
                        `webgpu canvas configuration failed: ${describe(error)}`,
                        "webgpu", true, error
                    );
                }

                $activeDevice = device;
                device.lost.then((info: GPUDeviceLostInfo): void => {
                    if ($intentionallyDestroyed.has(device) || !on_lost) {
                        return ;
                    }
                    on_lost({ "backend": "webgpu", "reason": String(info.reason), "message": String(info.message) });
                });
                verified.lateFailure.then((message: string | null): void => {
                    if (!message || $intentionallyDestroyed.has(device) || !on_lost) {
                        return ;
                    }
                    on_lost({ "backend": "webgpu", "reason": "validation", "message": message });
                });
                $setContext(context);
                restoreRendererSize(context);
                return "webgpu";
            }
        }
    }

    {
        const gl: WebGL2RenderingContext | null = await acquireWebGL2(canvas);

        if (!gl) {
            throw new RendererInitializeError("webgl2 is not supported.", "webgl2", false);
        }

        if (on_lost && typeof canvas.addEventListener === "function") {
            canvas.addEventListener("webglcontextlost", (event: Event): void => {
                event.preventDefault();
                on_lost({ "backend": "webgl2", "reason": "webglcontextlost", "message": "" });
            }, { "once": true });
        }

        // Set CanvasToWebGLContext
        const context = new WebGLContext(gl, $samples, device_pixel_ratio);
        $setContext(context);
        restoreRendererSize(context);
        return "webgl2";
    }
};
