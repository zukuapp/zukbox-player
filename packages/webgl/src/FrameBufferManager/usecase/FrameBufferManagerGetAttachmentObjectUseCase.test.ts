import { execute } from "./FrameBufferManagerGetAttachmentObjectUseCase";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { $objectPool as attachmentPool } from "../../FrameBufferManager";
import { $objectPool as colorPool } from "../../ColorBufferObject";
import { $objectPool as stencilPool } from "../../StencilBufferObject";
import { $boundTextures, $setActiveTextureUnit, $texturePool } from "../../TextureManager";
import { $gl } from "../../WebGLUtil";

// vi.mock is hoisted: both cases must share one complete fixture, rather than
// asynchronously registering competing factories for the same module ID.
vi.mock("../../WebGLUtil.ts", async (importOriginal) =>
{
    const mod = await importOriginal<typeof import("../../WebGLUtil.ts")>();
    return {
        ...mod,
        "$samples": 4,
        "$gl": {
            "RENDERBUFFER": 0x8D41,
            "RGBA8": 0x8058,
            "STENCIL_INDEX8": 0x8D48,
            "createTexture": vi.fn(() => { return "createTexture" }),
            "activeTexture": vi.fn(() => { return "activeTexture" }),
            "bindTexture": vi.fn(() => { return "bindTexture" }),
            "texParameteri": vi.fn(() => { return "texParameteri" }),
            "texStorage2D": vi.fn(() => { return "texStorage2D" }),
            "createRenderbuffer": vi.fn(() => { return "createRenderbuffer" }),
            "bindRenderbuffer": vi.fn(() => { return "bindRenderbuffer" }),
            "renderbufferStorage": vi.fn(() => { return "renderbufferStorage" }),
            "renderbufferStorageMultisample": vi.fn(() => { return "renderbufferStorageMultisample" })
        }
    };
});

describe("FrameBufferManagerGetAttachmentObjectUseCase.js method test", () =>
{
    beforeEach(() =>
    {
        vi.clearAllMocks();
        attachmentPool.length = 0;
        colorPool.length = 0;
        stencilPool.length = 0;
        $texturePool.clear();
        $boundTextures.fill(null);
        $setActiveTextureUnit(-1);
    });

    it("test case1", () =>
    {
        const attachmentObject = execute(100, 100, false);
        expect(attachmentObject.width).toBe(100);
        expect(attachmentObject.height).toBe(100);
        expect(attachmentObject.clipLevel).toBe(0);
        expect(attachmentObject.msaa).toBe(false);
        expect(attachmentObject.mask).toBe(false);
        expect(attachmentObject.color).toBe(null);
        expect(attachmentObject.texture?.resource).toBe("createTexture");
        expect(attachmentObject.texture?.width).toBe(100);
        expect(attachmentObject.texture?.height).toBe(100);
        expect(attachmentObject.texture?.area).toBe(100 * 100);
        expect(attachmentObject.stencil?.resource).toBe("createRenderbuffer");
        expect(attachmentObject.stencil?.width).toBe(100);
        expect(attachmentObject.stencil?.height).toBe(100);
        expect(attachmentObject.stencil?.area).toBe(100 * 100);
        expect($gl.renderbufferStorageMultisample).not.toHaveBeenCalled();
        expect($gl.renderbufferStorage).toHaveBeenCalledExactlyOnceWith(
            $gl.RENDERBUFFER, $gl.STENCIL_INDEX8, 100, 100
        );
    });

    it("test case2", () =>
    {
        const attachmentObject = execute(100, 100, true);
        expect(attachmentObject.width).toBe(100);
        expect(attachmentObject.height).toBe(100);
        expect(attachmentObject.clipLevel).toBe(0);
        expect(attachmentObject.msaa).toBe(true);
        expect(attachmentObject.mask).toBe(false);
        expect(attachmentObject.color?.resource).toBe("createRenderbuffer");
        expect(attachmentObject.color?.width).toBe(256);
        expect(attachmentObject.color?.height).toBe(256);
        expect(attachmentObject.color?.area).toBe(256 * 256);
        expect(attachmentObject.texture).toBe(null);
        expect(attachmentObject.stencil?.resource).toBe("createRenderbuffer");
        expect(attachmentObject.stencil?.width).toBe(0);
        expect(attachmentObject.stencil?.height).toBe(0);
        expect(attachmentObject.stencil?.area).toBe(0);
        expect($gl.renderbufferStorage).not.toHaveBeenCalled();
        expect($gl.renderbufferStorageMultisample).toHaveBeenCalledTimes(2);
        expect($gl.renderbufferStorageMultisample).toHaveBeenNthCalledWith(
            1, $gl.RENDERBUFFER, 4, $gl.RGBA8, 256, 256
        );
        expect($gl.renderbufferStorageMultisample).toHaveBeenNthCalledWith(
            2, $gl.RENDERBUFFER, 4, $gl.STENCIL_INDEX8, 256, 256
        );
    });
});
