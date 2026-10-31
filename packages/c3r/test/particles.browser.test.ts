import { expect, it } from "vitest";
import { Container, Filter, Material, ParticleSystem, Transform } from "c3r";

const triangle = {
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  uvs: [0, 0, 1, 0, 0, 1],
  cells: [0, 1, 2],
};

const transform = (element: Element) =>
  new DOMMatrix(getComputedStyle(element).transform);

// At a point of the 2s life, one loop past the particle's random start, so no
// animation sits before it
const freeze = (element: Element, time: number) => {
  for (const animation of element.getAnimations({ subtree: true })) {
    animation.pause();
    animation.currentTime =
      time + 2000 + Number(animation.effect!.getTiming().delay);
  }
};

it("tweens each particle, moving it in the scene and turning it in the view", () => {
  const container = new Container();
  document.body.append(container.domElement);
  const scales: number[] = [];
  using system = new ParticleSystem({
    count: 2,
    lifetime: 2,
    lifetimeRandomness: 0,
    mesh: triangle,
    tween: ({ random }) => {
      const scale = random(2, 4);
      scales.push(scale);
      return {
        from: Transform.translate([0, 0, 0]),
        keyframes: [
          {
            steps: [
              Transform.translate([100, 0, 0]),
              Transform.rotateZ(Math.PI / 2),
              Transform.scale(scale),
              Filter.tint([1, 0.5, 0]),
              Filter.opacity(0.5),
            ],
            duration: 3,
          },
        ],
      };
    },
  });
  container.root.addChild(system);
  const material = new Material();
  material.background = [1, 1, 1, 1];
  material.flipbook = { columns: 2, rows: 2 };
  system.material = material;

  const [particle] = system.children;
  const body = particle.domElement.querySelector(".c3r-group")!;
  // Relative durations fill the 2s life, so this is halfway
  freeze(particle.domElement, 1000);
  expect(transform(particle.domElement).m41).toBeCloseTo(50);
  const { m11, m12 } = transform(body);
  expect(m11).toBeCloseTo(m12);
  expect(Math.hypot(m11, m12)).toBeCloseTo((1 + scales[0]) / 2);
  const style = getComputedStyle(body);
  expect(style.getPropertyValue("--c3r-tween-filter")).toContain("opacity(");
  expect(style.getPropertyValue("--c3r-tween-layers")).toContain("rgb(");

  const content = particle.domElement.querySelector(".c3r-polygon-content")!;
  freeze(particle.domElement, 750);
  expect(getComputedStyle(content).getPropertyValue("--c3r-frame")).toBe("1");

  system[Symbol.dispose]();
  expect(transform(particle.domElement).m41).toBe(0);
  container.domElement.remove();
});

it("rejects invalid options", () => {
  const options = {
    count: 1,
    lifetime: 1,
    mesh: triangle,
    tween: () => ({ keyframes: [Filter.opacity(0)] }),
  };
  expect(() => new ParticleSystem({ ...options, count: 0 })).toThrow(
    RangeError,
  );
  expect(() => new ParticleSystem({ ...options, lifetime: 0 })).toThrow(
    RangeError,
  );
  expect(
    () => new ParticleSystem({ ...options, lifetimeRandomness: 1 }),
  ).toThrow(RangeError);
  expect(
    () =>
      new ParticleSystem({
        ...options,
        tween: () => ({
          keyframes: [{ steps: Filter.opacity(0), duration: -1 }],
        }),
      }),
  ).toThrow(RangeError);
  // A start alone on one side holds, like a plain tween
  using spun = new ParticleSystem({
    ...options,
    tween: () => ({
      from: Transform.rotateZ(1),
      keyframes: [Transform.translate([0, 10, 0])],
    }),
  });
  const container = new Container();
  document.body.append(container.domElement);
  container.root.addChild(spun);
  const body = spun.children[0].domElement.querySelector(".c3r-group")!;
  expect(transform(body).m11).toBeCloseTo(Math.cos(1));
  container.domElement.remove();
});
