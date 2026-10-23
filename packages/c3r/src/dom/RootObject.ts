import { CSSClass } from "../css/CSSClass.js";
import { Group } from "./Group.js";

import { PerspectiveCamera } from "../math/PerspectiveCamera.js";
import type { OrthographicCamera } from "../math/OrthographicCamera.js";

export type Camera = PerspectiveCamera | OrthographicCamera;

export class RootObject extends Group {
    camera: Camera = new PerspectiveCamera();

    static override getClass: () => CSSClass = CSSClass.lazy({
        width: "100% !important",
        height: "100% !important",

        top: "50%",
        left: "50%",

        // Click through
        "pointer-events": "none",

        "backface-visibility": "hidden !important",
    });

    constructor() {
        super();

        RootObject.getClass().attach(this.domElement);
    }

    // The view transform: camera projection, then the root's own matrix
    override updateMatrix(): void {
        const { camera } = this;
        const view = `scaleY(-1)matrix3d(${[...camera.matrix].join()})matrix3d(${[...this.matrix].join()})`;

        if (camera instanceof PerspectiveCamera) {
            const shift = `calc(${camera.perspectiveCoefficient} * var(--viewport-height) / 2)`;
            this.domElement.style.transform = `translateZ(${shift})${view}`;
        } else {
            const xsize = camera.right - camera.left;
            const ysize = camera.top - camera.bottom;

            const xcenter = (camera.right + camera.left) / 2;
            const ycenter = (camera.top + camera.bottom) / 2;

            const parent = this.domElement.parentElement;
            const width = parent?.offsetWidth ?? 0;
            const height = parent?.offsetHeight ?? 0;

            this.domElement.style.transform =
                `scale(${width / xsize},${height / ysize})` +
                `translate(${-xcenter}px,${-ycenter}px)${view}`;
        }
    }
}
