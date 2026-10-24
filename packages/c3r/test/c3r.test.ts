import { describe, expect, it } from "vitest";
import { mat4, vec2, vec3, vec4 } from "gl-matrix";
import { Group, Polygon, Vertex } from "c3r";

const vertex = (x: number, y: number, z: number, u = 0, v = 0) =>
  new Vertex(vec3.fromValues(x, y, z), vec2.fromValues(u, v));

// Newell's method
const polygonNormal = (points: vec3[]) => {
  const n = vec3.create();
  points.forEach((p, i) =>
    vec3.add(
      n,
      n,
      vec3.cross(vec3.create(), p, points[(i + 1) % points.length]),
    ),
  );
  return vec3.normalize(n, n);
};

describe("Polygon", () => {
  const tilt = mat4.fromRotation(mat4.create(), 0.7, [1, 2, 3]);
  const tilted = (points: number[][]) =>
    points.map(([x, y, z]) => {
      const p = vec3.transformMat4(vec3.create(), [x, y, z], tilt);
      return vertex(p[0], p[1], p[2]);
    });

  // prettier-ignore
  it.each([
        ["scalene triangle", tilted([[0, 0, 0], [7, 1, 0], [2, 5, 0]])],
        ["convex quad", tilted([[0, 0, 0], [4, 0, 0], [5, 3, 0], [-1, 2, 0]])],
        ["concave quad, reflex at v1", tilted([[0, 0, 0], [1, 0, 0], [3, -1, 0], [0, 1, 0]])],
    ])("places the element on the vertices of a %s, front side out", (_, vertices) => {
        const poly = new Polygon(vertices);
        poly.updateMatrix();

        const M = poly.matrix;
        const MI = mat4.invert(mat4.create(), M)!;
        const width = parseFloat(poly.domElement.style.getPropertyValue("--width"));
        const height = parseFloat(poly.domElement.style.getPropertyValue("--height"));

        for (const v of vertices) {
            const [x, y, z] = vec3.transformMat4(vec3.create(), v.position, MI);
            expect(Math.abs(z)).toBeLessThan(1e-6);
            expect(x).toBeGreaterThanOrEqual(-1e-6);
            expect(x).toBeLessThanOrEqual(width + 1e-6);
            expect(y).toBeGreaterThanOrEqual(-1e-6);
            expect(y).toBeLessThanOrEqual(height + 1e-6);
        }

        // No shear
        const col = (i: number) => vec3.fromValues(M[i * 4], M[i * 4 + 1], M[i * 4 + 2]);
        const len = vec3.len(col(0));
        expect(vec3.dot(col(0), col(1)) / len ** 2).toBeCloseTo(0, 5);
        expect(vec3.len(col(1)) / len).toBeCloseTo(1, 5);

        // Front side out
        const [fx, fy, fz] = vec4.transformMat4(vec4.create(), [0, 0, 1, 0], M);
        const front = vec3.normalize(vec3.create(), [fx, fy, fz]);
        const normal = polygonNormal(vertices.map((v) => v.position));
        expect(vec3.dot(front, normal)).toBeGreaterThan(0.999);
    });

  it("falls back to the plain color for collinear uvs", () => {
    const poly = new Polygon([
      vertex(0, 0, 0, 0, 0),
      vertex(1, 0, 0, 0.5, 0.5),
      vertex(0, 1, 0, 1, 1),
    ]);
    poly.updateMatrix();
    poly.updateContent();

    expect(poly.contentElement.style.transform).toBe("");
  });
});

describe("Group.pushPolygon", () => {
  it("merges the triangles of each cube face into a quad", () => {
    // From examples/cube.html
    // prettier-ignore
    const positions = [100, 100, 100, 100, 100, -100, 100, -100, 100, 100, -100, -100, -100, 100, -100, -100, 100, 100, -100, -100, -100, -100, -100, 100, -100, 100, -100, 100, 100, -100, -100, 100, 100, 100, 100, 100, -100, -100, 100, 100, -100, 100, -100, -100, -100, 100, -100, -100, -100, 100, 100, 100, 100, 100, -100, -100, 100, 100, -100, 100, 100, 100, -100, -100, 100, -100, 100, -100, -100, -100, -100, -100];
    // prettier-ignore
    const indices = [0, 2, 1, 2, 3, 1, 4, 6, 5, 6, 7, 5, 8, 10, 9, 10, 11, 9, 12, 14, 13, 14, 15, 13, 16, 18, 17, 18, 19, 17, 20, 22, 21, 22, 23, 21];
    // prettier-ignore
    const uvs = [0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0];

    const at = (i: number) =>
      vertex(
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2],
        uvs[i * 2],
        uvs[i * 2 + 1],
      );

    const group = new Group();
    for (let i = 0; i < indices.length; i += 3) {
      group.pushPolygon([
        at(indices[i]),
        at(indices[i + 1]),
        at(indices[i + 2]),
      ]);
    }
    group.flushPolygons();

    expect(group.children).toHaveLength(6);
    for (const child of group.children)
      expect((child as Polygon).vertices).toHaveLength(4);
  });

  it("keeps triangles apart when the texture mapping is not continuous", () => {
    const group = new Group();
    group.pushPolygon([
      vertex(0, 0, 0, 0, 0),
      vertex(1, 0, 0, 1, 0),
      vertex(1, 1, 0, 1, 1),
    ]);
    // Shared edge, but the third uv is off the mapping
    group.pushPolygon([
      vertex(0, 0, 0, 0, 0),
      vertex(1, 1, 0, 1, 1),
      vertex(0, 1, 0, 0.5, 1),
    ]);
    group.flushPolygons();

    expect(group.children).toHaveLength(2);
  });

  it("skips zero-area triangles instead of throwing", () => {
    const group = new Group();
    group.pushPolygon([vertex(0, 0, 0), vertex(1, 0, 0), vertex(2, 0, 0)]);
    group.pushPolygon([vertex(0, 0, 0), vertex(1, 0, 0), vertex(0, 1, 0)]);
    group.flushPolygons();

    expect(group.children).toHaveLength(1);
  });
});
