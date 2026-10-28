import { expect, it } from "vitest";
import { Container, ElementObject, Material } from "c3r";

it("keeps the element's own styles over the material defaults", () => {
  const style = document.createElement("style");
  style.textContent =
    ".card { background-color: rgb(255, 0, 0); opacity: 0.5 }";
  document.head.append(style);

  const container = new Container();
  document.body.append(container.domElement);

  const card = document.createElement("div");
  card.className = "card";
  container.root.addChild(new ElementObject(card));

  const plain = new ElementObject(document.createElement("div"));
  plain.material = new Material();
  plain.material.background = [0, 0, 1, 1];
  container.root.addChild(plain);

  const computed = getComputedStyle(card);
  expect([computed.backgroundColor, computed.opacity]).toEqual([
    "rgb(255, 0, 0)",
    "0.5",
  ]);
  expect(getComputedStyle(plain.element).backgroundColor).toBe(
    "rgb(0, 0, 255)",
  );
});
