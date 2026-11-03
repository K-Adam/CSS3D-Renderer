import {
  mat3,
  mat4,
  type ReadonlyMat4,
  type ReadonlyVec3,
  vec3,
} from "gl-matrix";

import type { Shadows } from "../css/Material.js";
import { deleteRule, insertRule } from "../css/styles.js";
import {
  joinTimeline,
  leaveTimeline,
  setFollowing,
  type Timeline,
} from "../css/Timeline.js";
import {
  addHoverRule,
  hoverTransitionOf,
  playsOnOwnHover,
  timelineOf,
  transformSteps,
  tweenCycle,
  tweenKeyTimes,
  tweenMatrixAt,
  type Tween,
} from "../css/Tween.js";

import { Billboard } from "./Billboard.js";
import { Group } from "./Group.js";
import { matrixOf, type Object3D, parents } from "./Object3D.js";
import type { Polygon } from "./Polygon.js";

// Centred on the group's origin, a cylinder along its y axis
export type ShadowCaster =
  | { readonly shape: "sphere"; readonly radius: number }
  | {
      readonly shape: "cylinder";
      readonly radius: number;
      readonly height: number;
    }
  | { readonly shape: "box"; readonly size: ReadonlyVec3 };

export type ShadowLight =
  | {
      readonly position: ReadonlyVec3;
      readonly tween?: Tween | readonly Tween[] | null;
    }
  | { readonly direction: ReadonlyVec3 };

type Source = { at: vec3 } | { along: vec3 };

type Point = [number, number];

const RING = 24;
// Dense enough that thinning finds where the shape bends
const SAMPLES_PER_SECOND = 30;
const HOVER_SAMPLES = 64;
const TOLERANCE_PX = 0.5;
const MAX_CYCLES = 8;
// Of the light's height. The hull stops this short of it, where a corner would project to infinity
const NEAR_LIGHT = 1e-3;

// Those that move something, a filter tween casts nothing
const tweensOf = (tween: Tween | readonly Tween[] | null | undefined) =>
  [tween ?? []].flat().filter((t) => transformSteps(t).length);

const chainOf = (node: Object3D): Object3D[] => {
  const chain: Object3D[] = [];
  for (let n: Object3D | undefined = node; n; n = parents.get(n))
    chain.unshift(n);
  return chain;
};

// A billboard turns with the camera, which JS doesn't follow
const facesCamera = (chain: readonly Object3D[]) =>
  chain.some((n) => n instanceof Billboard);

type Pose = (tween: Tween, at: number) => mat4;

const tweenMatrix = (tweens: readonly Tween[], pose: Pose, at: number) =>
  tweens.reduce(
    (out, tween) => mat4.mul(out, out, pose(tween, at)),
    mat4.create(),
  );

const worldAt = (chain: readonly Object3D[], pose: Pose, at: number): mat4 =>
  chain.reduce((out, node) => {
    mat4.mul(out, out, matrixOf(node));
    return node instanceof Group
      ? mat4.mul(out, out, tweenMatrix(tweensOf(node.tween), pose, at))
      : out;
  }, mat4.create());

const periodOf = (tweens: readonly Tween[]): number => {
  const cycles = tweens.map(tweenCycle);
  if (!cycles.length) return 0;
  const longest = Math.max(...cycles);
  for (let k = 1; k <= MAX_CYCLES; k++) {
    const period = k * longest;
    const fits = (c: number) =>
      Math.abs(period / c - Math.round(period / c)) < 1e-6;
    if (cycles.every(fits)) return period;
  }
  throw new RangeError("Shadows need tweens whose cycles share a short period");
};

const ring = (center: vec3, a: vec3, b: vec3, radius: number): vec3[] =>
  Array.from({ length: RING }, (_, i) => {
    const angle = (i / RING) * 2 * Math.PI;
    const p = vec3.scaleAndAdd(
      vec3.create(),
      center,
      a,
      Math.cos(angle) * radius,
    );
    return vec3.scaleAndAdd(p, p, b, Math.sin(angle) * radius);
  });

const transformed = (points: readonly ReadonlyVec3[], m: ReadonlyMat4) =>
  points.map((p) => vec3.transformMat4(vec3.create(), p, m));

const across = (d: vec3): [vec3, vec3] => {
  const a = vec3.cross(
    vec3.create(),
    d,
    Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0],
  );
  vec3.normalize(a, a);
  return [a, vec3.cross(vec3.create(), d, a)];
};

function casterPoints(
  caster: ShadowCaster,
  m: ReadonlyMat4,
  source: Source,
): vec3[] {
  // A directional light is infinitely far, so no caster contains it
  const local = () =>
    "at" in source
      ? vec3.transformMat4(
          vec3.create(),
          source.at,
          mat4.invert(mat4.create(), m) ?? mat4.create(),
        )
      : vec3.fromValues(Infinity, Infinity, Infinity);
  const inside = new RangeError("The light is inside a shadow caster");
  if (caster.shape === "box") {
    const half = Array.from(caster.size, (n) => n / 2);
    const l = local();
    if (half.every((n, i) => Math.abs(l[i]) < n)) throw inside;
    const corners = Array.from(
      { length: 8 },
      (_, i) => half.map((n, k) => (i & (1 << k) ? n : -n)) as vec3,
    );
    return transformed(corners, m);
  }
  if (caster.shape === "cylinder") {
    const { radius, height } = caster;
    const l = local();
    if (Math.hypot(l[0], l[2]) < radius && Math.abs(l[1]) < height / 2)
      throw inside;
    const cap = (y: number) =>
      ring(vec3.fromValues(0, y, 0), [1, 0, 0], [0, 0, 1], radius);
    return transformed([...cap(-height / 2), ...cap(height / 2)], m);
  }
  const center = vec3.transformMat4(vec3.create(), [0, 0, 0], m);
  const radius =
    caster.radius *
    Math.cbrt(Math.abs(mat3.determinant(mat3.fromMat4(mat3.create(), m))));
  if ("along" in source) {
    const [a, b] = across(source.along);
    return ring(center, a, b, radius);
  }
  const away = vec3.sub(vec3.create(), center, source.at);
  const d = vec3.length(away);
  if (d <= radius) throw inside;
  vec3.scale(away, away, 1 / d);
  const [a, b] = across(away);
  const outline = vec3.scaleAndAdd(
    vec3.create(),
    center,
    away,
    -(radius * radius) / d,
  );
  return ring(outline, a, b, radius * Math.sqrt(1 - (radius / d) ** 2));
}

// The points of their hull between two heights: those already between, and where
// each pair crosses either, which covers every edge of the hull
function between(
  points: vec3[],
  height: (p: vec3) => number,
  low: number,
  high: number,
): vec3[] {
  const h = points.map(height);
  const kept = points.filter((_, i) => h[i] >= low && h[i] <= high);
  if (kept.length === points.length) return kept;
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++)
      for (const limit of [low, high]) {
        const t = (limit - h[i]) / (h[j] - h[i]);
        if (t > 0 && t < 1)
          kept.push(vec3.lerp(vec3.create(), points[i], points[j], t));
      }
  return kept;
}

const cross2 = (o: Point, a: Point, b: Point) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

// Monotone chain
function hull(points: Point[]): Point[] {
  const sorted = points.toSorted((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const half = (list: Point[]) => {
    const out: Point[] = [];
    for (const p of list) {
      while (
        out.length >= 2 &&
        cross2(out[out.length - 2], out[out.length - 1], p) <= 0
      )
        out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half(sorted.toReversed())];
}

function clipped(shape: Point[], [x0, y0]: Point, [x1, y1]: Point): Point[] {
  const sides: [number, 0 | 1, 1 | -1][] = [
    [x0, 0, 1],
    [x1, 0, -1],
    [y0, 1, 1],
    [y1, 1, -1],
  ];
  return sides.reduce((points, [edge, axis, sign]) => {
    const inside = (p: Point) => (p[axis] - edge) * sign >= 0;
    return points.flatMap((p, i) => {
      const q = points[(i + 1) % points.length];
      const out: Point[] = inside(p) ? [p] : [];
      if (inside(p) !== inside(q)) {
        const f = (edge - p[axis]) / (q[axis] - p[axis]);
        out.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]);
      }
      return out;
    });
  }, shape);
}

// On the polygon's element in pixels, null where the polygon gets no shadow
function shadowOn(
  polygon: ReadonlyMat4,
  source: Source,
  points: vec3[],
  box: [Point, Point],
): Point[] | null {
  const origin = vec3.fromValues(polygon[12], polygon[13], polygon[14]);
  const ex = vec3.fromValues(polygon[0], polygon[1], polygon[2]);
  const ey = vec3.fromValues(polygon[4], polygon[5], polygon[6]);
  // The third column leans off the plane under a scale that isn't uniform
  const normal = vec3.normalize(
    vec3.create(),
    vec3.cross(vec3.create(), ex, ey),
  );
  if (vec3.dot(normal, [polygon[8], polygon[9], polygon[10]]) < 0)
    vec3.negate(normal, normal);
  const height = (p: vec3) =>
    vec3.dot(normal, vec3.sub(vec3.create(), p, origin));
  const top =
    "at" in source ? height(source.at) : -vec3.dot(normal, source.along);
  // A light along the plane only grazes it, and rounding leaves its cosine just off zero
  if (top <= ("at" in source ? 0 : 1e-6)) return null;
  const lit =
    "at" in source
      ? between(points, height, -top * 1e-9, top * (1 - NEAR_LIGHT))
      : between(points, height, -1e-9, Infinity);
  if (!lit.length) return null;
  // The axes can be skewed under a scale that isn't uniform
  const [xx, xy, yy] = [vec3.dot(ex, ex), vec3.dot(ex, ey), vec3.dot(ey, ey)];
  const det = xx * yy - xy * xy;
  const onPlane = lit.map((p): Point => {
    const q =
      "at" in source
        ? vec3.scaleAndAdd(
            vec3.create(),
            source.at,
            vec3.sub(vec3.create(), p, source.at),
            top / (top - height(p)),
          )
        : vec3.scaleAndAdd(vec3.create(), p, source.along, height(p) / top);
    vec3.sub(q, q, origin);
    const [qx, qy] = [vec3.dot(q, ex), vec3.dot(q, ey)];
    return [(yy * qx - xy * qy) / det, (xx * qy - xy * qx) / det];
  });
  // Corners that fly off near the light's height would blend badly, and only
  // the part over the polygon shows
  const shape = clipped(hull(onPlane), ...box);
  return shape.length >= 3 ? shape : null;
}

// Each shape the same length, starting where its previous one did, so keyframes
// interpolate between near points. A missing one shrinks to the nearest one's middle
function matched(shapes: (Point[] | null)[], cyclic: boolean): Point[][] {
  const count = Math.max(...shapes.map((s) => s?.length ?? 0));
  const middle = (s: Point[]): Point => [
    s.reduce((n, p) => n + p[0], 0) / s.length,
    s.reduce((n, p) => n + p[1], 0) / s.length,
  ];
  // A loop's last repeats its first
  const cycle = shapes.length - 1;
  const gap = (i: number, j: number) =>
    cyclic
      ? Math.min(Math.abs(i - j), cycle - Math.abs(i - j))
      : Math.abs(i - j);
  const found = shapes.flatMap((s, i) => (s ? [i] : []));
  const out: Point[][] = [];
  shapes.forEach((shape, i) => {
    if (!shape) {
      const near = found.reduce((a, b) => (gap(i, b) < gap(i, a) ? b : a));
      out.push(Array(count).fill(middle(shapes[near]!)));
      return;
    }
    const padded = Array.from(
      { length: count },
      (_, k) => shape[Math.floor((k * shape.length) / count)],
    );
    const previous = out[i - 1];
    if (!previous) {
      out.push(padded);
      return;
    }
    const cost = (shift: number) =>
      padded.reduce((sum, _, k) => {
        const p = padded[(k + shift) % count];
        return (
          sum + (p[0] - previous[k][0]) ** 2 + (p[1] - previous[k][1]) ** 2
        );
      }, 0);
    let [best, least] = [0, cost(0)];
    for (let s = 1; s < count; s++) {
      const c = cost(s);
      if (c < least) [best, least] = [s, c];
    }
    out.push(padded.map((_, k) => padded[(k + best) % count]));
  });
  return out;
}

// Nothing, one looping timeline or one hover transition, sampled at positions from 0 to 1
interface Driver {
  pose: Pose;
  positions: number[];
  kept: Set<number>;
  loop?: { timeline: Timeline; period: number };
  hover?: { timing: string; className: string };
}

const STATIC: Driver = {
  pose: () => mat4.create(),
  positions: [0],
  kept: new Set([0]),
};

// Registered so it transitions, the shadow's shape is a calc() of it
const PROGRESS = "--c3r-shadow-progress";
const progressOwner = {};
let registered = false;
const registerProgress = () => {
  if (registered) return;
  registered = true;
  insertRule(
    `@property ${PROGRESS}`,
    progressOwner,
    `{ syntax: "<number>"; inherits: false; initial-value: 0; }`,
  );
};

const hoverFollowers = new WeakMap<Tween, string>();
const followHover = (tween: Tween): string => {
  let className = hoverFollowers.get(tween);
  if (!className) {
    className = `c3r-shadow-on-${tween.className}`;
    const rule = insertRule(
      // The container runs the light's tween itself
      `.c3r-container:is(:has(.${tween.className}:hover), .${tween.className}:hover) .${className}`,
      tween,
    );
    addHoverRule(tween, rule, `${PROGRESS}: 1;`);
    hoverFollowers.set(tween, className);
  }
  return className;
};

function driverOf(tweens: readonly Tween[]): Driver {
  if (!tweens.length) return STATIC;
  const hover = tweens.map(hoverTransitionOf).find(Boolean);
  const timelines = new Set(tweens.map(timelineOf));
  if (hover ? tweens.length > 1 : timelines.size > 1)
    throw new RangeError(
      "A shadow follows one timeline or one hover transition, put its tweens on one timeline",
    );
  if (tweens.some(playsOnOwnHover))
    throw new RangeError(
      "A shadow can't follow a loop each group plays on its own hover, put it on a Timeline with hover",
    );
  if (hover) {
    registerProgress();
    const positions = Array.from(
      { length: HOVER_SAMPLES + 1 },
      (_, i) => i / HOVER_SAMPLES,
    );
    return {
      // The progress transitions with the tween's easing, so poses blend by it
      pose: (_, at) => hover.poseAt(at),
      positions,
      kept: new Set([0, 1]),
      hover: { timing: hover.timing, className: followHover(tweens[0]) },
    };
  }
  const timeline = [...timelines][0] as Timeline;
  const period = periodOf(tweens);
  const keys = tweens.flatMap((tween) => {
    const cycle = tweenCycle(tween);
    return Array.from({ length: Math.round(period / cycle) }, (_, k) =>
      tweenKeyTimes(tween).map((t) => (k * cycle + t) / period),
    ).flat();
  });
  const steps = Math.ceil(period * SAMPLES_PER_SECOND);
  const grid = Array.from({ length: steps + 1 }, (_, i) => i / steps);
  const positions = [...new Set([...grid, ...keys, 1])].toSorted(
    (a, b) => a - b,
  );
  return {
    pose: (tween, at) => tweenMatrixAt(tween, at * period),
    positions,
    kept: new Set([...keys, 0, 1]),
    loop: { timeline, period },
  };
}

function thinned(
  samples: Point[][],
  positions: readonly number[],
  kept: Set<number>,
): number[] {
  const fits = (i: number, j: number) => {
    for (let k = i + 1; k < j; k++) {
      const f = (positions[k] - positions[i]) / (positions[j] - positions[i]);
      for (let n = 0; n < samples[k].length; n++) {
        const [a, b, c] = [samples[i][n], samples[j][n], samples[k][n]];
        const off = Math.hypot(
          a[0] + (b[0] - a[0]) * f - c[0],
          a[1] + (b[1] - a[1]) * f - c[1],
        );
        if (off > TOLERANCE_PX) return false;
      }
    }
    return true;
  };
  const out = [0];
  let i = 0;
  while (i < samples.length - 1) {
    let j = i + 1;
    while (j < samples.length - 1 && !kept.has(positions[j]) && fits(i, j + 1))
      j++;
    out.push(j);
    i = j;
  }
  return out;
}

const shadowLayers = new WeakMap<
  Polygon,
  {
    element: HTMLElement;
    rules: CSSRule[];
    key: string;
    names: string[];
    timeline?: Timeline;
  }
>();
let nextId = 0;

const clear = (polygon: Polygon) => {
  const layer = shadowLayers.get(polygon);
  if (!layer) return;
  layer.element.remove();
  layer.rules.forEach(deleteRule);
  for (const name of layer.names) leaveTimeline(layer.timeline!, name);
  setFollowing(polygon);
  shadowLayers.delete(polygon);
};

export interface Receiver {
  polygon: Polygon;
  shadows: Shadows | null;
}

export function castShadows(
  candidates: readonly Receiver[],
  casters: readonly Group[],
  light: ShadowLight | null,
): void {
  const receivers: Receiver[] = [];
  const receiverChains: Object3D[][] = [];
  for (const r of candidates) {
    const chain =
      r.shadows && light && casters.length ? chainOf(r.polygon) : null;
    if (chain && !facesCamera(chain)) {
      receivers.push(r);
      receiverChains.push(chain);
    } else clear(r.polygon);
  }
  if (!light || !receivers.length) return;
  const lightTweens = "position" in light ? tweensOf(light.tween) : [];
  const casterChains = casters.map(chainOf);
  if (casterChains.some(facesCamera))
    throw new RangeError("Shadows can't follow a billboard");
  const tweensIn = (chain: readonly Object3D[]) =>
    chain.flatMap((n) => (n instanceof Group ? tweensOf(n.tween) : []));
  const shared = [...lightTweens, ...casterChains.flatMap(tweensIn)];
  // Per set of tweens, so one receiver's motion doesn't constrain another's
  const cache = new Map<string, ReturnType<typeof sample>>();
  const sample = (tweens: Tween[]) => {
    const driver = driverOf(tweens);
    const { pose, positions } = driver;
    // The one light, where it is at each position
    const lightAt = positions.map((at): Source =>
      "position" in light
        ? {
            at: vec3.transformMat4(
              vec3.create(),
              light.position,
              tweenMatrix(lightTweens, pose, at),
            ),
          }
        : { along: vec3.normalize(vec3.create(), light.direction) },
    );
    const points = casters.map((group, c) =>
      positions.map((at, i) =>
        casterPoints(
          group.shadowCaster!,
          worldAt(casterChains[c], pose, at),
          lightAt[i],
        ),
      ),
    );
    return { driver, lightAt, points };
  };
  const sampled = (tweens: Tween[]) => {
    const key = tweens.map((t) => t.className).join();
    if (!cache.has(key)) cache.set(key, sample(tweens));
    return cache.get(key)!;
  };
  receivers.forEach(({ polygon, shadows }, r) => {
    const { driver, lightAt, points } = sampled([
      ...new Set([...shared, ...tweensIn(receiverChains[r])]),
    ]);
    const { pose, positions } = driver;
    const worlds = positions.map((at) => worldAt(receiverChains[r], pose, at));
    const [width, height] = ["--c3r-width", "--c3r-height"].map((name) =>
      parseFloat(polygon.domElement.style.getPropertyValue(name)),
    );
    const blurPx =
      (shadows!.blur ?? 0) /
      Math.hypot(worlds[0][0], worlds[0][1], worlds[0][2]);
    const pad = Math.ceil(blurPx * 3);
    // Out past where the blur reaches in
    const margin = 2 * pad + 1;
    const box: [Point, Point] = [
      [-margin, -margin],
      [width + margin, height + margin],
    ];
    const layers = casters.flatMap((caster, c) => {
      // A convex caster can only darken its own faces wrongly
      if (receiverChains[r].includes(caster)) return [];
      const shapes = positions.map((_, i) =>
        shadowOn(worlds[i], lightAt[i], points[c][i], box),
      );
      // One that never reaches the polygon would only cost paint time
      if (!shapes.some(Boolean)) return [];
      const samples = matched(shapes, !driver.hover);
      const keep = thinned(samples, positions, driver.kept);
      return [keep.map((k) => ({ at: positions[k], shape: samples[k] }))];
    });
    paint(polygon, shadows!.opacity, blurPx, pad, layers, driver);
  });
}

const px = (n: number) => `${+n.toFixed(1)}px`;
const fraction = (n: number) => String(+n.toPrecision(6));

type Layer = { at: number; shape: Point[] }[];

const polygonOf = (shape: Point[], pad: number) =>
  `polygon(${shape.map(([u, v]) => `${px(u + pad)} ${px(v + pad)}`).join()})`;

// Each coordinate blended along the progress: segment k is a variable going 0
// to 1 between its samples, and adds its change in turn
function blended(layer: Layer, pad: number): string {
  const [first, ...rest] = layer;
  const segments = rest.map(
    ({ at }, k) =>
      `--c3r-shadow-${k}: clamp(0, (var(${PROGRESS}) - ${fraction(layer[k].at)}) * ${fraction(1 / (at - layer[k].at))}, 1);`,
  );
  const coordinate = (n: number, axis: 0 | 1) =>
    `calc(${[
      px(first.shape[n][axis] + pad),
      ...rest.flatMap(({ shape }, k) => {
        const change = shape[n][axis] - layer[k].shape[n][axis];
        return Math.abs(change) < 0.05
          ? []
          : [`${px(change)} * var(--c3r-shadow-${k})`];
      }),
    ].join(" + ")})`;
  const points = first.shape.map(
    (_, n) => `${coordinate(n, 0)} ${coordinate(n, 1)}`,
  );
  return `${segments.join(" ")} clip-path: polygon(${points.join()});`;
}

const keyframesOf = (layer: Layer, pad: number) =>
  layer
    .map(
      ({ at, shape }) =>
        `${+(at * 100).toFixed(3)}% { clip-path: ${polygonOf(shape, pad)}; }`,
    )
    .join(" ");

function paint(
  polygon: Polygon,
  opacity: number,
  blurPx: number,
  pad: number,
  layers: Layer[],
  { loop, hover }: Driver,
): void {
  const texts = layers.map((layer) =>
    layer.length === 1
      ? `clip-path: ${polygonOf(layer[0].shape, pad)};`
      : loop
        ? keyframesOf(layer, pad)
        : `transition: ${PROGRESS} ${hover!.timing}; ${blended(layer, pad)}`,
  );
  const driverName = loop?.timeline.className ?? hover?.className;
  const key = `${opacity} ${blurPx} ${pad} ${loop?.period} ${driverName}\n${texts.join("\n")}`;
  if (shadowLayers.get(polygon)?.key === key) return;
  clear(polygon);
  if (!layers.length) return;
  const element = document.createElement("div");
  element.className = "c3r-shadow";
  element.style.opacity = String(opacity);
  if (blurPx) element.style.filter = `blur(${px(blurPx)})`;
  const rules: CSSRule[] = [];
  const names: string[] = [];
  layers.forEach((layer, i) => {
    const div = document.createElement("div");
    let body = texts[i];
    if (layer.length > 1 && loop) {
      const name = `c3r-shadow-${nextId++}`;
      rules.push(insertRule(`@keyframes ${name}`, polygon, `{ ${body} }`));
      joinTimeline(loop.timeline, name);
      names.push(name);
      div.className = loop.timeline.className;
      body = `animation: ${name} ${loop.period}s linear infinite var(${loop.timeline.state});`;
    } else if (layer.length > 1) {
      div.className = hover!.className;
    }
    div.setAttribute("style", `inset: ${-pad}px; ${body}`);
    element.append(div);
  });
  polygon.contentElement.parentElement!.append(element);
  if (names.length) setFollowing(polygon, loop!.timeline);
  shadowLayers.set(polygon, {
    element,
    rules,
    key,
    names,
    timeline: loop?.timeline,
  });
}
