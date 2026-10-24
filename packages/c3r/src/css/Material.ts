import type { vec4 } from "gl-matrix";

export class Material {
    backgroundImageSrc: string | null = null;
    backgroundColor: vec4 | null = null; // rgba, 0-1
    opacity = 1.0;

    apply(elem: HTMLElement): void {
        const { style } = elem;

        if (this.backgroundImageSrc) {
            style.setProperty(
                "--background-image",
                `url("${this.backgroundImageSrc.replace(/["\\]/g, "\\$&")}")`,
            );
        } else {
            style.removeProperty("--background-image");
        }

        if (this.backgroundColor) {
            const [r, g, b, a] = this.backgroundColor;
            const rgb = [r, g, b].map((c) => Math.round(c * 255));
            style.setProperty("--background-color", `rgba(${rgb.join()},${a})`);
        } else {
            style.removeProperty("--background-color");
        }

        if (this.opacity === 1.0) {
            style.removeProperty("--opacity");
        } else {
            style.setProperty("--opacity", String(this.opacity));
        }
    }
}
