import { $devicePixelRatio, $setCanvas } from "./CoreUtil";
import { execute as canvasInitializeService } from "./Canvas/service/CanvasInitializeService";
import { execute as canvasBootOffscreenCanvasService } from "./Canvas/service/CanvasBootOffscreenCanvasService";
import { execute as canvasRegisterEventUseCase } from "./Canvas/usecase/CanvasRegisterEventUseCase";
import { handleRendererMessage } from "./Canvas/usecase/CanvasRendererRecoveryUseCase";
import { $rendererWorker } from "./RendererWorker";

/**
 * @type {HTMLCanvasElement}
 * @public
 */
export const $canvas: HTMLCanvasElement = document.createElement("canvas");
$setCanvas($canvas);

// initial invoking function
canvasInitializeService($canvas, $devicePixelRatio);

// Register an event
canvasRegisterEventUseCase($canvas);

// Renderer readiness / loss notifications (WebGPU -> WebGL2 recovery)
$rendererWorker.addEventListener("message", handleRendererMessage);

// Boot offscreen canvas
canvasBootOffscreenCanvasService($canvas);