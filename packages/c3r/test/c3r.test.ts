import { describe, expect, it } from "vitest";
import { mat4, vec3, vec4 } from "gl-matrix";
import {
  Container,
  cssText,
  ElementObject,
  Group,
  Material,
  OrthographicCamera,
  PerspectiveCamera,
  Polygon,
  type Vertex,
} from "c3r";

const vertex = (x: number, y: number, z: number, u = 0, v = 0): Vertex => ({
  position: [x, y, z],
  uv: [u, v],
});

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

    const M = poly.matrix;
    const MI = mat4.invert(mat4.create(), M)!;
    const width = parseFloat(poly.domElement.style.getPropertyValue("--c3r-width"));
    const height = parseFloat(poly.domElement.style.getPropertyValue("--c3r-height"));

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
    const normal = polygonNormal(vertices.map((v) => vec3.clone(v.position)));
    expect(vec3.dot(front, normal)).toBeGreaterThan(0.999);
  });

  it("falls back to the plain color for collinear uvs", () => {
    const poly = new Polygon([
      vertex(0, 0, 0, 0, 0),
      vertex(1, 0, 0, 0.5, 0.5),
      vertex(0, 1, 0, 1, 1),
    ]);

    expect(poly.contentElement.style.transform).toBe("");
  });

  it("maps the texture on construction and on uv assignment", () => {
    const poly = new Polygon([
      vertex(0, 0, 0, 0, 0),
      vertex(1, 0, 0, 1, 0),
      vertex(0, 1, 0, 0, 1),
    ]);
    const { style } = poly.contentElement;
    const size = style.backgroundSize;
    expect(style.transform).not.toBe("");

    poly.uvScale = [2, 2];
    expect(style.backgroundSize).not.toBe(size);
  });
});

describe("Group.addTriangles", () => {
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

    const triangles = [];
    for (let i = 0; i < indices.length; i += 3) {
      triangles.push([at(indices[i]), at(indices[i + 1]), at(indices[i + 2])]);
    }
    const group = new Group();
    group.addTriangles(triangles);

    expect(group.children).toHaveLength(6);
    for (const child of group.children)
      expect((child as Polygon).vertices).toHaveLength(4);
  });

  it("keeps triangles apart when the texture mapping is not continuous", () => {
    const group = new Group();
    group.addTriangles([
      [vertex(0, 0, 0, 0, 0), vertex(1, 0, 0, 1, 0), vertex(1, 1, 0, 1, 1)],
      // Shared edge, but the third uv is off the mapping
      [vertex(0, 0, 0, 0, 0), vertex(1, 1, 0, 1, 1), vertex(0, 1, 0, 0.5, 1)],
    ]);

    expect(group.children).toHaveLength(2);
  });

  it("skips zero-area triangles instead of throwing", () => {
    const group = new Group();
    group.addTriangles([
      [vertex(0, 0, 0), vertex(1, 0, 0), vertex(2, 0, 0)],
      [vertex(0, 0, 0), vertex(1, 0, 0), vertex(0, 1, 0)],
    ]);

    expect(group.children).toHaveLength(1);
  });
});

describe("Group", () => {
  it("moves a child out of its previous parent", () => {
    const a = new Group();
    const b = new Group();
    const child = new Group();
    a.addChild(child);
    b.addChild(child);

    expect(a.children).toHaveLength(0);
    expect(b.children).toEqual([child]);
    expect(child.domElement.parentElement).toBe(b.domElement);
  });

  it("replaces the container root in the DOM", () => {
    const container = new Container();
    const root = new Group();
    container.root = root;

    expect([...container.viewElement.children]).toEqual([root.domElement]);
  });
});

describe("ElementObject", () => {
  it("applies scale, center and rotation on assignment", () => {
    const node = new ElementObject(document.createElement("div"));
    node.scale = [2, 3];
    node.center = [0, 1];
    node.rotation = 1;

    expect(node.element.style.transform).toBe(
      "translate(-50%,-50%)scale(2,-3)translate(50%,50%)rotate(1rad)",
    );
  });
});

describe("Material", () => {
  it("styles objects through a class rule, removed on dispose", () => {
    const group = new Group();
    {
      using material = new Material();
      material.backgroundColor = [1, 0, 0, 1];
      group.material = material;

      expect(group.domElement.classList).toContain(material.className);
      expect(
        group.domElement.style.getPropertyValue("--c3r-background-color"),
      ).toBe("");
      expect(cssText()).toMatch(
        new RegExp(
          `\\.${material.className} \\{[^}]*rgba\\(255, ?0, ?0, ?1\\)`,
        ),
      );

      using other = new Material();
      group.material = other;
      expect([...group.domElement.classList]).toEqual([
        "c3r-group",
        other.className,
      ]);

      group.material = material;
    }
    expect(cssText()).not.toContain(`.${group.material.className} `);
  });
});

describe("server-side rendering", () => {
  it("exports the stylesheet for static html", () => {
    expect(cssText()).toContain(".c3r-polygon");
  });

  it("sizes an orthographic view from setSize, without layout", () => {
    const container = new Container();
    container.setSize(400, 300);
    const camera = new OrthographicCamera(-200, 200, 150, -150);
    container.camera = camera;

    const { classList, style } = container.domElement;
    expect([...classList]).toEqual([
      "c3r-container",
      "c3r-orthographic",
      camera.className,
    ]);
    expect(style.getPropertyValue("--c3r-viewport-x")).toBe("400");
    expect(cssText()).toMatch(
      new RegExp(
        String.raw`\.${camera.className} \{[^}]*--c3r-camera-left: ?-200`,
      ),
    );
  });
});

describe("cameras", () => {
  it("project through stylesheet rules, removed on dispose", () => {
    const container = new Container();
    {
      using camera = new PerspectiveCamera(60);
      camera.matrix = mat4.fromTranslation(mat4.create(), [0, 0, -400]);
      container.camera = camera;

      expect(container.domElement.classList).toContain("c3r-perspective");
      expect(cssText()).toMatch(
        new RegExp(
          String.raw`\.${camera.className} \{[^}]*--c3r-camera-fov: ?60deg`,
        ),
      );
      expect(cssText()).toMatch(
        new RegExp(
          `\.${camera.className} > \.c3r-view \{[^}]*matrix3d\([^)]*-400,1\)`,
        ),
      );
    }
    expect(cssText()).not.toContain(`${container.camera.className} `);
  });
});
