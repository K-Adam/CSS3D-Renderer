import { mat4, type ReadonlyMat4 } from "gl-matrix";

import type { Material } from "../css/Material.js";
import { ensureStyles } from "../css/styles.js";
import { matrixText } from "../css/Transform.js";

// Keeps a Material, and its rule, alive while its element is
const elementMaterials = new WeakMap<Element, Material>();

const matrices = new WeakMap<Object3D, mat4>();

export const matrixOf = (obj: Object3D): ReadonlyMat4 => matrices.get(obj)!;

export abstract class Object3D {
  readonly domElement: HTMLDivElement = document.createElement("div");
  #material: Material | null = null;

  constructor() {
    ensureStyles();
    matrices.set(this, mat4.create());
  }

  protected setMatrix(matrix: ReadonlyMat4): void {
    const current = matrices.get(this)!;
    if (mat4.exactEquals(matrix, current)) return;
    mat4.copy(current, matrix);
    this.domElement.style.setProperty("--c3r-matrix", matrixText(matrix));
  }

  get material(): Material | null {
    return this.#material;
  }

  protected get materialElement(): HTMLElement {
    return this.domElement;
  }

  set material(material: Material | null) {
    if (material === this.#material) return;
    const element = this.materialElement;
    const { classList } = element;
    if (this.#material) classList.remove(this.#material.className);
    if (material) {
      classList.add(material.className);
      elementMaterials.set(element, material);
    } else {
      elementMaterials.delete(element);
    }
    this.#material = material;
  }
}
