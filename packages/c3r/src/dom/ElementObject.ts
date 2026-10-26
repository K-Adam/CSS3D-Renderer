import { vec2, type ReadonlyVec2 } from "gl-matrix";

import { Group } from "./Group.js";

export class ElementObject extends Group {
  readonly element: HTMLElement;

  #scale: ReadonlyVec2 = [1, 1];
  #center: ReadonlyVec2 = [0.5, 0.5];
  #rotation = 0;

  constructor(element: HTMLElement) {
    super();

    this.element = element;
    this.domElement.appendChild(element);

    this.element.classList.add("c3r-element");

    this.#updateTransform();
  }

  protected override get materialElement(): HTMLElement {
    return this.element;
  }

  setSize(width: number, height: number): void {
    this.element.style.width = `${width}px`;
    this.element.style.height = `${height}px`;
  }

  get scale(): ReadonlyVec2 {
    return this.#scale;
  }

  set scale(scale: ReadonlyVec2) {
    if (vec2.exactEquals(scale, this.#scale)) return;
    this.#scale = vec2.clone(scale);
    this.#updateTransform();
  }

  get center(): ReadonlyVec2 {
    return this.#center;
  }

  set center(center: ReadonlyVec2) {
    if (vec2.exactEquals(center, this.#center)) return;
    this.#center = vec2.clone(center);
    this.#updateTransform();
  }

  get rotation(): number {
    return this.#rotation;
  }

  set rotation(rotation: number) {
    if (rotation === this.#rotation) return;
    this.#rotation = rotation;
    this.#updateTransform();
  }

  #updateTransform(): void {
    const [sx, sy] = this.#scale;
    const [cx, cy] = this.#center;

    let transform = `translate(-50%,-50%)scale(${sx},${-sy})`;
    transform += `translate(${(0.5 - cx) * 100}%,${(cy - 0.5) * 100}%)`;
    if (this.#rotation !== 0) transform += `rotate(${this.#rotation}rad)`;

    this.element.style.transform = transform;
  }
}
