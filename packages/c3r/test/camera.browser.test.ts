import { expect, it } from "vitest";
import { Container, OrthographicCamera, PerspectiveCamera } from "c3r";

it("resolves the camera projections from styles.css", () => {
  const container = new Container();
  document.body.append(container.domElement);
  container.setSize(400, 300);

  const view = () =>
    new DOMMatrix(getComputedStyle(container.viewElement).transform);
  const perspective = () => getComputedStyle(container.domElement).perspective;

  // scale 400 / 800, center at x = 300
  container.camera = new OrthographicCamera(-100, 700, 150, -150);
  expect([view().m11, view().m22, view().m41]).toEqual([0.5, -1, -150]);
  expect(perspective()).toBe("none");

  // 300 / 2 / tan(45deg)
  container.camera = new PerspectiveCamera(90);
  expect(perspective()).toBe("150px");
  expect([view().m22, view().m43]).toEqual([-1, 150]);
});
