import { describe, expect, it, vi } from "vitest";
import { mat4, quat, vec3, vec4 } from "gl-matrix";
import { cube, cylinder } from "primitive-geometry";
import {
  CssValue,
  Container,
  cssText,
  ElementObject,
  Filter,
  Group,
  Material,
  MeshBuilder,
  OrthographicCamera,
  PerspectiveCamera,
  Polygon,
  styleHTML,
  Transform,
  Tween,
  type Vertex,
} from "c3r";
import { viewMatrixOf } from "../src/css/Camera.js";
import { Accumulator } from "../src/dom/Accumulator.js";
import { decompose } from "../src/css/Transform.js";
import { matrixOf } from "../src/dom/Object3D.js";

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

    const M = matrixOf(poly);
    const MI = mat4.invert(mat4.create(), M)!;
    const width = parseFloat(poly.domElement.style.getPropertyValue("--c3r-width"));
    const height = parseFloat(poly.domElement.style.getPropertyValue("--c3r-height"));

    for (const v of vertices) {
      const [x, y, z] = vec3.transformMat4(vec3.create(), v.position, MI);
      expect(Math.abs(z)).toBeLessThan(1e-4);
      expect(x).toBeGreaterThanOrEqual(-1e-3);
      expect(x).toBeLessThanOrEqual(width + 1e-3);
      expect(y).toBeGreaterThanOrEqual(-1e-3);
      expect(y).toBeLessThanOrEqual(height + 1e-3);
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

  it("stays cullable at a small world scale once the view scales up", () => {
    const poly = new Polygon([
      vertex(0, 0, 0),
      vertex(1, 0, 0),
      vertex(0, 1, 0),
    ]);
    const M = matrixOf(poly);
    const col = (i: number) => Math.hypot(M[i * 4], M[i * 4 + 1], M[i * 4 + 2]);
    expect(col(2) / col(0)).toBeCloseTo(1);

    const unit = 1 / col(0);
    const V = mat4.fromScaling(mat4.create(), [unit, unit, unit]);
    mat4.mul(V, V, M);
    const det = mat4.determinant(V);
    // Chrome's IsBackFaceVisible test
    const cofactor = mat4.invert(mat4.create(), V)![10] * det;
    expect(Math.abs(cofactor * det)).toBeGreaterThan(1e-6);
  });

  it("sizes a textured element to the texels it shows", () => {
    const poly = new Polygon([
      vertex(0, 0, 0, 0, 0),
      vertex(1, 0, 0, 1, 0),
      vertex(0, 1, 0, 0, 1),
    ]);
    const width = () =>
      parseFloat(poly.domElement.style.getPropertyValue("--c3r-width"));

    poly.textureSize = [256, 256];
    expect(width()).toBeCloseTo(256 * Math.SQRT2);
    poly.uvScale = [2, 2];
    expect(width()).toBeCloseTo(512 * Math.SQRT2);
    poly.pixelRatio = 2;
    expect(width()).toBeCloseTo(256 * Math.SQRT2);
    poly.uvScale = [100, 100];
    expect(width()).toBeCloseTo(4096 / 2);
    poly.textureSize = null;
    expect(width()).toBeCloseTo(250);
  });

  it("sizes by the most stretched direction, not by the edges", () => {
    // 256 texels per unit along the diagonal, the edges alone measure 187
    const poly = new Polygon([
      vertex(0, 0, 0, 0, 0),
      vertex(1, 0, 0, 0.625, 0.375),
      vertex(0, 1, 0, 0.375, 0.625),
    ]);
    poly.textureSize = [256, 256];
    const width = poly.domElement.style.getPropertyValue("--c3r-width");
    expect(parseFloat(width)).toBeCloseTo(256 * Math.SQRT2);
  });

  it("drops repeated vertices, also a repeated closing one", () => {
    const poly = new Polygon([
      vertex(0, 0, 0),
      vertex(0, 0, 0),
      vertex(1, 0, 0),
      vertex(1, 1, 0),
      vertex(0, 1, 0),
      vertex(0, 0, 0),
      vertex(0, 0, 0),
    ]);
    expect(poly.vertices).toHaveLength(4);

    // A collinear midpoint next to its duplicate
    const square = new Polygon([
      vertex(0, 0, 0),
      vertex(0.5, 0, 0),
      vertex(0.5, 0, 0),
      vertex(1, 0, 0),
      vertex(1, 1, 0),
      vertex(0, 1, 0),
    ]);
    expect(square.vertices).toHaveLength(4);
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

  // Chrome flickers with a clip-path on the 3d layer
  it("clips below the 3d layer", () => {
    const poly = new Polygon([
      vertex(0, 0, 0, 0, 0),
      vertex(1, 0, 0, 1, 0),
      vertex(0, 1, 0, 0, 1),
    ]);

    expect(poly.domElement.style.clipPath).toBe("");
    expect(poly.contentElement.parentElement!.style.clipPath).toMatch(
      /^polygon\(/,
    );
  });
});

describe("Polygon.clampUV", () => {
  it("keeps the overlap on the texture", () => {
    const square = [
      vertex(0, 0, 0, 0, 0),
      vertex(1, 0, 0, 1, 0),
      vertex(1, 1, 0, 1, 1),
      vertex(0, 1, 0, 0, 1),
    ];
    const poly = new Polygon(square, {
      edges: square.map(() => [{ point: [0, 0, 1], fold: "concave" }, null]),
    });
    const { style } = poly.contentElement;
    const sizes = () =>
      [...style.backgroundSize.matchAll(/([\d.e+-]+)%/g)].map((m) => +m[1]);

    expect(sizes()[0]).toBeLessThan(100);
    poly.clampUV = true;
    for (const size of sizes()) expect(size).toBeCloseTo(100);
  });
});

describe("Group.addTriangles", () => {
  const size = (poly: Polygon) =>
    ["--c3r-width", "--c3r-height"].map((p) =>
      parseFloat(poly.domElement.style.getPropertyValue(p)),
    );

  const box = cube({ sx: 200 });

  const triangles = () => {
    const { positions, uvs, cells } = box;
    const at = (i: number) =>
      vertex(
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2],
        uvs[i * 2],
        uvs[i * 2 + 1],
      );

    return Array.from({ length: cells.length / 3 }, (_, i) => [
      at(cells[i * 3]),
      at(cells[i * 3 + 1]),
      at(cells[i * 3 + 2]),
    ]);
  };

  it("merges the triangles of each cube face into a quad", () => {
    const group = new Group();
    group.addTriangles(triangles());

    expect(group.children).toHaveLength(6);
    for (const child of group.children) {
      const poly = child as Polygon;
      const { style } = poly.contentElement.parentElement!;
      expect(poly.vertices).toHaveLength(4);
      for (const length of size(poly)) expect(length).toBeCloseTo(250.8);
      expect(style.clipPath).toBe("");
      poly.overlapFolds = false;
      expect(size(poly)).toEqual([250, 250]);
      expect(style.clipPath).toBe("");
    }
  });

  it("builds the same quads from flat indexed arrays", () => {
    const group = new Group();
    group.addMesh(box);

    expect(group.children).toHaveLength(6);
    for (const child of group.children) {
      expect((child as Polygon).vertices).toHaveLength(4);
    }
  });

  it("merges the faces of a cube in any triangle order", () => {
    const group = new Group();
    const [a, b, ...rest] = triangles();
    group.addTriangles([a, ...rest.reverse(), b]);

    expect(group.children).toHaveLength(6);
  });

  it("overlaps concave folds unless told not to", () => {
    const group = new Group();
    group.addTriangles(triangles().map((tri) => tri.reverse()));

    for (const child of group.children) {
      const poly = child as Polygon;
      expect(size(poly)).toEqual([252, 252]);
      poly.overlapFolds = false;
      expect(size(poly)).toEqual([250, 250]);
    }
  });

  it("overlaps only the edges towards a smooth neighbour", () => {
    const group = new Group();
    group.addTriangles([
      [vertex(0, 0, 0, 0, 0), vertex(1, 0, 0, 1, 0), vertex(1, 1, 0, 1, 1)],
      [vertex(0, 0, 0, 0, 0), vertex(1, 1, 0, 1, 1), vertex(0, 1, 0, 0.5, 1)],
    ]);

    for (const child of group.children) {
      const [width, height] = size(child as Polygon);
      // The overlap does not extend the outer edges past the corners
      expect(width).toBeCloseTo(250);
      expect(height).toBeCloseTo(126);
    }
  });

  it("does not clip the sides of a cylinder", () => {
    const group = new Group();
    group.addMesh(cylinder({ nx: 16 }));

    const sides = group.children.filter(
      (child) => (child as Polygon).vertices.length === 4,
    );
    expect(sides).toHaveLength(16);
    for (const side of sides) {
      const clip = side.domElement.firstElementChild as HTMLElement;
      expect(clip.style.clipPath).toBe("");
    }
  });

  it("does not poke out of the mesh at a sharp corner on its border", () => {
    const group = new Group();
    // The texture mapping breaks between the triangles, so they stay apart
    group.addTriangles([
      [vertex(0, 0, 0, 0, 0), vertex(1, 4, 0, 1, 0), vertex(-1, 4, 0, 0, 1)],
      [vertex(0, 0, 0, 0, 0), vertex(1, 0, 0, 1, 1), vertex(1, 4, 0, 0, 1)],
      [vertex(0, 0, 0, 0, 0), vertex(-1, 4, 0, 1, 0), vertex(-1, 0, 0, 0, 1)],
    ]);

    const poly = group.children[0] as Polygon;
    const [width, height] = size(poly);
    const clip = (poly.domElement.firstElementChild as HTMLElement).style
      .clipPath;
    for (const [, x, y] of clip.matchAll(/([-\d.e]+)% ([-\d.e]+)%/g)) {
      const p = vec3.fromValues((+x / 100) * width, (+y / 100) * height, 0);
      vec3.transformMat4(p, p, matrixOf(poly));
      expect(p[1]).toBeGreaterThan(-1e-6);
    }
  });

  it("keeps a vertex shared by many faces covered", () => {
    const tris = Array.from({ length: 8 }, (_, i) => {
      const [a, b] = [i, i + 1].map((k) => (k * Math.PI) / 4);
      // The texture mapping breaks between the triangles, so they stay apart
      return [
        vertex(0, 0, 0, i, 0),
        vertex(Math.cos(a), Math.sin(a), 0, i + 1, 0),
        vertex(Math.cos(b), Math.sin(b), 0, i, 1),
      ];
    });
    const group = new Group();
    group.addTriangles(tris);

    for (const child of group.children) {
      const poly = child as Polygon;
      const [width, height] = size(poly);
      const clip = (poly.domElement.firstElementChild as HTMLElement).style
        .clipPath;
      const points = [...clip.matchAll(/([-\d.e]+)% ([-\d.e]+)%/g)].map(
        ([, x, y]) => {
          const p = vec3.fromValues((+x / 100) * width, (+y / 100) * height, 0);
          return vec3.transformMat4(p, p, matrixOf(poly));
        },
      );
      // The centre is on or inside every edge of the clip path
      points.forEach((a, i) => {
        const b = points[(i + 1) % points.length];
        expect(a[0] * b[1] - a[1] * b[0]).toBeGreaterThan(-1e-9);
      });
    }
  });

  it("overlaps towards a neighbour whose vertices are slightly off", () => {
    const group = new Group();
    group.addTriangles([
      [vertex(0, 0, 0, 0, 0), vertex(1, 0, 0, 1, 0), vertex(1, 1, 0, 1, 1)],
      [vertex(0, 0, 0), vertex(1, 1.0005, 0), vertex(0, 1, 0)],
    ]);

    expect(size(group.children[0] as Polygon)[1]).toBeCloseTo(126);
  });

  it("overlaps an edge facing a T-junction", () => {
    const group = new Group();
    // The texture mapping breaks between the triangles, so they stay apart
    group.addTriangles([
      [vertex(0, 0, 0, 0, 0), vertex(1, -1, 0, 1, 0), vertex(2, 0, 0, 0, 1)],
      [vertex(0, 0, 0), vertex(1, 0, 0), vertex(0, 1, 0)],
      [vertex(1, 0, 0), vertex(2, 0, 0), vertex(2, 1, 0)],
    ]);

    expect(size(group.children[0] as Polygon)).toEqual([250, 126]);
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

describe("MeshBuilder", () => {
  // Unit squares at the given corners, uv mapped by position
  const squares = (...corners: [number, number][]) =>
    corners.flatMap(([x, y]) => {
      const at = (dx: number, dy: number) =>
        vertex(x + dx, y + dy, 0, (x + dx) / 4, (y + dy) / 4);
      return [
        [at(0, 0), at(1, 0), at(1, 1)],
        [at(0, 0), at(1, 1), at(0, 1)],
      ];
    });

  const area = ({ vertices }: { vertices: Vertex[] }) =>
    vertices.reduce((s, { position: [x1, y1] }, i) => {
      const [x2, y2] = vertices[(i + 1) % vertices.length].position;
      return s + (x1 * y2 - x2 * y1) / 2;
    }, 0);

  it("merges within the uv tolerance", () => {
    const [a, b] = squares([0, 0]);
    const off = { ...b[2], uv: [b[2].uv[0] + 5e-4, b[2].uv[1]] as const };

    expect(new MeshBuilder([[a, [b[0], b[1], off]]]).faces(0)).toHaveLength(1);
    expect(
      new MeshBuilder([[a, [b[0], b[1], off]]], { uvTolerance: 1e-4 }).faces(0),
    ).toHaveLength(2);
  });

  it("does not grow the rectangle of a face by merging", () => {
    const faces = new MeshBuilder([squares([0, 0], [1, 0], [0, 1])]).faces(0);

    expect(faces).toHaveLength(2);
    expect(faces.map((f) => f.vertices.length)).toEqual([4, 4]);
  });

  it("keeps the faces of a ring free of holes", () => {
    // A square with a hole, its first triangle spans the whole square
    const at = (x: number, y: number) => vertex(x, y, 0, x / 4, y / 4);
    const [a, b, c, d] = [at(0, 0), at(4, 4), at(0, 4), at(4, 0)];
    const hole = [at(0.5, 2.5), at(1.5, 2.5), at(1.5, 3.5), at(0.5, 3.5)];
    const faces = new MeshBuilder([
      [
        [a, d, b],
        [a, b, hole[1]],
        [b, hole[2], hole[1]],
        [b, c, hole[2]],
        [c, hole[3], hole[2]],
        [c, a, hole[3]],
        [a, hole[0], hole[3]],
        [a, hole[1], hole[0]],
      ],
    ]).faces(0);

    expect(faces.length).toBeGreaterThan(1);
    expect(faces.reduce((s, f) => s + area(f), 0)).toBeCloseTo(16 - 1);
  });

  it("resolves the neighbour of an edge in another group", () => {
    const floor = [vertex(0, 0, 0), vertex(1, 0, 0), vertex(0, 1, 0)];
    const wall = [vertex(1, 0, 0), vertex(0, 0, 0), vertex(0, 0, 1)];
    const [face] = new MeshBuilder([[floor], [wall]]).faces(0);

    expect(face.edges[0][0]).toEqual({ point: [0, 0, 1], fold: "concave" });
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

  it("rejects an ancestor without changing either group", () => {
    const parent = new Group();
    const child = new Group();
    parent.addChild(child);

    expect(() => child.addChild(parent)).toThrow(RangeError);
    expect(child.children).toHaveLength(0);
    expect(parent.children).toEqual([child]);
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

  it("applies its material to its element, not to its children", () => {
    const node = new ElementObject(document.createElement("div"));
    const child = new Group();
    node.addChild(child);
    using material = new Material();
    node.material = material;

    expect(node.element.classList).toContain(material.className);
    expect(node.domElement.classList).not.toContain(material.className);
    expect(child.domElement.closest(`.${material.className}`)).toBeNull();
  });
});

// A class rule's declarations, or "" once it is gone
const ruleOf = (className: string) =>
  new RegExp(String.raw`\.${className}(, \.c3r-view)? \{[^}]*`).exec(
    cssText(),
  )?.[0] ?? "";

describe("Material", () => {
  it("styles objects through a class rule, removed on dispose", () => {
    const group = new Group();
    {
      using material = new Material();
      material.background = [1, 0, 0, 1];
      group.material = material;

      expect(group.domElement.classList).toContain(material.className);
      expect(
        group.domElement.style.getPropertyValue("--c3r-background-color"),
      ).toBe("");
      expect(ruleOf(material.className)).toMatch(/rgba\(255, ?0, ?0, ?1\)/);

      using other = new Material();
      group.material = other;
      expect([...group.domElement.classList]).toEqual([
        "c3r-group",
        other.className,
      ]);

      group.material = material;
    }
    expect(ruleOf(group.material.className)).toBe("");
  });

  it("shows back faces when double-sided", () => {
    using material = new Material();
    const rule = () => ruleOf(material.className);

    material.doubleSided = true;
    expect(rule()).toMatch(/backface-visibility: ?visible/);

    material.doubleSided = false;
    expect(rule()).not.toContain("backface-visibility");
  });

  it("plays a flipbook", () => {
    using material = new Material();
    const rule = () => ruleOf(material.className);

    material.flipbook = { columns: 8, rows: 4, frames: 30 };
    expect(rule()).toMatch(/--c3r-frames: ?30;.*--c3r-flipbook-duration: ?1s/);
    material.flipbook = null;
    expect(rule()).not.toContain("--c3r-");
    material.background = "leaf.png";
    expect(rule()).toMatch(/--c3r-columns: ?initial/);

    for (const flipbook of [
      { columns: 1.5, rows: 1 },
      { columns: 2, rows: 2, frames: 5 },
      { columns: 2, rows: 2, fps: 0 },
    ])
      expect(() => (material.flipbook = flipbook)).toThrow(RangeError);
  });

  it("paints a color or an image, hiding the other from a parent", () => {
    using material = new Material();
    const vars = () =>
      ["--c3r-background-color", "--c3r-background-image"].map(
        (name) =>
          new RegExp(`${name}: ?([^;]+)`).exec(
            ruleOf(material.className),
          )?.[1] ?? null,
      );

    expect(vars()).toEqual([null, null]);
    material.background = "leaf.png";
    expect(vars()).toEqual(["transparent", 'url("leaf.png")']);
    material.background = [1, 0, 0, 1];
    expect(vars()[0]).toMatch(/rgba\(255, ?0, ?0, ?1\)/);
    expect(vars()[1]).toBe("none");
    material.background = "";
    expect(vars()).toEqual([null, null]);
    expect(material.background).toBe(null);
  });

  it("paints a color opaque and fades it, so a tint stays exact", () => {
    using material = new Material();
    const rule = () => ruleOf(material.className);
    material.background = [1, 0, 0, 0.5];
    expect(rule()).toMatch(/--c3r-background-opaque: ?rgb\(255, ?0, ?0\)/);
    expect(rule()).toMatch(/--c3r-background-alpha: ?0\.5/);
    expect(rule()).toMatch(/--c3r-alpha-mask: ?none/);
  });

  it("keeps an image's mask when it can't read the pixels", async () => {
    using material = new Material();
    material.background = "leaf.png";
    const container = new Container();
    container.root.material = material;
    container.root.addPolygon([
      vertex(0, 0, 0),
      vertex(1, 0, 0),
      vertex(0, 1, 0),
    ]);
    await container.bake();
    expect(ruleOf(material.className)).toContain(
      '--c3r-alpha-mask: url("leaf.png")',
    );
  });

  it("filters with Filter steps only", () => {
    using material = new Material();
    const rule = () => ruleOf(material.className);

    const filter = [Filter.grayscale(1), Filter.brightness(1.2)];
    material.filter = filter;
    expect(material.filter).toEqual(filter);
    expect(rule()).toContain("--c3r-filter: grayscale(1) brightness(1.2)");

    material.filter = null;
    expect(rule()).not.toContain("--c3r-filter");
    expect(() => (material.filter = Transform.scale(2) as never)).toThrow(
      TypeError,
    );
  });

  it("tints by a multiplied color layer, replacing a parent's filters", () => {
    using material = new Material();
    const rule = () => ruleOf(material.className);
    material.filter = [Filter.tint([1, 0.8, 0.6]), Filter.opacity(0.5)];
    expect(rule()).toContain(
      "--c3r-layers: linear-gradient(rgb(100% 80% 60%), rgb(100% 80% 60%)),",
    );
    expect(rule()).toContain("--c3r-layered: alpha");
    expect(rule()).toContain("--c3r-filter: opacity(0.5)");
    // Only the tint changes, which must not be skipped
    material.filter = [Filter.tint([0, 0, 1]), Filter.opacity(0.5)];
    expect(rule()).toContain("rgb(0% 0% 100%)");
    // A tint alone still hides the parent's filters
    material.filter = Filter.tint([0, 0, 1]);
    expect(rule()).toContain("--c3r-filter: initial");
    material.filter = Filter.sepia(1);
    expect(rule()).toMatch(/--c3r-layers: initial;.*--c3r-layered: initial/);
    material.filter = null;
    expect(rule()).not.toMatch(/--c3r-(filter|layer)/);

    expect(() => Filter.tint([1, 0, 1.5])).toThrow(RangeError);
    expect(() => Filter.tint([NaN, 0, 0])).toThrow(RangeError);
  });
});

describe("Transform", () => {
  it("composes in CSS order", () => {
    const group = new Group();
    const steps = [Transform.translate([1, 2, 3]), Transform.rotateZ(1)];
    group.transform = steps;
    steps.pop();
    const expected = mat4.fromTranslation(mat4.create(), [1, 2, 3]);
    mat4.rotateZ(expected, expected, 1);
    expect(matrixOf(group)).toEqual(expected);
    expect(group.transform).toHaveLength(2);
  });

  it("rejects an invalid matrix", () => {
    expect(() => Transform.matrix([1, 0, 0])).toThrow(RangeError);
    expect(() => Transform.matrix(Array(16).fill(NaN))).toThrow(RangeError);
    const huge = Transform.scale(1e20);
    expect(() => (new Group().transform = [huge, huge])).toThrow(RangeError);
    using camera = new PerspectiveCamera();
    expect(() => (camera.transform = Transform.scale(1e-39))).toThrow(
      RangeError,
    );
  });

  it("decomposes a matrix into translation, rotation and scale", () => {
    const rebuild = (m: mat4) => {
      const { translation, axis, angle, scale } = decompose(m)!;
      const q = quat.setAxisAngle(quat.create(), axis as vec3, angle);
      return mat4.fromRotationTranslationScale(
        mat4.create(),
        q,
        translation as vec3,
        scale as vec3,
      );
    };
    const turned = mat4.fromTranslation(mat4.create(), [1, 2, 3]);
    mat4.rotate(turned, turned, 2, [1, 2, 3]);
    mat4.scale(turned, turned, [0.5, 2, 3]);
    const halfTurn = mat4.fromYRotation(mat4.create(), Math.PI);
    for (const m of [turned, mat4.create(), halfTurn])
      for (const [i, n] of rebuild(m).entries()) expect(n).toBeCloseTo(m[i], 5);

    const mirror = decompose(mat4.fromScaling(mat4.create(), [1, 1, -1]))!;
    expect(mirror.angle).toBe(0);
    expect(mirror.scale).toEqual([1, 1, -1]);

    const shear = mat4.fromTranslation(mat4.create(), [1e5, 0, 0]);
    shear[4] = 0.01;
    const perspective = mat4.create();
    perspective[11] = -0.001;
    for (const m of [shear, perspective, new Float32Array(16)])
      expect(decompose(m)).toBeNull();
  });

  it("tweens a matrix only when it decomposes", () => {
    const zero = Transform.matrix(new Float32Array(16));
    expect(() => (new Group().transform = zero)).not.toThrow();
    expect(() => new Tween({ keyframes: [zero] })).toThrow(RangeError);
    const moved = Transform.matrix(mat4.fromXRotation(mat4.create(), 1));
    expect(() =>
      new Tween({
        keyframes: [[Transform.translate([1, 2, 3]), moved]],
      })[Symbol.dispose](),
    ).not.toThrow();
    expect(() => (new Material().filter = zero as never)).toThrow(TypeError);
  });

  it("copies its input", () => {
    const v: [number, number, number] = [1, 2, 3];
    using tween = new Tween({ keyframes: [Transform.translate(v)] });
    v[0] = 9;
    const keyframes = new RegExp(
      String.raw`@keyframes ${tween.className} \{[^@]*`,
    ).exec(cssText())![0];
    expect(keyframes).toContain(": 1px");
    expect(keyframes).not.toContain("9px");
  });
});

describe("Tween", () => {
  const turn = 2 * Math.PI;

  it("animates groups through class rules, removed on dispose", () => {
    const group = new Group();
    group.transform = Transform.translate([1, 2, 3]);
    expect(group.domElement.style.getPropertyValue("--c3r-matrix")).toBe(
      "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,1,2,3,1)",
    );

    let className;
    {
      using spin = new Tween({
        keyframes: [
          [
            Transform.rotateX(turn),
            Transform.rotateZ(turn),
            Transform.translate([0, 20, 0]),
          ],
        ],
        duration: 2,
        loop: true,
      });
      className = spin.className;
      const track = `--${className}`;
      group.tween = spin;

      expect(group.domElement.classList).toContain(className);
      expect(cssText()).toContain(
        `@property ${track}-translate3d-y { syntax: "<length>"; inherits: false; initial-value: 0px; }`,
      );
      expect(cssText()).toContain(
        `100% { ${track}-rotateX: ${turn}rad; ${track}-rotateZ: ${turn}rad; ${track}-translate3d-x: 0px; ${track}-translate3d-y: 20px; ${track}-translate3d-z: 0px; }`,
      );
      expect(ruleOf(spin.className)).toContain(
        `${track}-animation: ${className} 2s linear 0s infinite normal both var(${track}-state)`,
      );
      const { style } = group.domElement;
      const t = (axis: string) => `var(${track}-translate3d-${axis}, 0px)`;
      expect(style.getPropertyValue("--c3r-tween-transform")).toBe(
        `rotateX(var(${track}-rotateX, 0rad)) rotateZ(var(${track}-rotateZ, 0rad)) translate3d(${t("x")},${t("y")},${t("z")})`,
      );
      expect(style.animation).toBe(`var(${track}-animation, none)`);

      spin.paused = true;
      expect(ruleOf(spin.className)).toMatch(`${track}-state: paused`);

      using other = new Tween({ keyframes: [Transform.scale(0.5)] });
      expect(cssText()).toContain(`--${other.className}-scale3d-z: 0.5`);
      group.tween = other;
      expect([...group.domElement.classList]).toEqual([
        "c3r-group",
        other.className,
      ]);
    }
    expect(cssText()).not.toContain(`${className} `);
  });

  it("composes several tweens on one group", () => {
    const group = new Group();
    using spin = new Tween({
      keyframes: [Transform.rotateY(turn)],
      loop: true,
    });
    using fade = new Tween({ keyframes: [Filter.opacity(0.5)], hover: true });
    using tint = new Tween({ keyframes: [Filter.sepia(1)] });
    const tweens = [spin, fade, tint];
    group.tween = tweens;
    expect(group.tween).toEqual(tweens);

    const { classList, style } = group.domElement;
    expect([...classList]).toEqual([
      "c3r-group",
      ...tweens.map((t) => t.className),
    ]);
    expect(style.getPropertyValue("--c3r-tween-transform")).toBe(
      `rotateY(var(--${spin.className}-rotateY, 0rad))`,
    );
    expect(style.animation).toBe(
      `var(--${spin.className}-animation, none), var(--${tint.className}-animation, none)`,
    );
    expect(style.transition).toBe(
      `var(--${fade.className}-transition, --${fade.className} 0s)`,
    );
    expect(style.getPropertyValue("--c3r-tween-filter")).toBe(
      `opacity(var(--${fade.className}-opacity, 1)) sepia(var(--${tint.className}-sepia, 0))`,
    );

    tweens.pop();
    group.tween = tweens;
    expect(classList).not.toContain(tint.className);
    group.tween = [spin, spin];
    expect(style.animation).toBe(`var(--${spin.className}-animation, none)`);

    group.tween = null;
    expect([...classList]).toEqual(["c3r-group"]);
    expect(style.cssText).toBe("");
  });

  it("plays keyframes in sequence, holding what they don't list", () => {
    using sequence = new Tween({
      from: Filter.opacity(0.5),
      keyframes: [
        Transform.translate([0, 50, 0]),
        { steps: Transform.rotateY(turn), duration: 2 },
        [],
        Filter.opacity(0),
      ],
    });
    const track = `--${sequence.className}`;
    const stop = (offset: number, y: number, angle: number, opacity: number) =>
      `${offset}% { ${track}-opacity: ${opacity}; ${track}-translate3d-x: 0px; ${track}-translate3d-y: ${y}px; ${track}-translate3d-z: 0px; ${track}-rotateY: ${angle}rad; }`;
    for (const block of [
      stop(0, 0, 0, 0.5),
      stop(20, 50, 0, 0.5),
      stop(60, 50, turn, 0.5),
      stop(80, 50, turn, 0.5),
      stop(100, 50, turn, 0),
    ])
      expect(cssText()).toContain(block);
    expect(ruleOf(sequence.className)).toContain(`${sequence.className} 5s`);
  });

  it("keeps a Firefox copy of each keyframes rule in the output", () => {
    const copy = (name: string) =>
      new RegExp(
        `@supports \\(-moz-appearance: none\\) \\{\\s*@keyframes ${name} \\{[^@]*min-width: 0\\.001px`,
      );
    expect(cssText()).toMatch(copy("c3r-flipbook"));
    expect(cssText().indexOf("@supports (-moz-appearance")).toBeGreaterThan(
      cssText().indexOf("@keyframes c3r-flipbook"),
    );
    const tween = new Tween({ keyframes: [Filter.opacity(0)] });
    expect(cssText()).toMatch(copy(tween.className));
    tween[Symbol.dispose]();
    expect(cssText()).not.toContain(tween.className);
  });

  it("plays a loop on hover only, removed on dispose", () => {
    let selector;
    {
      using pulse = new Tween({
        keyframes: [Transform.scale(2)],
        loop: true,
        hover: true,
      });
      selector = `.${pulse.className}:not(:hover)`;
      expect(ruleOf(pulse.className)).toMatch(/pointer-events: ?auto/);
      expect(cssText()).toContain(
        `${selector} { --${pulse.className}-state: paused; }`,
      );
    }
    expect(cssText()).not.toContain(selector);
  });

  it("transitions to its end while hovered, disabled when paused", () => {
    let className;
    {
      using fade = new Tween({
        keyframes: [Filter.opacity(0.5)],
        duration: 2,
        hover: true,
      });
      className = fade.className;
      const opacity = `--${className}-opacity`;
      expect(cssText()).not.toContain(`@keyframes ${className}`);
      const rule = ruleOf(fade.className);
      expect(rule).toContain(
        `--${className}-transition: ${opacity} 2s linear 0s`,
      );
      expect(rule).toMatch(/pointer-events: ?auto/);
      expect(rule).not.toContain("animation");

      const hovered = `.${className}:hover { ${opacity}: 0.5; }`;
      expect(cssText()).toContain(hovered);
      fade.paused = true;
      expect(cssText()).not.toContain(hovered);
      fade.paused = false;
      expect(cssText()).toContain(hovered);
    }
    expect(cssText()).not.toContain(className);
  });

  it("moves a camera by the inverse, last tween first", () => {
    using camera = new PerspectiveCamera();
    using move = new Tween({
      keyframes: [[Transform.translate([1, 2, 3]), Transform.rotateY(1)]],
    });
    using grow = new Tween({ keyframes: [Transform.scale(2)] });
    camera.tween = [move, grow];
    const p = (tween: Tween) => `--${tween.className}`;
    const t = (axis: string) =>
      `calc(-1 * var(${p(move)}-translate3d-${axis}, 0px))`;
    const s = (axis: string) => `calc(1 / var(${p(grow)}-scale3d-${axis}, 1))`;
    const rule = () => ruleOf(`${camera.className} > \\.c3r-view`);
    expect(rule()).toContain(
      `--c3r-tween-transform: scale3d(${s("x")},${s("y")},${s("z")}) rotateY(calc(-1 * var(${p(move)}-rotateY, 0rad))) translate3d(${t("x")},${t("y")},${t("z")})`,
    );

    using hover = new Tween({ keyframes: [Transform.scale(2)], hover: true });
    expect(() => (camera.tween = [move, hover])).toThrow(RangeError);
    expect(cssText()).not.toContain(`.${hover.className}, .c3r-view`);
    expect(camera.tween).toEqual([move, grow]);
    for (const keyframes of [
      [Transform.scale(0)],
      [Transform.scale([1, -1, 1])],
      [Transform.scale(-1), Transform.scale(1)],
    ]) {
      using flat = new Tween({ keyframes });
      expect(() => (camera.tween = flat)).toThrow(RangeError);
    }
    expect(camera.tween).toEqual([move, grow]);
    camera.tween = null;
    expect(rule()).not.toContain("tween");
  });

  it("rejects invalid steps and timing", () => {
    expect(() => new Tween({ keyframes: [] })).toThrow(RangeError);
    expect(() => new Tween({ keyframes: [[]] })).toThrow(RangeError);
    expect(() => new Tween({ keyframes: [{} as Transform] })).toThrow(
      TypeError,
    );
    const from = Filter.opacity(0);
    expect(() => new Tween({ from, keyframes: [[]] })).toThrow(RangeError);
    expect(() => new Tween({ from: [from, from], keyframes: [from] })).toThrow(
      "opacity twice in from",
    );
    expect(() => Transform.translate([0, NaN, 0])).toThrow(RangeError);
    expect(() => Transform.scale([1, 1] as never)).toThrow(RangeError);
    expect(() => Transform.rotateY(Infinity)).toThrow(RangeError);
    expect(() => Filter.brightness(-1)).toThrow(RangeError);
    expect(() => Filter.sepia(NaN)).toThrow(RangeError);
    expect(
      () => new Tween({ keyframes: [[Filter.sepia(1), Filter.sepia(0.5)]] }),
    ).toThrow(RangeError);
    const scale = Transform.scale(2);
    expect(
      () => new Tween({ keyframes: [{ steps: scale, duration: 0 }] }),
    ).toThrow(RangeError);
    expect(() => new Tween({ keyframes: [scale, scale], hover: true })).toThrow(
      RangeError,
    );
    for (const timing of [
      { duration: NaN },
      { duration: -1 },
      { easing: "ease-in, ease-out" },
      { easing: " inherit " },
      { easing: "var(--ease)" },
      { easing: "ease; } body { display: none } .x {" },
      { easing: "steps(2" },
      { easing: "ease)(" },
      { delay: NaN },
      { alternate: true },
    ])
      expect(() => new Tween({ keyframes: [scale], ...timing })).toThrow(
        RangeError,
      );
    const easing = "cubic-bezier(0.2, 0, 0.4, 1)";
    new Tween({ keyframes: [scale], easing })[Symbol.dispose]();
  });

  it("chains filters in order, each through its own property", () => {
    using look = new Tween({
      keyframes: [
        [Filter.brightness(2), Filter.hueRotate(turn), Filter.sepia(0.5)],
      ],
    });
    const p = `--${look.className}`;
    expect(cssText()).toContain(
      `0% { ${p}-brightness: 1; ${p}-hue-rotate: 0rad; ${p}-sepia: 0; }`,
    );
    expect(cssText()).toContain(
      `100% { ${p}-brightness: 2; ${p}-hue-rotate: ${turn}rad; ${p}-sepia: 0.5; }`,
    );
    expect(cssText()).toContain(
      `@property ${p}-hue-rotate { syntax: "<angle>"; inherits: false; initial-value: 0rad; }`,
    );
    const group = new Group();
    group.tween = look;
    expect(group.domElement.style.getPropertyValue("--c3r-tween-filter")).toBe(
      `brightness(var(${p}-brightness, 1)) hue-rotate(var(${p}-hue-rotate, 0rad)) sepia(var(${p}-sepia, 0))`,
    );
  });

  it("tweens a tint as one color, with any easing or hover", () => {
    using change = new Tween({
      keyframes: [Filter.tint([1, 0.8, 0.6])],
      easing: "ease",
    });
    const p = `--${change.className}-tint`;
    expect(cssText()).toMatch(
      new RegExp(`@property ${p} ?\{ ?syntax: ?"<color>"`),
    );
    expect(cssText()).toContain(`${p}: rgb(100% 80% 60%)`);
    const group = new Group();
    group.tween = change;
    const { style } = group.domElement;
    expect(style.getPropertyValue("--c3r-tween-layers")).toBe(
      `linear-gradient(var(${p}, white), var(${p}, white)),`,
    );
    expect(style.getPropertyValue("--c3r-tween-filter")).toBe("initial");
    group.tween = null;
    expect(style.getPropertyValue("--c3r-tween-layers")).toBe("");
    expect(() =>
      new Tween({ keyframes: [Filter.tint([0, 0, 1])], hover: true })[
        Symbol.dispose
      ](),
    ).not.toThrow();
  });
});

describe("server-side rendering", () => {
  it("exports the stylesheet for static html", () => {
    expect(cssText()).toContain(".c3r-polygon");
    expect(cssText()).toContain("@property --c3r-matrix");
  });

  it("exports the scene as static html", async () => {
    const container = new Container();
    const group = new Group();
    group.transform = Transform.scale(0.01);
    group.addPolygon([vertex(0, 0, 0), vertex(1, 0, 0), vertex(0, 1, 0)]);
    container.root.addChild(group);

    const html = await container.toHTML();
    const { outerHTML } = container.domElement;

    expect(html).toBe(styleHTML() + outerHTML);
    expect(outerHTML).toContain("--c3r-unit-scale");
  });

  it("keeps every value inside the exported style element", async () => {
    const container = new Container();
    const group = new Group();
    group.material = new Material();
    group.material.background = "a</style><script>x</script>";
    container.root.addChild(group);

    expect(await container.toHTML()).not.toContain("</style><script>");

    group.material.background = 'x\n") } .c3r-polygon { display: none';
    expect(await container.toHTML()).not.toMatch(/[\n"]\) \} \.c3r-polygon/);
    group.material[Symbol.dispose]();
  });

  it("measures the images a server-side DOM loads", async () => {
    const { settings } = window.happyDOM;
    const { enableImageFileLoading } = settings;
    const { virtualServers } = settings.fetch;
    settings.enableImageFileLoading = true;
    settings.fetch.virtualServers = [
      { url: "/assets/", directory: "examples/public" },
    ];
    try {
      const container = new Container();
      const [loaded, sized] = [0, 1].map(() => {
        const group = new Group();
        container.root.addChild(group);
        group.material = new Material();
        group.material.background = "/assets/textures/mountain.jpg";
        return group.addPolygon([
          vertex(0, 0, 0, 0, 0),
          vertex(1, 0, 0, 1, 0),
          vertex(0, 1, 0, 0, 1),
        ]);
      });
      sized.textureSize = [768, 256];
      await container.bake();
      const width = (poly: Polygon) =>
        poly.domElement.style.getPropertyValue("--c3r-width");
      expect(width(loaded)).toBe(width(sized));
    } finally {
      settings.enableImageFileLoading = enableImageFileLoading;
      settings.fetch.virtualServers = virtualServers;
    }
  });

  it("keeps an input rule's result inside its declaration", async () => {
    using error = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = new Container();
    using acc = new Accumulator({
      name: "unsafe",
      syntax: "*",
      identity: CssValue.number(0),
      combine: (parent, input) => CssValue.add(parent, input),
      input: () => "0; } * {color:red}" as unknown as CssValue,
    });
    const target = new Group();
    container.root.addChild(target);
    acc.addTarget(target);
    const html = await container.toHTML();
    expect(html).not.toMatch(/color: ?red/);
    expect(cssText()).not.toMatch(/color: ?red/);
    expect(error).toHaveBeenCalled();
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
      const pose = Transform.translate([0, 0, 400]);
      camera.transform = pose;
      container.camera = camera;
      expect(viewMatrixOf(camera)[14]).toBe(-400);
      expect(() => (camera.transform = Transform.scale(0))).toThrow(RangeError);
      expect(camera.transform).toBe(pose);
      expect(viewMatrixOf(camera)[14]).toBe(-400);

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

  it("scales the view by the unit scale", () => {
    const container = new Container();
    container.unitScale = 256;

    const { style } = container.domElement;
    expect(style.getPropertyValue("--c3r-unit-scale")).toBe("256");
    expect(cssText()).toMatch(/scale3d\(\s*var\(--c3r-unit-scale/);
    expect(cssText()).toMatch(/scaleZ\(var\(--c3r-unit-scale/);
    expect(() => (container.unitScale = NaN)).toThrow(RangeError);
    expect(() => (container.unitScale = 0)).toThrow(RangeError);
  });

  it("fits the unit scale to the densest visible polygon", () => {
    const container = new Container();
    const group = new Group();
    group.transform = Transform.scale(0.01);
    container.root.addChild(group);
    const poly = group.addPolygon([
      vertex(0, 0, 0),
      vertex(1, 0, 0),
      vertex(0, 1, 0),
    ]);
    const [x, y, z] = matrixOf(poly);
    const domPixel = Math.hypot(x, y, z) * 0.01;
    const fit = () => {
      container.bake();
      return container.unitScale;
    };

    const scale = fit();
    expect(Math.log2(scale) % 1).toBe(0);
    expect(scale * domPixel).toBeGreaterThanOrEqual(1);
    expect(scale * domPixel).toBeLessThan(2);

    container.camera.transform = Transform.scale(0.5);
    expect(fit()).toBe(scale / 2);

    group.domElement.style.display = "none";
    expect(fit()).toBe(1);

    group.domElement.style.display = "";
    group.transform = Transform.scale(0);
    expect(fit()).toBe(1);
  });
});

it("polyfills Symbol.dispose before the classes use it", async () => {
  const RealSymbol = Symbol;
  const { dispose: _, ...props } = Object.getOwnPropertyDescriptors(Symbol);
  const FakeSymbol = Object.defineProperties(
    (description?: string) => RealSymbol(description),
    props,
  );

  globalThis.Symbol = FakeSymbol as SymbolConstructor;
  try {
    vi.resetModules();
    const { Material, Camera } = await import("../src/C3R.ts");
    const key = RealSymbol.for("Symbol.dispose");
    expect(Object.hasOwn(Material.prototype, key)).toBe(true);
    expect(Object.hasOwn(Camera.prototype, key)).toBe(true);
  } finally {
    globalThis.Symbol = RealSymbol;
  }
});
