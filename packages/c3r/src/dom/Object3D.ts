import { mat4 } from "gl-matrix";

import type { Material } from "../css/Material.js";
import { ensureStyles } from "../css/styles.js";

export abstract class Object3D {
  matrix: mat4 = mat4.create();
  readonly domElement: HTMLDivElement = document.createElement("div");
  material: Material | null = null;

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
    this.material?.apply(this.domElement);
  }
}
