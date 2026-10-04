// This carrier exposes the existing fork; renderer and game logic stay upstream.
import { Next2D } from "@next2d/core";
export { Next2D };
export const next2d = new Next2D();
export default next2d;
