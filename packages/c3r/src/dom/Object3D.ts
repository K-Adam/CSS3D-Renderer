import { mat4, type ReadonlyMat4 } from "gl-matrix";

import type { Material } from "../css/Material.js";
import { ensureStyles } from "../css/styles.js";

// Keeps a Material, and its rule, alive while its element is
const elementMaterials = new WeakMap<Element, Material>();

export abstract class Object3D {
  readonly domElement: HTMLDivElement = document.createElement("div");
  #matrix = mat4.create();
  #material: Material | null = null;

  constructor() {
    ensureStyles();
  }

  get matrix(): ReadonlyMat4 {
    return this.#matrix;
  }

  set matrix(matrix: ReadonlyMat4) {
    if (mat4.exactEquals(matrix, this.#matrix)) return;
    mat4.copy(this.#matrix, matrix);
    this.domElement.style.transform = `matrix3d(${[...matrix].join()})`;
  }

  get material(): Material | null {
    return this.#material;
  }

  set material(material: Material | null) {
    if (material === this.#material) return;
    const { classList } = this.domElement;
    if (this.#material) classList.remove(this.#material.className);
    if (material) {
      classList.add(material.className);
      elementMaterials.set(this.domElement, material);
    } else {
      elementMaterials.delete(this.domElement);
    }
    this.#material = material;
  }
}
