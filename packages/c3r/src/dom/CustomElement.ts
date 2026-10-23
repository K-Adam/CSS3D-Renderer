import { vec2 } from "gl-matrix";

import { CSSClass } from "../css/CSSClass.js";
import { Group } from "./Group.js";

export class CustomElement extends Group {
    readonly element: HTMLElement;

    elementScale: vec2 = vec2.fromValues(1, 1);
    elementCenter: vec2 = vec2.fromValues(0.5, 0.5);
    elementRotation = 0;

    static getContentClass: () => CSSClass = CSSClass.lazy({
        "background-color": "var(--background-color, transparent)",
        "background-image": "var(--background-image, white)",
        "background-size": "100% 100%",

        opacity: "var(--opacity, 1)",
    });

    constructor(element: HTMLElement) {
        super();

        this.element = element;
        this.domElement.appendChild(element);

        CustomElement.getContentClass().attach(this.element);

        this.updateElementTransform();
    }

    setSize(width: number, height: number): void {
        this.element.style.width = `${width}px`;
        this.element.style.height = `${height}px`;
    }

    setScale(scaleX: number, scaleY: number): void {
        this.elementScale = vec2.fromValues(scaleX, scaleY);
        this.updateElementTransform();
    }

    setCenter(centerX: number, centerY: number): void {
        this.elementCenter = vec2.fromValues(centerX, centerY);
        this.updateElementTransform();
    }

    updateElementTransform(): void {
        const [sx, sy] = this.elementScale;
        const [cx, cy] = this.elementCenter;

        let transform = `translate(-50%,-50%)scale(${sx},${-sy})`;
        transform += `translate(${(0.5 - cx) * 100}%,${(cy - 0.5) * 100}%)`;
        if (this.elementRotation !== 0) transform += `rotate(${this.elementRotation}rad)`;

        this.element.style.transform = transform;
    }

    enablePointer(): void {
        this.element.style.pointerEvents = "auto";
    }

    disablePointer(): void {
        this.element.style.pointerEvents = "";
    }
}
