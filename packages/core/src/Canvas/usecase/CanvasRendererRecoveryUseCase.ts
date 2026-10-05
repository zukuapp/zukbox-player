import { $player } from "../../Player";
import {
    $devicePixelRatio,
    $getCanvas,
    $setCanvas
} from "../../CoreUtil";
import { stage } from "@next2d/display";
import { $cacheStore } from "@next2d/cache";
import { execute as canvasInitializeService } from "../service/CanvasInitializeService";
import { execute as canvasBootOffscreenCanvasService } from "../service/CanvasBootOffscreenCanvasService";
import { execute as canvasRegisterEventUseCase } from "./CanvasRegisterEventUseCase";
import { execute as playerResizePostMessageService } from "../../Player/service/PlayerResizePostMessageService";

/**
 * @description 1ページあたりのcanvas再生成の上限(無限ループ防止)
 *              Maximum number of canvas re-creations per page (prevents recovery loops)
 *
 * @type {number}
 * @private
 */
const MAX_RECOVERIES: number = 2;

let $recoveries: number = 0;

/**
 * @description 現在の描画バックエンドの状態
 *              Current renderer state
 */
export interface IRendererStatus {
    state: "initializing" | "ready" | "recovering" | "failed";
    backend: "webgpu" | "webgl2" | null;
    recoveries: number;
    reason: string | null;
}

export const $rendererStatus: IRendererStatus = {
    "state": "initializing",
    "backend": null,
    "recoveries": 0,
    "reason": null
};

const notify = (): void =>
{
    if (typeof window === "undefined" || typeof CustomEvent !== "function") {
        return ;
    }
    window.dispatchEvent(new CustomEvent("next2d-renderer", {
        "detail": { ...$rendererStatus }
    }));
};

/**
 * @description WebGPUにバインド済み(または失われた)canvasを破棄し、新しいcanvasでWebGL2を初期化する
 *              Replace a canvas that is bound to a failed/lost backend and initialise WebGL2 on a fresh one
 *
 * @param  {string} reason
 * @return {boolean} 再生成を開始した場合true / true when a re-creation was started
 * @method
 * @public
 */
export const execute = (reason: string): boolean =>
{
    if ($recoveries >= MAX_RECOVERIES) {
        $rendererStatus.state  = "failed";
        $rendererStatus.reason = reason;
        notify();
        return false;
    }
    $recoveries++;

    const previous: HTMLCanvasElement = $getCanvas();
    const canvas: HTMLCanvasElement = document.createElement("canvas");
    canvasInitializeService(canvas, $devicePixelRatio);
    if (previous) {
        // keep the size/position styles applied by the resize logic
        canvas.style.cssText = previous.style.cssText;
        if (previous.parentNode) {
            previous.parentNode.replaceChild(canvas, previous);
        }
    }
    canvasRegisterEventUseCase(canvas);
    $setCanvas(canvas);

    // every GPU-side cache of the old renderer is gone
    $cacheStore.reset();

    $rendererStatus.state      = "recovering";
    $rendererStatus.backend    = null;
    $rendererStatus.recoveries = $recoveries;
    $rendererStatus.reason     = reason;
    notify();

    canvasBootOffscreenCanvasService(canvas, "webgl2");
    if ($player.rendererWidth && $player.rendererHeight) {
        playerResizePostMessageService(true);
    }
    stage.changed = true;
    return true;
};

/**
 * @description workerからの描画バックエンド通知を処理
 *              Handle renderer notifications from the worker
 *
 * @param  {MessageEvent} event
 * @return {void}
 * @method
 * @public
 */
export const handleRendererMessage = (event: MessageEvent): void =>
{
    const data = event.data;
    if (!data || typeof data.message !== "string") {
        return ;
    }

    switch (data.message) {

        case "rendererReady":
            $rendererStatus.state   = "ready";
            $rendererStatus.backend = data.backend;
            notify();
            break;

        case "rendererLost":
            // never retry WebGPU after a loss on the same page
            execute(`${data.backend} lost: ${data.reason}${data.detail ? ` (${data.detail})` : ""}`);
            break;

        case "rendererInitFailed":
            if (data.canvasBound) {
                execute(`${data.backend} initialization failed: ${data.error}`);
            } else {
                $rendererStatus.state  = "failed";
                $rendererStatus.reason = String(data.error);
                console.error("[next2d] no usable graphics backend:", data.error);
                notify();
            }
            break;

        default:
            break;

    }
};
