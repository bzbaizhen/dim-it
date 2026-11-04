import type { PointerEvent } from "react";
import type { Point, RegionFill } from "./core";
import {
  regionVertices,
  isValidRegionGeometry,
  validPolygon,
} from "./regions.ts";
import { t } from "./i18n.ts";

export default function RegionLayer({
  regions,
  selected,
  preview,
  draft,
  cursor,
  screen,
  canSelect,
  onSelect,
  color,
  opacity,
}: {
  regions: RegionFill[];
  selected: string | null;
  preview: RegionFill | null;
  draft: Point[];
  cursor: Point | null;
  screen: (point: Point) => Point;
  canSelect: boolean;
  onSelect: (id: string) => void;
  color: string;
  opacity: number;
}) {
  const pointsText = (points: Point[]) =>
    points
      .map(screen)
      .map((point) => `${point.x},${point.y}`)
      .join(" ");
  const painted = (region: RegionFill, isPreview = false) => (
    <polygon
      key={region.id}
      data-testid={isPreview ? "region-preview" : "region"}
      data-region-id={region.id}
      data-kind={region.kind}
      points={pointsText(regionVertices(region))}
      className={`region-shape ${selected === region.id ? "selected" : ""} ${isPreview && !isValidRegionGeometry(region) ? "invalid" : ""}`}
      fill={region.color}
      fillOpacity={region.opacity}
      stroke={region.color}
      strokeOpacity={selected === region.id ? 1 : region.opacity}
      style={{ mixBlendMode: "multiply" }}
      pointerEvents={!isPreview && canSelect ? "visiblePainted" : "none"}
      onPointerDown={(event) => {
        if (event.button === 0 && canSelect) {
          event.stopPropagation();
          onSelect(region.id);
        }
      }}
    />
  );
  const last = draft[draft.length - 1];
  const draftPoints =
    cursor &&
    last &&
    Math.hypot(cursor.x - last.x, cursor.y - last.y) > 0.001 &&
    Math.hypot(cursor.x - draft[0].x, cursor.y - draft[0].y) > 0.001
      ? [...draft, cursor]
      : draft;
  return (
    <>
      <g className="region-layer">
        {regions.map((region) =>
          painted(preview?.id === region.id ? preview : region),
        )}
        {preview?.id === "draft" && painted(preview, true)}
      </g>
      {!!draft.length && (
        <g className="region-draft" pointerEvents="none">
          <polygon
            points={pointsText(draftPoints)}
            fill={color}
            fillOpacity={opacity}
            stroke={
              draftPoints.length >= 3 && !validPolygon(draftPoints)
                ? "#d24a3e"
                : color
            }
            strokeDasharray="5 4"
          />
          {draft.map((point, index) => {
            const p = screen(point);
            return (
              <circle
                key={index}
                cx={p.x}
                cy={p.y}
                r={index === 0 ? 5 : 3}
                fill="white"
                stroke={color}
              />
            );
          })}
        </g>
      )}
    </>
  );
}

export function RegionHandles({
  region,
  screen,
  onVertexDown,
}: {
  region: RegionFill;
  screen: (point: Point) => Point;
  onVertexDown: (
    event: PointerEvent<SVGCircleElement>,
    region: RegionFill,
    index: number,
  ) => void;
}) {
  return (
    <g className="region-handles">
      {regionVertices(region).map((point, index) => {
        const p = screen(point);
        return (
          <circle
            key={index}
            data-testid="region-vertex"
            aria-label={`${t("区域顶点")} ${index + 1}`}
            cx={p.x}
            cy={p.y}
            r={5}
            fill="white"
            stroke={region.color}
            onPointerDown={(event) => onVertexDown(event, region, index)}
          />
        );
      })}
    </g>
  );
}
