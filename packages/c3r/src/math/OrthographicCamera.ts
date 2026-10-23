import { mat4 } from "gl-matrix";

export class OrthographicCamera {
    left: number;
    right: number;
    top: number;
    bottom: number;

    // Inverse world
    matrix: mat4 = mat4.create();

    constructor(left: number, right: number, top: number, bottom: number) {
        this.left = left;
        this.right = right;
        this.top = top;
        this.bottom = bottom;
    }
}
