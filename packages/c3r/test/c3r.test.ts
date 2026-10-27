import { describe, expect, it, vi } from "vitest";
import { mat4, vec3, vec4 } from "gl-matrix";
import {
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
  Transform,
  Tween,
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
    const M = poly.matrix;
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

    expect(parseFloat(style.backgroundSize)).toBeLessThan(100);
    poly.clampUV = true;
    for (const size of style.backgroundSize.split(" "))
      expect(parseFloat(size)).toBeCloseTo(100);
  });
});

describe("Group.addTriangles", () => {
  const size = (poly: Polygon) =>
    ["--c3r-width", "--c3r-height"].map((p) =>
      parseFloat(poly.domElement.style.getPropertyValue(p)),
    );

  // prettier-ignore
  const positions = [100, 100, 100, 100, 100, -100, 100, -100, 100, 100, -100, -100, -100, 100, -100, -100, 100, 100, -100, -100, -100, -100, -100, 100, -100, 100, -100, 100, 100, -100, -100, 100, 100, 100, 100, 100, -100, -100, 100, 100, -100, 100, -100, -100, -100, 100, -100, -100, -100, 100, 100, 100, 100, 100, -100, -100, 100, 100, -100, 100, 100, 100, -100, -100, 100, -100, 100, -100, -100, -100, -100, -100];
  // prettier-ignore
  const indices = [0, 2, 1, 2, 3, 1, 4, 6, 5, 6, 7, 5, 8, 10, 9, 10, 11, 9, 12, 14, 13, 14, 15, 13, 16, 18, 17, 18, 19, 17, 20, 22, 21, 22, 23, 21];
  // prettier-ignore
  const uvs = [0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0];

  const cube = () => {
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
    return triangles;
  };

  it("merges the triangles of each cube face into a quad", () => {
    const group = new Group();
    group.addTriangles(cube());

    expect(group.children).toHaveLength(6);
    for (const child of group.children) {
      const poly = child as Polygon;
      expect(poly.vertices).toHaveLength(4);
      for (const length of size(poly)) expect(length).toBeCloseTo(250.8);
      poly.overlapFolds = false;
      expect(size(poly)).toEqual([250, 250]);
    }
  });

  it("builds the same quads from flat indexed arrays", () => {
    const group = new Group();
    group.addMesh({ positions, uvs, cells: indices });

    expect(group.children).toHaveLength(6);
    for (const child of group.children) {
      expect((child as Polygon).vertices).toHaveLength(4);
    }
  });

  it("merges the faces of a cube in any triangle order", () => {
    const group = new Group();
    const [a, b, ...rest] = cube();
    group.addTriangles([a, ...rest.reverse(), b]);

    expect(group.children).toHaveLength(6);
  });

  it("overlaps concave folds unless told not to", () => {
    const group = new Group();
    group.addTriangles(cube().map((tri) => tri.reverse()));

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
      vec3.transformMat4(p, p, poly.matrix);
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
          return vec3.transformMat4(p, p, poly.matrix);
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
  new RegExp(String.raw`\.${className} \{[^}]*`).exec(cssText())?.[0] ?? "";

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

  it("masks a tint to the image in effect", () => {
    using material = new Material();
    const vars = () =>
      ["--c3r-background-color", "--c3r-mask-image"].map(
        (name) =>
          new RegExp(`${name}: ?([^;]+)`).exec(
            ruleOf(material.className),
          )?.[1] ?? null,
      );

    expect(vars()).toEqual([null, null]);
    material.backgroundImageSrc = "leaf.png";
    expect(vars()).toEqual(["transparent", "none"]);
    material.backgroundColor = [1, 0, 0, 1];
    expect(vars()[0]).toMatch(/rgba\(255, ?0, ?0, ?1\)/);
    expect(vars()[1]).toBe("var(--c3r-background-image, none)");
    material.backgroundImageSrc = null;
    expect(vars()[1]).toBe("var(--c3r-background-image, none)");
    material.backgroundColor = null;
    expect(vars()).toEqual([null, null]);
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
});

describe("Tween", () => {
  const turn = 2 * Math.PI;

  it("animates groups through class rules, removed on dispose", () => {
    const group = new Group();
    group.matrix = mat4.fromTranslation(mat4.create(), [1, 2, 3]);
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
        `@property ${track} { syntax: "<transform-list>"; inherits: false; initial-value: translate(0); }`,
      );
      expect(cssText()).toContain(
        `${track}: rotateX(0rad) rotateZ(0rad) translate3d(0px,0px,0px)`,
      );
      expect(cssText()).toContain(
        `${track}: rotateX(${turn}rad) rotateZ(${turn}rad) translate3d(0px,20px,0px)`,
      );
      expect(ruleOf(spin.className)).toContain(
        `${track}-animation: ${className} 2s linear 0s infinite normal both var(${track}-state)`,
      );
      const { style } = group.domElement;
      expect(style.getPropertyValue("--c3r-tween-transform")).toBe(
        `var(${track},)`,
      );
      expect(style.animation).toBe(`var(${track}-animation, none)`);

      spin.paused = true;
      expect(ruleOf(spin.className)).toMatch(`${track}-state: paused`);

      using other = new Tween({ keyframes: [Transform.scale(0.5)] });
      expect(cssText()).toContain("scale3d(0.5,0.5,0.5)");
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
      `var(--${spin.className},)`,
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
      keyframes: [
        Transform.translate([0, 50, 0]),
        { steps: Transform.rotateY(turn), duration: 2 },
        [],
        Filter.opacity(0),
      ],
    });
    const track = `--${sequence.className}`;
    const stop = (offset: number, y: number, angle: number, opacity: number) =>
      `${offset}% { ${track}: translate3d(0px,${y}px,0px) rotateY(${angle}rad); ${track}-opacity: ${opacity}; }`;
    for (const block of [
      stop(0, 0, 0, 1),
      stop(20, 50, 0, 1),
      stop(60, 50, turn, 1),
      stop(80, 50, turn, 1),
      stop(100, 50, turn, 0),
    ])
      expect(cssText()).toContain(block);
    expect(ruleOf(sequence.className)).toContain(`${sequence.className} 5s`);
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
      expect(rule).toContain(`${opacity}: 1`);
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

  it("rejects invalid steps and timing", () => {
    expect(() => new Tween({ keyframes: [] })).toThrow(RangeError);
    expect(() => new Tween({ keyframes: [[]] })).toThrow(RangeError);
    expect(() => new Tween({ keyframes: [{} as Transform] })).toThrow(
      TypeError,
    );
    expect(() => Transform.translate([0, NaN, 0])).toThrow(RangeError);
    expect(() => Transform.scale([1, 1] as never)).toThrow(RangeError);
    expect(() => Transform.rotateY(Infinity)).toThrow(RangeError);
    expect(() => Filter.brightness(-1)).toThrow(RangeError);
    expect(() => Filter.blur(NaN)).toThrow(RangeError);
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
        [Filter.brightness(2), Filter.hueRotate(turn), Filter.blur(3)],
      ],
    });
    const p = `--${look.className}`;
    expect(cssText()).toContain(
      `0% { ${p}-brightness: 1; ${p}-hue-rotate: 0rad; ${p}-blur: 0px; }`,
    );
    expect(cssText()).toContain(
      `100% { ${p}-brightness: 2; ${p}-hue-rotate: ${turn}rad; ${p}-blur: 3px; }`,
    );
    expect(cssText()).toContain(
      `@property ${p}-hue-rotate { syntax: "<angle>"; inherits: false; initial-value: 0rad; }`,
    );
    const group = new Group();
    group.tween = look;
    expect(group.domElement.style.getPropertyValue("--c3r-tween-filter")).toBe(
      `brightness(var(${p}-brightness, 1)) hue-rotate(var(${p}-hue-rotate, 0rad)) blur(var(${p}-blur, 0px))`,
    );
  });
});

describe("server-side rendering", () => {
  it("exports the stylesheet for static html", () => {
    expect(cssText()).toContain(".c3r-polygon");
    expect(cssText()).toContain("@property --c3r-matrix");
  });

  it("exports the scene as static html", () => {
    const container = new Container();
    const group = new Group();
    group.matrix = mat4.fromScaling(mat4.create(), [0.01, 0.01, 0.01]);
    group.addPolygon([vertex(0, 0, 0), vertex(1, 0, 0), vertex(0, 1, 0)]);
    container.root.addChild(group);

    const html = container.toHTML();
    const { outerHTML } = container.domElement;

    const css = cssText().replaceAll("<", "\\3c ");
    expect(html).toBe(`<style>${css}</style>${outerHTML}`);
    expect(outerHTML).toContain("--c3r-unit-scale");
  });

  it("keeps every value inside the exported style element", () => {
    const container = new Container();
    const group = new Group();
    group.material = new Material();
    group.material.backgroundImageSrc = "a</style><script>x</script>";
    container.root.addChild(group);

    expect(container.toHTML()).not.toContain("</style><script>");

    group.material.backgroundImageSrc = 'x\n") } .c3r-polygon { display: none';
    expect(container.toHTML()).not.toMatch(/[\n"]\) \} \.c3r-polygon/);
    group.material[Symbol.dispose]();
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
    group.matrix = mat4.fromScaling(mat4.create(), [0.01, 0.01, 0.01]);
    container.root.addChild(group);
    const poly = group.addPolygon([
      vertex(0, 0, 0),
      vertex(1, 0, 0),
      vertex(0, 1, 0),
    ]);
    const [x, y, z] = poly.matrix;
    const domPixel = Math.hypot(x, y, z) * 0.01;
    const fit = () => {
      container.bake();
      return container.unitScale;
    };

    const scale = fit();
    expect(Math.log2(scale) % 1).toBe(0);
    expect(scale * domPixel).toBeGreaterThanOrEqual(1);
    expect(scale * domPixel).toBeLessThan(2);

    container.camera.matrix = mat4.fromScaling(mat4.create(), [2, 2, 2]);
    expect(fit()).toBe(scale / 2);

    group.domElement.style.display = "none";
    expect(fit()).toBe(1);

    group.domElement.style.display = "";
    group.matrix = mat4.fromScaling(mat4.create(), [0, 0, 0]);
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
