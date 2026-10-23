import { mat4 } from "gl-matrix";

import type { Material } from "../css/Material.js";

export abstract class Object3D {
    matrix: mat4 = mat4.create();
    readonly domElement: HTMLDivElement = document.createElement("div");
    material: Material | null = null;

    static readonly commonAttributes: Record<string, string> = {
        position: "absolute",
        display: "block",

        transform: "matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1)",
        "transform-origin": "0 0",

        "-webkit-user-select": "none",
        "user-select": "none",

        "backface-visibility": "inherit",
    };

    updateMatrix(): void {
        this.domElement.style.transform = `matrix3d(${[...this.matrix].join()})`;
    }

    clearMatrix(): void {
        this.matrix = mat4.create();
        this.domElement.style.transform = "";
    }

    updateMaterial(): void {
        this.material?.apply(this.domElement);
    }
}
