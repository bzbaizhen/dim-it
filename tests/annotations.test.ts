import assert from "node:assert/strict";
import test from "node:test";
import { initialData, validateData } from "../src/core.ts";
import {
  annotationLocal,
  annotationPoint,
  fitAnnotationToPage,
  markupStyle,
  revisionCloudPath,
  wrapAnnotationText,
  type Markup,
} from "../src/annotations.ts";

const markup: Markup = {
  id: "text-1",
  kind: "markup",
  page: 1,
  origin: { x: 50, y: 400 },
  width: 180,
  height: 70,
  rotation: 0,
  note: "复核门洞尺寸\nCheck opening",
  color: "#d24a3e",
  fontSize: 14,
};

test("annotation coordinates round-trip in all page orientations and stay within crop bounds", () => {
  for (const rotation of [0, 90, 180, 270]) {
    const item = { ...markup, rotation };
    assert.deepEqual(annotationLocal(item, annotationPoint(item, 30, 20)), {
      x: 30,
      y: 20,
    });
    const fitted = fitAnnotationToPage(item, [20, 30, 620, 430]);
    for (const [x, y] of [
      [0, 0],
      [fitted.width, fitted.height],
    ]) {
      const point = annotationPoint(fitted, x, y);
      assert.ok(point.x >= 20 && point.x <= 620);
      assert.ok(point.y >= 30 && point.y <= 430);
    }
  }
});

test("markup appearance preserves legacy defaults and validates independent channels", () => {
  const legacy = markupStyle(markup);
  assert.deepEqual(legacy, {
    textColor: markup.color,
    textOpacity: 1,
    backgroundColor: "#ffffff",
    backgroundOpacity: 0.94,
    borderColor: markup.color,
    borderOpacity: 1,
  });
  const style = {
    ...legacy,
    textColor: "#123456",
    textOpacity: 0.5,
    backgroundColor: "#ffeebb",
    backgroundOpacity: 0,
    borderColor: "#0000ff",
    borderOpacity: 1,
  };
  const styled = { ...markup, style };
  assert.deepEqual(markupStyle(styled), style);
  assert.deepEqual(
    validateData({ ...initialData(), annotations: [styled] }, 1).annotations,
    [styled],
  );
  for (const channel of ["text", "background", "border"] as const) {
    for (const value of [-0.01, 1.01, NaN, Infinity, "0.5", null]) {
      assert.throws(() =>
        validateData(
          {
            ...initialData(),
            annotations: [
              { ...styled, style: { ...style, [`${channel}Opacity`]: value } },
            ],
          },
          1,
        ),
      );
    }
    for (const value of ["red", "#abc", "#123456ff", null]) {
      assert.throws(() =>
        validateData(
          {
            ...initialData(),
            annotations: [
              { ...styled, style: { ...style, [`${channel}Color`]: value } },
            ],
          },
          1,
        ),
      );
    }
  }
  for (const value of [null, {}, { textColor: "#000000" }]) {
    assert.throws(() =>
      validateData(
        { ...initialData(), annotations: [{ ...markup, style: value }] },
        1,
      ),
    );
  }
});

test("project validation restores legacy data and checks annotations without calibration", () => {
  const legacy = initialData();
  delete (legacy as Partial<typeof legacy>).annotations;
  assert.deepEqual(validateData(legacy, 1).annotations, []);
  const data = {
    ...initialData(),
    annotations: [
      markup,
      {
        ...markup,
        id: "revision-1",
        kind: "revision" as const,
        label: "A1",
      },
    ],
  };
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(data)), 1), data);
  for (const invalid of [
    { ...markup, rotation: 45 },
    { ...markup, fontSize: 0 },
    { ...markup, width: NaN },
    { ...markup, page: 2 },
    { ...markup, origin: { x: Infinity, y: 0 } },
    { ...markup, kind: "revision", label: "" },
    { ...markup, kind: "revision", label: "123456789" },
    { ...markup, note: "x".repeat(4001) },
  ])
    assert.throws(() => validateData({ ...data, annotations: [invalid] }, 1));
  assert.throws(() =>
    validateData({ ...data, annotations: [markup, markup] }, 1),
  );
});

test("markup wrapping preserves paragraphs, wraps words and breaks CJK and long tokens", () => {
  const measure = (text: string) => [...text].length * 10;
  assert.deepEqual(
    wrapAnnotationText("Check the opening\n复核门洞尺寸", 70, measure),
    ["Check", "the", "opening", "复核门洞尺寸"],
  );
  assert.deepEqual(
    wrapAnnotationText("abcdefghij\n\n中文测试换行", 40, measure),
    ["abcd", "efgh", "ij", "", "中文测试", "换行"],
  );
});

test("revision clouds form closed, bounded-complexity paths", () => {
  assert.equal(revisionCloudPath(0, 100), "");
  assert.equal(revisionCloudPath(100, 0), "");
  const path = revisionCloudPath(200, 100);
  assert.ok(path.startsWith("M 0 0 Q "));
  assert.ok(path.endsWith(" Z"));
  assert.ok(!/NaN|Infinity/.test(path));
  assert.equal(
    (revisionCloudPath(100000, 100000).match(/ Q /g) || []).length,
    400,
  );
});
