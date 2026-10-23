import { CSSClass } from "../css/CSSClass.js";
import { RootObject, type Camera } from "./RootObject.js";

import { PerspectiveCamera } from "../math/PerspectiveCamera.js";

export class Container {
    readonly domElement: HTMLDivElement = document.createElement("div");
    root: RootObject = new RootObject();

    width = 0;
    height = 0;

    static getClass: () => CSSClass = CSSClass.lazy({
        overflow: "hidden",

        position: "relative",

        "--viewport-width": "100vw",
        "--viewport-height": "100vh",

        width: "var(--viewport-width)",
        height: "var(--viewport-height)",
    });

    constructor() {
        Container.getClass().attach(this.domElement);

        this.domElement.appendChild(this.root.domElement);
        this.updateCamera();
    }

    get camera(): Camera {
        return this.root.camera;
    }

    set camera(camera: Camera) {
        this.root.camera = camera;
    }

    // Needs to be called on camera change and if the root was replaced
    updateCamera(): void {
        if (this.camera instanceof PerspectiveCamera) {
            this.domElement.style.perspective = `calc(${this.camera.perspectiveCoefficient} * var(--viewport-height) / 2)`;
        } else {
            this.domElement.style.removeProperty("perspective");
        }

        this.root.updateMatrix();
    }

    addRoot(root: RootObject): void {
        root.camera = this.camera;

        this.root.domElement.replaceWith(root.domElement);
        this.root = root;

        this.updateCamera();
    }

    setSize(width: number, height: number): void {
        if (this.width === width && this.height === height) {
            return;
        }

        this.width = width;
        this.height = height;

        this.domElement.style.setProperty("--viewport-width", `${width}px`);
        this.domElement.style.setProperty("--viewport-height", `${height}px`);
    }

    resetSize(): void {
        this.width = 0;
        this.height = 0;

        this.domElement.style.removeProperty("--viewport-width");
        this.domElement.style.removeProperty("--viewport-height");
    }
}
