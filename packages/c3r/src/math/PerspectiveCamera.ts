import { mat4 } from "gl-matrix";

export class PerspectiveCamera {
    fov: number;

    // Inverse world
    matrix: mat4 = mat4.create();

    constructor(fov = 70) {
        this.fov = fov;
    }

    get perspectiveCoefficient(): number {
        return 1.0 / Math.tan((this.fov * Math.PI) / 360);
    }
}
