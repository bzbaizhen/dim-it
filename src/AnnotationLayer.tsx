import type { PointerEvent } from "react";
import type { Point } from "./core";
import {
  annotationPoint,
  annotationFont,
  markupLines,
  markupStyle,
  revisionCloudPath,
  revisionTag,
  textPadding,
  type DrawingAnnotation,
} from "./annotations.ts";
import { t } from "./i18n.ts";

export default function AnnotationLayer({
  annotations,
  selected,
  preview,
  screen,
  canSelect,
  zoom,
  onGesture,
  onEdit,
}: {
  annotations: DrawingAnnotation[];
  selected: string | null;
  preview: DrawingAnnotation | null;
  screen: (point: Point) => Point;
  canSelect: boolean;
  zoom: number;
  onGesture: (
    event: PointerEvent<SVGElement>,
    item: DrawingAnnotation,
    corner?: number,
  ) => void;
  onEdit: (id: string) => void;
}) {
  const items =
    preview?.id === "draft" ? [...annotations, preview] : annotations;
  return (
    <g className="annotation-layer">
      {items.map((saved) => {
        const item = preview?.id === saved.id ? preview : saved;
        const origin = screen(item.origin);
        const right = screen(annotationPoint(item, 1, 0));
        const down = screen(annotationPoint(item, 0, 1));
        const active = selected === item.id && canSelect;
        const style = item.kind === "markup" ? markupStyle(item) : null;
        const tag =
          item.kind === "revision" && item.width >= 40 && item.height >= 40
            ? revisionTag(item)
            : null;
        return (
          <g
            key={item.id}
            data-testid={
              item.id === "draft" ? "annotation-preview" : "drawing-annotation"
            }
            data-kind={item.kind}
            data-annotation-id={item.id}
            className={`drawing-annotation ${active ? "selected" : ""}`}
            transform={`matrix(${right.x - origin.x} ${right.y - origin.y} ${down.x - origin.x} ${down.y - origin.y} ${origin.x} ${origin.y})`}
            style={{ color: item.color, fontFamily: annotationFont }}
            pointerEvents={canSelect && item.id !== "draft" ? "auto" : "none"}
            onPointerDown={(event) => onGesture(event, item)}
            onDoubleClick={(event) => {
              if (!canSelect) return;
              event.stopPropagation();
              onEdit(item.id);
            }}
          >
            {item.kind === "markup" ? (
              <>
                <rect
                  width={item.width}
                  height={item.height}
                  fill={style!.backgroundColor}
                  fillOpacity={style!.backgroundOpacity}
                  stroke={style!.borderColor}
                  strokeOpacity={style!.borderOpacity}
                  strokeWidth="1"
                />
                <text
                  pointerEvents="none"
                  fill={style!.textColor}
                  fillOpacity={style!.textOpacity}
                  fontSize={item.fontSize}
                >
                  {markupLines(item).map((line, i) => (
                    <tspan
                      key={i}
                      x={textPadding}
                      y={textPadding + item.fontSize * (1 + i * 1.4)}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
              </>
            ) : (
              <>
                <rect
                  width={item.width}
                  height={item.height}
                  fill="transparent"
                />
                <path
                  d={revisionCloudPath(item.width, item.height)}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity={item.opacity ?? 1}
                  strokeWidth="1.5"
                />
                {tag && (
                  <g transform={`translate(${tag.x} ${tag.y})`}>
                    <path
                      d={`M ${tag.width / 2} 0 L ${tag.width} ${tag.height} L 0 ${tag.height} Z`}
                      fill="white"
                      stroke="currentColor"
                      fillOpacity={item.opacity ?? 1}
                      strokeOpacity={item.opacity ?? 1}
                      strokeWidth="1.2"
                    />
                    <text
                      x={tag.width / 2}
                      y="22"
                      textAnchor="middle"
                      fill="currentColor"
                      fillOpacity={item.opacity ?? 1}
                      fontSize={tag.fontSize}
                    >
                      {item.label}
                    </text>
                  </g>
                )}
              </>
            )}
            {active && (
              <g className="annotation-handles">
                <rect
                  width={item.width}
                  height={item.height}
                  fill="none"
                  stroke="currentColor"
                  strokeDasharray={`${4 / zoom} ${3 / zoom}`}
                  strokeWidth={1 / zoom}
                  pointerEvents="none"
                />
                {[
                  [0, 0],
                  [item.width, 0],
                  [item.width, item.height],
                  [0, item.height],
                ].map(([x, y], corner) => (
                  <circle
                    key={corner}
                    data-testid="annotation-handle"
                    aria-label={t`标注控制点 ${corner + 1}`}
                    cx={x}
                    cy={y}
                    r={4 / zoom}
                    fill="white"
                    stroke="currentColor"
                    strokeWidth={1.5 / zoom}
                    onPointerDown={(event) => onGesture(event, item, corner)}
                  />
                ))}
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
