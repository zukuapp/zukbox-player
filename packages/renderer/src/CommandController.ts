import type { IMessage } from "./interface/IMessage";
import {
    execute as commandInitializeContextService,
    RendererInitializeError
} from "./Command/service/CommandInitializeContextService";
import { execute as commandResizeService } from "./Command/service/CommandResizeService";
import { execute as commandRenderUseCase } from "./Command/usecase/CommandRenderUseCase";
import { execute as commandRemoveCacheService } from "./Command/service/CommandRemoveCacheService";
import { execute as commandCaptureUseCase } from "./Command/usecase/CommandCaptureUseCase";
import { $cacheStore } from "@next2d/cache";
import { $setRendererSize } from "./RendererUtil";

/**
 * @class
 */
export class CommandController
{
    /**
     * @description workerの実行状態
     *              Execution status of worker
     *
     * @type {string}
     * @default "deactivate"
     * @public
     */
    public state: string;

    /**
     * @description 受け取ったメッセージ配列
     *              Received message array
     *
     * @type {array}
     * @default []
     * @public
     */
    public queue: IMessage[];

    /**
     * @constructor
     * @public
     */
    /**
     * @description 描画コンテキストが使用可能か
     *              Whether a rendering context is ready
     *
     * @type {boolean}
     * @default false
     * @public
     */
    public rendererReady: boolean;

    // Loss callbacks belong to one initialized canvas, never to its replacement.
    private rendererGeneration: number;

    constructor ()
    {
        this.state = "deactivate";
        this.queue = [];
        this.rendererReady = false;
        this.rendererGeneration = 0;
    }

    /**
     * @description 処理を実行
     *              Execute process
     *
     * @return {Promise<void>}
     * @method
     * @public
     */
    async execute (): Promise<void>
    {
        this.state = "active";
        try {
            while (this.queue.length) {

                const object: IMessage | void = this.queue.shift();
                if (!object) {
                    continue;
                }

                try {
                    await this.executeCommand(object);
                } catch (error) {
                    this.reportFailure(object, error);
                }
            }
        } finally {
            // A failing command must never leave the worker permanently "active":
            // the message listener only restarts the loop from "deactivate".
            this.state = "deactivate";
        }
    }

    /**
     * @description 失敗したコマンドをメインスレッドへ通知し、転送済みバッファを返却する
     *              Report a failed command to the main thread and hand back transferred buffers
     *
     * @param  {IMessage} object
     * @param  {unknown} error
     * @return {void}
     * @method
     * @private
     */
    private reportFailure (object: IMessage, error: unknown): void
    {
        const message = error && typeof error === "object" && "message" in error
            ? String((error as { message: unknown }).message)
            : String(error);

        switch (object.command) {

            case "initialize":
                this.rendererGeneration++;
                this.rendererReady = false;
                globalThis.postMessage({
                    "message": "rendererInitFailed",
                    "error": message,
                    "backend": error instanceof RendererInitializeError ? error.backend : "unknown",
                    "canvasBound": error instanceof RendererInitializeError ? error.canvasBound : true
                });
                break;

            case "render":
                globalThis.postMessage({
                    "message": "render",
                    "buffer": object.buffer,
                    "error": message
                // @ts-ignore
                }, object.buffer && object.buffer.buffer.byteLength ? [object.buffer.buffer] : []);
                break;

            case "capture":
                globalThis.postMessage({
                    "message": "capture",
                    "buffer": object.buffer,
                    "imageBitmap": null,
                    "error": message
                // @ts-ignore
                }, object.buffer && object.buffer.buffer.byteLength ? [object.buffer.buffer] : []);
                break;

            default:
                globalThis.postMessage({
                    "message": "rendererCommandFailed",
                    "command": object.command,
                    "error": message
                });
                break;

        }
    }

    /**
     * @description コマンドを1件実行
     *              Execute a single command
     *
     * @param  {IMessage} object
     * @return {Promise<void>}
     * @method
     * @private
     */
    private async executeCommand (object: IMessage): Promise<void>
    {
        switch (object.command) {

            case "render":
                if (!this.rendererReady) {
                    throw new Error("renderer is not ready");
                }
                commandRenderUseCase(
                    object.buffer.subarray(0, object.length),
                    object.imageBitmaps as ImageBitmap[] | null
                );

                // 描画完了したらメインスレッドにbufferを返却する
                globalThis.postMessage({
                    "message": "render",
                    "buffer": object.buffer
                // @ts-ignore
                }, [object.buffer.buffer]);
                break;

            case "resize":
                if (!this.rendererReady) {
                    // No context yet (failed / re-creating): remember the size, the next
                    // successful initialize applies it to the new canvas.
                    $setRendererSize(
                        object.buffer[0] as number,
                        object.buffer[1] as number
                    );
                    break;
                }
                commandResizeService(
                    object.buffer[0] as number,
                    object.buffer[1] as number,
                    Boolean(object.buffer[2])
                );
                break;

            case "initialize":
                {
                    this.rendererReady = false;
                    const generation = ++this.rendererGeneration;
                    let lossReported = false;
                    const backend = await commandInitializeContextService(
                        object.canvas as OffscreenCanvas,
                        object.devicePixelRatio as number,
                        object.backend === "webgl2" ? "webgl2" : "auto",
                        (detail): void => {
                            if (generation !== this.rendererGeneration || lossReported) {
                                return ;
                            }
                            lossReported = true;
                            this.rendererReady = false;
                            globalThis.postMessage({
                                "message": "rendererLost",
                                "backend": detail.backend,
                                "reason": detail.reason,
                                "detail": detail.message
                            });
                        }
                    );
                    if (generation !== this.rendererGeneration || lossReported) {
                        return ;
                    }
                    this.rendererReady = true;
                    globalThis.postMessage({
                        "message": "rendererReady",
                        "backend": backend
                    });
                }
                break;

            case "removeCache":
                commandRemoveCacheService(object.buffer);
                break;

            case "cacheClear":
                $cacheStore.reset();
                break;

            case "capture":
                {
                    if (!this.rendererReady) {
                        throw new Error("renderer is not ready");
                    }
                    const imageBitmap = await commandCaptureUseCase(
                        object.buffer.subarray(0, object.length),
                        object.width as number,
                        object.height as number,
                        object.bgColor as number,
                        object.bgAlpha as number,
                        object.imageBitmaps as ImageBitmap[] | null
                    );

                    // 描画完了したらメインスレッドにbufferを返却する
                    globalThis.postMessage({
                        "message": "capture",
                        "buffer": object.buffer,
                        "imageBitmap": imageBitmap
                    // @ts-ignore
                    }, [object.buffer.buffer, imageBitmap]);
                }
                break;

            default:
                break;

        }
    }
}