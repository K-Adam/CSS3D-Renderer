import { expect, it } from "vitest";
import { mat4 } from "gl-matrix";
import {
    BoxGeometry,
    Group,
    Mesh,
    MeshBasicMaterial,
    PerspectiveCamera,
    Scene,
    Sprite,
    SpriteMaterial,
    Vector3,
} from "three";
import { C3RRenderer } from "../src/C3RRenderer.js";

const setup = () => {
    const renderer = new C3RRenderer();
    renderer.setSize(800, 600);
    const scene = new Scene();
    const camera = new PerspectiveCamera(70, 800 / 600, 1, 1000);
    camera.position.set(5, 5, 20);
    camera.lookAt(0, 0, 0);
    // renderer.domElement > container > root > the scene's children
    const root = () => renderer.domElement.firstElementChild!.firstElementChild!;
    return { renderer, scene, camera, root };
};

const cssMatrix = (element: Element) => {
    const match = /matrix3d\(([^)]*)\)/.exec((element as HTMLElement).style.transform);
    return mat4.clone(match![1].split(",").map(Number) as unknown as mat4);
};

it("places a nested sprite at its world position, facing the camera", () => {
    const { renderer, scene, camera, root } = setup();

    const group = new Group();
    group.position.set(10, 0, 0);
    group.rotation.y = Math.PI / 3;
    group.scale.setScalar(2);
    scene.add(group);

    const sprite = new Sprite(new SpriteMaterial());
    sprite.position.set(1, 2, 0);
    sprite.scale.set(1.5, 0.5, 1);
    group.add(sprite);

    renderer.render(scene, camera);

    const groupNode = root().firstElementChild!;
    const spriteNode = groupNode.firstElementChild!;
    const world = mat4.mul(mat4.create(), cssMatrix(groupNode), cssMatrix(spriteNode));

    const position = sprite.getWorldPosition(new Vector3());
    expect(world[12]).toBeCloseTo(position.x, 6);
    expect(world[13]).toBeCloseTo(position.y, 6);
    expect(world[14]).toBeCloseTo(position.z, 6);

    const scale = sprite.getWorldScale(new Vector3());
    const cam = camera.matrixWorld.elements;
    [scale.x, scale.y].forEach((s, i) => {
        const column = [world[i * 4], world[i * 4 + 1], world[i * 4 + 2]];
        expect(Math.hypot(...column)).toBeCloseTo(s, 6);
        column.forEach((c, j) => expect(c / s).toBeCloseTo(cam[i * 4 + j], 6));
    });
});

it("follows visibility, geometry updates and removal", () => {
    const { renderer, scene, camera, root } = setup();

    const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
    scene.add(mesh);

    const polygons = () =>
        [...renderer.domElement.querySelectorAll("div")].filter((d) =>
            d.style.getPropertyValue("--width"),
        );

    renderer.render(scene, camera);
    const meshNode = root().firstElementChild as HTMLElement;
    const before = polygons();
    expect(before).toHaveLength(6);

    mesh.visible = false;
    renderer.render(scene, camera);
    expect(meshNode.style.display).toBe("none");

    mesh.visible = true;
    renderer.render(scene, camera);
    expect(meshNode.style.display).toBe("");

    const { position } = mesh.geometry.attributes;
    position.setX(0, 3);
    position.needsUpdate = true;
    renderer.render(scene, camera);
    expect(before.some((d) => d.isConnected)).toBe(false);
    expect(polygons().length).toBeGreaterThanOrEqual(6);

    scene.remove(mesh);
    renderer.render(scene, camera);
    expect(meshNode.isConnected).toBe(false);
    expect(polygons()).toHaveLength(0);
});
