/**
 * @author Adam Kecskes <kecskes.adam@outlook.com>
 */

import { Matrix4, SRGBColorSpace } from "three";
import * as C3R from "c3r";
import { mat4, vec2, vec3, vec4 } from "gl-matrix";

export { CSS3DObject, CSS3DSprite } from "three/addons/renderers/CSS3DRenderer.js";

const DEFAULT_CENTER = { x: 0.5, y: 0.5 };
const _matrix = new Matrix4();
const _rotation = new Matrix4();
const _rgb = { r: 0, g: 0, b: 0 };

export class C3RRenderer {
    domElement = document.createElement("div");

    #width = 0;
    #height = 0;
    #containers = new Map(); // Scene -> C3R.Container, so multiple scenes can overlap
    #children = new WeakMap(); // C3R node -> Map<Object3D, C3R node>
    #meshes = new WeakMap(); // C3R node -> { key, groups }

    getSize() {
        return { width: this.#width, height: this.#height };
    }

    setSize(width, height) {
        this.#width = width;
        this.#height = height;

        this.domElement.style.width = width + "px";
        this.domElement.style.height = height + "px";

        for (const container of this.#containers.values()) {
            container.setSize(width, height);
        }
    }

    render(scene, camera) {
        let container = this.#containers.get(scene);
        if (!container) {
            container = new C3R.Container();
            container.domElement.style.position = "absolute";
            container.setSize(this.#width, this.#height);
            this.domElement.appendChild(container.domElement);
            this.#containers.set(scene, container);
        }

        if (scene.matrixWorldAutoUpdate) scene.updateMatrixWorld();
        if (camera.parent === null && camera.matrixWorldAutoUpdate) camera.updateMatrixWorld();

        this.#syncCamera(container, camera);
        this.#syncObject(scene, container.root, container);
    }

    #syncCamera(container, camera) {
        let changed = false;

        if (camera.isPerspectiveCamera) {
            if (!(container.camera instanceof C3R.PerspectiveCamera)) {
                container.camera = new C3R.PerspectiveCamera(camera.fov);
                changed = true;
            } else if (container.camera.fov !== camera.fov) {
                container.camera.fov = camera.fov;
                changed = true;
            }
        } else if (camera.isOrthographicCamera) {
            const c = container.camera;
            if (!(c instanceof C3R.OrthographicCamera)) {
                container.camera = new C3R.OrthographicCamera(
                    camera.left,
                    camera.right,
                    camera.top,
                    camera.bottom,
                );
                changed = true;
            } else if (
                c.left !== camera.left ||
                c.right !== camera.right ||
                c.top !== camera.top ||
                c.bottom !== camera.bottom
            ) {
                Object.assign(c, {
                    left: camera.left,
                    right: camera.right,
                    top: camera.top,
                    bottom: camera.bottom,
                });
                changed = true;
            }
        }

        if (!mat4.equals(container.camera.matrix, camera.matrixWorldInverse.elements)) {
            mat4.copy(container.camera.matrix, camera.matrixWorldInverse.elements);
            changed = true;
        }

        if (changed) container.updateCamera();
    }

    #syncObject(object, node, container) {
        const isSprite = object.isSprite || object.isCSS3DSprite;
        const matrix = isSprite
            ? this.#spriteMatrix(object, node, container)
            : object.matrix.elements;

        if (!mat4.equals(node.matrix, matrix)) {
            mat4.copy(node.matrix, matrix);
            node.updateMatrix();
        }

        this.#syncChildren(object, node, container);

        if (isSprite) {
            const rotation = object.isSprite ? object.material.rotation : object.rotation2D;
            if (rotation !== node.elementRotation) {
                node.elementRotation = rotation;
                node.updateElementTransform();
            }
        }

        if (object.isSprite) this.#syncMaterial(object.material, node);
        if (object.isMesh) this.#syncMesh(object, node);
    }

    #spriteMatrix(object, node, container) {
        _matrix.fromArray(container.camera.matrix).transpose();
        _matrix.copyPosition(object.matrixWorld);
        _matrix.multiply(_rotation.extractRotation(object.matrixWorld).transpose());
        _matrix.scale(object.scale);

        const e = _matrix.elements;
        e[3] = e[7] = e[11] = 0;
        e[15] = 1;

        const center = object.center ?? DEFAULT_CENTER;
        if (!vec2.equals([center.x, center.y], node.elementCenter)) {
            node.setCenter(center.x, center.y);
        }

        return e;
    }

    #syncChildren(object, node, container) {
        const previous = this.#children.get(node) ?? new Map();
        const current = new Map();

        for (const child of object.children) {
            let childNode = previous.get(child);
            if (!childNode) {
                childNode = createNode(child);
                node.addChild(childNode);
            }
            current.set(child, childNode);
        }

        for (const [child, childNode] of previous) {
            if (!current.has(child)) node.removeChild(childNode);
        }

        this.#children.set(node, current);

        for (const [child, childNode] of current) {
            this.#syncObject(child, childNode, container);
        }
    }

    #syncMesh(mesh, node) {
        const geometry = mesh.geometry;
        const { index, attributes, drawRange } = geometry;
        const { position, uv } = attributes;
        const total = index ? index.count : position.count;

        const groups = (geometry.groups.length ? geometry.groups : [drawRange]).map((g) => ({
            start: g.start,
            count: Math.min(g.count, total - g.start),
            materialIndex: g.materialIndex ?? 0,
        }));

        const key = [geometry, index, index?.version, position, position.version, uv, uv?.version];
        for (const g of groups) key.push(g.start, g.count);

        let state = this.#meshes.get(node);
        if (!state || state.key.length !== key.length || key.some((v, i) => v !== state.key[i])) {
            state?.groups.forEach((group) => node.removeChild(group));
            state = { key, groups: groups.map((g) => buildGroup(geometry, g)) };
            state.groups.forEach((group) => node.addChild(group));
            this.#meshes.set(node, state);
        }

        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        groups.forEach((g, i) => {
            this.#syncMaterial(materials[g.materialIndex % materials.length], state.groups[i]);
        });
    }

    #syncMaterial(material, node) {
        if (!node.material || node.material.threejs_id !== material.id) {
            node.material = new C3R.Material();
            node.material.threejs_id = material.id;
        }

        const target = node.material;
        let changed = false;

        const map = material.map;
        const image = map?.image;
        let src = null;
        if (image instanceof HTMLImageElement) {
            src = image.src;
        } else if (image instanceof HTMLCanvasElement) {
            const cached = target.threejs_map === map && target.threejs_version === map.version;
            src = cached ? target.backgroundImageSrc : image.toDataURL();
            target.threejs_map = map;
            target.threejs_version = map.version;
        }
        if (target.backgroundImageSrc !== src) {
            target.backgroundImageSrc = src;
            changed = true;
        }

        let color = null;
        if (material.color) {
            material.color.getRGB(_rgb, SRGBColorSpace);
            color = vec4.fromValues(_rgb.r, _rgb.g, _rgb.b, 1);
        }
        if (
            color === null
                ? target.backgroundColor !== null
                : !target.backgroundColor || !vec4.equals(color, target.backgroundColor)
        ) {
            target.backgroundColor = color;
            changed = true;
        }

        if (target.opacity !== material.opacity) {
            target.opacity = material.opacity;
            changed = true;
        }

        if (changed) node.updateMaterial();

        if (node.uvRepeat) {
            const repeat = map ? [map.repeat.x, map.repeat.y] : [1, 1];
            const offset = map ? [map.offset.x, map.offset.y] : [0, 0];

            if (!vec2.equals(node.uvRepeat, repeat) || !vec2.equals(node.uvOffset, offset)) {
                node.uvRepeat = repeat;
                node.uvOffset = offset;

                for (const child of node.children) {
                    if (!(child instanceof C3R.Polygon)) continue;
                    child.uv_scale = repeat;
                    child.uv_offset = offset;
                    child.updateContent();
                }
            }
        }
    }
}

function createNode(object) {
    if (object.isCSS3DObject) {
        const node = new C3R.CustomElement(object.element);
        node.domElement.style.backfaceVisibility = "visible";
        return node;
    }

    if (object.isSprite) {
        const element = document.createElement("div");
        element.style.backgroundBlendMode = "multiply";
        element.style.maskImage = "var(--background-image, none)";
        element.style.webkitMaskImage = "var(--background-image, none)";

        const node = new C3R.CustomElement(element);
        node.setSize(128, 128);
        node.setScale(1 / 128, 1 / 128);
        return node;
    }

    return new C3R.Group();
}

function buildGroup(geometry, { start, count }) {
    const { index } = geometry;
    const { position, uv } = geometry.attributes;

    const group = new C3R.Group();
    group.uvRepeat = [1, 1];
    group.uvOffset = [0, 0];

    const vertex = (i) => {
        if (index) i = index.getX(i);
        return new C3R.Vertex(
            vec3.fromValues(position.getX(i), position.getY(i), position.getZ(i)),
            uv ? vec2.fromValues(uv.getX(i), uv.getY(i)) : vec2.create(),
        );
    };

    // pushPolygon merges coplanar neighbours, e.g. two triangles into a quad
    for (let i = start; i + 2 < start + count; i += 3) {
        group.pushPolygon([vertex(i), vertex(i + 1), vertex(i + 2)]);
    }
    group.flushPolygons();

    return group;
}
