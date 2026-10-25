import { mat4 } from "gl-matrix";

import type { Material } from "../css/Material.js";
import { ensureStyles } from "../css/styles.js";

// Keeps a Material, and its rule, alive while its element is
const elementMaterials = new WeakMap<Element, Material>();

export abstract class Object3D {
  matrix: mat4 = mat4.create();
  readonly domElement: HTMLDivElement = document.createElement("div");
  material: Material | null = null;
  #appliedMaterial: Material | null = null;

  constructor() {
    ensureStyles();
  }

  updateMatrix(): void {
    this.domElement.style.transform = `matrix3d(${[...this.matrix].join()})`;
  }

  clearMatrix(): void {
    this.matrix = mat4.create();
    this.domElement.style.transform = "";
  }

  updateMaterial(): void {
    const { classList } = this.domElement;
    if (this.#appliedMaterial !== this.material) {
      if (this.#appliedMaterial)
        classList.remove(this.#appliedMaterial.className);
      if (this.material) {
        classList.add(this.material.className);
        elementMaterials.set(this.domElement, this.material);
      } else {
        elementMaterials.delete(this.domElement);
      }
      this.#appliedMaterial = this.material;
    }
    this.material?.update();
  }
}
