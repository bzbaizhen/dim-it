import RegionLayer, { RegionHandles } from "./RegionLayer";
import {
  validPolygon,
  isValidRegionGeometry,
  resizeRegionVertex,
} from "./regions.ts";
import {
  commandRegistry,
  chordFromEvent,
  matchCommand,
  useShortcuts,
  commandLabel,
  type CommandId,
} from "./shortcuts.ts";
import ShortcutSettings from "./ShortcutSettings";
import { pathLength, pathMidpoint } from "./curve.ts";
import { t, useLanguage, setLanguage } from "./i18n.ts";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  FilePlus2,
  FolderOpen,
  Hand,
  HelpCircle,
  Maximize,
  Magnet,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  RotateCw,
  Ruler,
  PaintBucket,
  Keyboard,
  Spline,
  Save,
  ScanLine,
  ShieldCheck,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import type { PDFDocumentProxy, PageViewport, RenderTask } from "pdfjs-dist";
import {
  base64ToBytes,
  bytesToBase64,
  distance,
  formatDistance,
  initialData,
  makeCalibration,
  measurementCSV,
  measurementMM,
  parseDistance,
  validateData,
  type Measurement,
  type RegionFill,
  type Point,
  type ProjectData,
  type Unit,
} from "./core";
import {
  createDemo,
  exportPDF,
  openPDF,
  loadSnapIndex,
  setThinLines,
} from "./pdf";
import { loadAutosave, saveAutosave } from "./storage";
import QuickStart, { shouldShowQuickStart } from "./QuickStart";
import type { SnapHit, SnapIndex } from "./snap";
import {
  captureSmartPoint,
  nearestTrackingPoint,
  samePoint,
  SMART_POINT_DELAY,
  type OrthoConstraint,
  type TrackHit,
} from "./snap";

type Tool = "select" | "pan" | "calibrate" | "measure" | "curve" | "fill";
type DocumentState = { pdf: PDFDocumentProxy; bytes: Uint8Array; name: string };
const unitLabels: Record<Unit, string> = {
  mm: "毫米 mm",
  in: "英寸 inch",
  ft: "英尺 feet",
  "ft-in": "英尺 + 英寸",
};
const colors = ["#187bc1", "#d24a3e", "#198267", "#9b5bc2"];
const snapLabels = { endpoint: "端点", midpoint: "中点", intersection: "交点" };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function Thumbnail({
  pdf,
  page,
  active,
  calibrated,
  count,
  onSelect,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  active: boolean;
  calibrated: boolean;
  count: number;
  onSelect: () => void;
}) {
  useLanguage();
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let canceled = false;
    let task: RenderTask | undefined;
    void pdf
      .getPage(page)
      .then(async (item) => {
        if (canceled || !canvas.current) return;
        const original = item.getViewport({ scale: 1 });
        const viewport = item.getViewport({
          scale: Math.min(136 / original.width, 102 / original.height) * 1.5,
        });
        canvas.current.width = viewport.width;
        canvas.current.height = viewport.height;
        task = item.render({ canvas: canvas.current, viewport });
        await task.promise;
      })
      .catch(() => {});
    return () => {
      canceled = true;
      task?.cancel();
    };
  }, [pdf, page]);
  return (
    <button
      className={`thumbnail ${active ? "active" : ""}`}
      onClick={onSelect}
      aria-label={t`第 ${page} 页`}
      aria-current={active ? "page" : undefined}
    >
      <div className="thumbnail-paper">
        <canvas ref={canvas} />
        {count > 0 && <span className="count-badge">{count}</span>}
      </div>
      <span>
        <b>{String(page).padStart(2, "0")}</b>
        <small>{calibrated ? t("已校准") : t("未校准")}</small>
        {calibrated && <Check size={12} />}
      </span>
    </button>
  );
}

export default function App() {
  const language = useLanguage();
  const isMac = /Mac/i.test(navigator.platform);
  const shortcuts = useShortcuts(isMac, language);
  const [thinLines, setThinLinesEnabled] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [capturingShortcut, setCapturingShortcut] = useState(false);
  useEffect(() => {
    window.document.documentElement.lang = language === "en" ? "en" : "zh-CN";
    window.document.title =
      language === "en"
        ? "Dim It · PDF Drawing Workbench"
        : "Dim It · PDF 图纸工作台";
    window.desktop?.setLanguage(language);
  }, [language]);
  const [document, setDocument] = useState<DocumentState | null>(null);
  const [data, setData] = useState<ProjectData>(initialData);
  const dataRef = useRef(data);
  dataRef.current = data;
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [rendered, setRendered] = useState(false);
  const [tool, setTool] = useState<Tool>("pan");
  const [curveHit, setCurveHit] = useState<Point[] | null>(null);
  const [regionDraft, setRegionDraft] = useState<Point[]>([]);
  const regionDraftRef = useRef(regionDraft);
  regionDraftRef.current = regionDraft;
  const [regionPreview, setRegionPreview] = useState<RegionFill | null>(null);
  const [fillStyle, setFillStyle] = useState({
    color: colors[0],
    opacity: 0.25,
  });
  const regionGesture = useRef<
    | null
    | {
        kind: "start" | "rectangle" | "polygon";
        start: Point;
        client: Point;
        next: Point;
      }
    | { kind: "vertex"; original: RegionFill; index: number; next: RegionFill }
  >(null);
  const lastRegionCompletion = useRef<{ point: Point; time: number } | null>(
    null,
  );
  const pendingMeasureTool = useRef<"measure" | "curve" | null>(null);
  const [opacityPreview, setOpacityPreview] = useState<number | null>(null);
  const opacityChange = useRef<{ id: string; value: number } | null>(null);
  const [anchor, setAnchor] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapHit, setSnapHit] = useState<SnapHit | null>(null);
  const [altPressed, setAltPressed] = useState(false);
  const [shiftPressed, setShiftPressed] = useState(false);
  const [smartPoints, setSmartPoints] = useState<SnapHit[]>([]);
  const [trackingCandidate, setTrackingCandidate] = useState<SnapHit | null>(
    null,
  );
  const [trackHit, setTrackHit] = useState<TrackHit | null>(null);
  const lastPointer = useRef<Point | null>(null);
  const [snapGeometry, setSnapGeometry] = useState<{
    pdf: PDFDocumentProxy;
    page: number;
    index: SnapIndex | null;
    status: "ready" | "empty" | "error";
  } | null>(null);
  const snapCache = useRef(
    new WeakMap<PDFDocumentProxy, Map<number, SnapIndex>>(),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [calibrationPoints, setCalibrationPoints] = useState<
    [Point, Point] | null
  >(null);
  const [calibrationValue, setCalibrationValue] = useState("");
  const [calibrationUnit, setCalibrationUnit] = useState<Unit>("mm");
  const [calibrationError, setCalibrationError] = useState("");
  const [history, setHistory] = useState<{
    past: ProjectData[];
    future: ProjectData[];
  }>({ past: [], future: [] });
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [autosave, setAutosave] = useState("");
  const [fileDirty, setFileDirty] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [help, setHelp] = useState(shouldShowQuickStart);
  const [space, setSpace] = useState(false);
  const [color, setColor] = useState(colors[0]);
  const [ready, setReady] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const detailCanvas = useRef<HTMLCanvasElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const activeDocument = useRef<DocumentState | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const zoomAnchor = useRef<{
    x: number;
    y: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const operation = useRef(false);
  const revision = useRef(0);
  const rotation = data.rotations[page] || 0;
  const scale = data.scales[page];
  const snapContext =
    snapGeometry?.pdf === document?.pdf && snapGeometry?.page === page
      ? snapGeometry
      : null;
  const snapStatus = snapContext?.status || "loading";
  const pageMeasurements = data.measurements.filter(
    (item) => item.page === page,
  );
  const selectedMeasurement = data.measurements.find(
    (item) => item.id === selected,
  );
  const pageRegions = data.regions.filter((item) => item.page === page);
  const selectedRegion = data.regions.find((item) => item.id === selected);
  const selectedAnnotation = selectedRegion || selectedMeasurement;
  const pickAnchor =
    tool === "fill" ? regionDraft[regionDraft.length - 1] || null : anchor;
  const trackingActive =
    !!pickAnchor &&
    shiftPressed &&
    snapEnabled &&
    !space &&
    !altPressed &&
    !calibrationPoints &&
    (tool === "calibrate" || tool === "measure" || tool === "fill");

  const notify = useCallback(
    (text: string, error = false) => setNotice({ text, error }),
    [],
  );
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(
        () => setNotice(null),
        notice.error ? 9000 : 4000,
      );
      return () => clearTimeout(timer);
    }
  }, [notice]);

  function change(next: ProjectData) {
    const previous = dataRef.current;
    setHistory((current) => ({
      past: [...current.past.slice(-79), previous],
      future: [],
    }));
    dataRef.current = next;
    setData(next);
    revision.current++;
    setFileDirty(true);
  }

  function undo() {
    if (!history.past.length) return;
    const previous = history.past[history.past.length - 1];
    setHistory({
      past: history.past.slice(0, -1),
      future: [data, ...history.future],
    });
    setData(previous);
    revision.current++;
    setFileDirty(true);
    setAnchor(null);
  }

  function redo() {
    if (!history.future.length) return;
    setHistory({
      past: [...history.past, data],
      future: history.future.slice(1),
    });
    setData(history.future[0]);
    revision.current++;
    setFileDirty(true);
  }

  const fit = useCallback(
    async (
      pdf: PDFDocumentProxy,
      number: number,
      rotations: ProjectData["rotations"],
    ) => {
      const item = await pdf.getPage(number);
      const base = item.getViewport({
        scale: 1,
        rotation: (item.rotate + (rotations[number] || 0)) % 360,
      });
      if (!stage.current) return;
      zoomAnchor.current = null;
      setZoom(
        Math.max(
          0.03,
          Math.min(
            (stage.current.clientWidth - 88) / base.width,
            (stage.current.clientHeight - 88) / base.height,
            4,
          ),
        ),
      );
      stage.current.scrollTo(0, 0);
    },
    [],
  );

  useEffect(() => {
    let canceled = false;
    void loadAutosave()
      .then(async (saved) => {
        if (!saved || canceled) return;
        const pdf = await openPDF(saved.bytes);
        if (canceled) {
          void pdf.loadingTask.destroy();
          return;
        }
        const restored = validateData(saved.data, pdf.numPages);
        const restoredPage =
          Number.isInteger(saved.page) &&
          saved.page >= 1 &&
          saved.page <= pdf.numPages
            ? saved.page
            : 1;
        const doc = { pdf, bytes: saved.bytes, name: saved.filename };
        activeDocument.current = doc;
        setDocument(doc);
        setData(restored);
        setPage(restoredPage);
        setFileDirty(true);
        await fit(pdf, restoredPage, restored.rotations);
        notify(t("已恢复上次的图纸、校准和标注"));
      })
      .catch((error) =>
        notify(t`本地恢复失败，可重新打开 PDF。${errorMessage(error)}`, true),
      )
      .finally(() => {
        if (!canceled) setReady(true);
      });
    return () => {
      canceled = true;
    };
  }, [fit, notify]);

  useEffect(() => {
    if (!document || !ready) return;
    let canceled = false;
    setAutosave("保存中");
    const timer = setTimeout(() => {
      void saveAutosave({
        filename: document.name,
        bytes: document.bytes,
        data,
        page,
      })
        .then(() => {
          if (!canceled) setAutosave("已本地保存");
        })
        .catch(() => {
          if (!canceled) setAutosave("自动保存失败，请保存项目文件");
        });
    }, 350);
    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [document, data, page, ready]);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (fileDirty && autosave !== "已本地保存") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [fileDirty, autosave]);

  useEffect(() => {
    setAnchor(null);
    setCursor(null);
    setCurveHit(null);
    lastPointer.current = null;
  }, [page, tool, rotation, document]);

  useEffect(() => {
    setRegionDraft([]);
    regionDraftRef.current = [];
    setRegionPreview(null);
    regionGesture.current = null;
  }, [page, tool, document]);

  useEffect(() => {
    setSmartPoints([]);
    setTrackingCandidate(null);
    setTrackHit(null);
  }, [pickAnchor, page, tool, rotation, document, snapEnabled]);

  useEffect(() => {
    if (
      !trackingActive ||
      !trackingCandidate ||
      smartPoints.some((item) => samePoint(item.point, trackingCandidate.point))
    )
      return;
    const timer = setTimeout(
      () =>
        setSmartPoints((points) =>
          captureSmartPoint(points, trackingCandidate),
        ),
      SMART_POINT_DELAY,
    );
    return () => clearTimeout(timer);
  }, [trackingCandidate, trackingActive, smartPoints]);

  useEffect(() => {
    if ((tool === "measure" || tool === "curve") && !scale) {
      pendingMeasureTool.current = tool;
      setTool("calibrate");
    }
  }, [tool, scale]);

  useEffect(() => {
    setSelected(null);
  }, [page, document]);

  useEffect(() => {
    setSnapHit(null);
    setCurveHit(null);
    setTrackHit(null);
    setTrackingCandidate(null);
  }, [
    document,
    page,
    tool,
    rotation,
    viewport,
    snapEnabled,
    space,
    altPressed,
    calibrationPoints,
  ]);

  useEffect(() => {
    if (!document) return;
    let canceled = false;
    let pages = snapCache.current.get(document.pdf);
    if (!pages) {
      pages = new Map();
      snapCache.current.set(document.pdf, pages);
    }
    const cache = pages;
    const cached = cache.get(page);
    const pending = cached
      ? Promise.resolve(cached)
      : loadSnapIndex(document.pdf, page);
    void pending
      .then((index) => {
        if (canceled) return;
        cache.delete(page);
        cache.set(page, index);
        if (cache.size > 3) cache.delete(cache.keys().next().value!);
        setSnapGeometry({
          pdf: document.pdf,
          page,
          index,
          status:
            index.segments.length || index.curves.paths.length
              ? "ready"
              : "empty",
        });
      })
      .catch(() => {
        if (!canceled)
          setSnapGeometry({
            pdf: document.pdf,
            page,
            index: null,
            status: "error",
          });
      });
    return () => {
      canceled = true;
    };
  }, [document, page]);

  useEffect(() => {
    if (!document || !canvas.current) return;
    let canceled = false;
    let task: RenderTask | undefined;
    setThinLines(document.pdf, thinLines);
    setRendered(false);
    void document.pdf
      .getPage(page)
      .then(async (item) => {
        if (canceled || !canvas.current) return;
        const view = item.getViewport({
          scale: zoom,
          rotation: (item.rotate + rotation) % 360,
        });
        const pixelRatio = Math.min(
          window.devicePixelRatio || 1,
          2,
          Math.sqrt(16000000 / (view.width * view.height)),
        );
        canvas.current.width = Math.ceil(view.width * pixelRatio);
        canvas.current.height = Math.ceil(view.height * pixelRatio);
        setViewport(view);
        task = item.render({
          canvas: canvas.current,
          viewport: view,
          transform: [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        await task.promise;
        if (!canceled) setRendered(true);
      })
      .catch((error) => {
        if (!canceled) notify(t`图纸渲染失败。${errorMessage(error)}`, true);
      });
    return () => {
      canceled = true;
      task?.cancel();
    };
  }, [document, page, zoom, rotation, thinLines, notify]);

  useEffect(() => {
    const element = detailCanvas.current;
    const container = stage.current;
    if (!element || !container || !viewport || !document) return;
    let canceled = false;
    let task: RenderTask | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let generation = 0;
    const refresh = () => {
      clearTimeout(timer);
      task?.cancel();
      element.style.visibility = "hidden";
      const request = ++generation;
      if (zoom <= 1.25) return;
      // Render the visible region at full resolution even when the full sheet exceeds the canvas pixel budget.
      timer = setTimeout(() => {
        void document.pdf
          .getPage(page)
          .then(async (item) => {
            if (canceled || request !== generation || !paper.current) return;
            const bounds = paper.current.getBoundingClientRect();
            const windowBounds = container.getBoundingClientRect();
            const x = Math.max(0, windowBounds.left - bounds.left - 160);
            const y = Math.max(0, windowBounds.top - bounds.top - 160);
            const width = Math.max(
              1,
              Math.min(viewport.width - x, container.clientWidth + 320),
            );
            const height = Math.max(
              1,
              Math.min(viewport.height - y, container.clientHeight + 320),
            );
            const ratio = Math.min(window.devicePixelRatio || 1, 2);
            element.width = Math.ceil(width * ratio);
            element.height = Math.ceil(height * ratio);
            Object.assign(element.style, {
              left: `${x}px`,
              top: `${y}px`,
              width: `${width}px`,
              height: `${height}px`,
            });
            task = item.render({
              canvas: element,
              viewport,
              transform: [ratio, 0, 0, ratio, -x * ratio, -y * ratio],
            });
            await task.promise;
            if (!canceled && request === generation)
              element.style.visibility = "visible";
          })
          .catch((error) => {
            if (!canceled && error?.name !== "RenderingCancelledException")
              notify(t`局部高清渲染失败。${errorMessage(error)}`, true);
          });
      }, 120);
    };
    refresh();
    container.addEventListener("scroll", refresh, { passive: true });
    window.addEventListener("resize", refresh);
    return () => {
      canceled = true;
      clearTimeout(timer);
      task?.cancel();
      container.removeEventListener("scroll", refresh);
      window.removeEventListener("resize", refresh);
    };
  }, [document, page, viewport, zoom, thinLines, notify]);

  useLayoutEffect(() => {
    const saved = zoomAnchor.current;
    if (!saved || !paper.current || !stage.current || !viewport) return;
    const rect = paper.current.getBoundingClientRect();
    stage.current.scrollLeft +=
      rect.left + saved.x * viewport.width - saved.clientX;
    stage.current.scrollTop +=
      rect.top + saved.y * viewport.height - saved.clientY;
    zoomAnchor.current = null;
  }, [viewport]);

  function setZoomAt(next: number, clientX?: number, clientY?: number) {
    if (!paper.current || !stage.current || !viewport) return;
    next = Math.min(8, Math.max(0.03, next));
    if (Math.abs(next - zoom) < 0.00001) return;
    const rect = paper.current.getBoundingClientRect();
    const stageRect = stage.current.getBoundingClientRect();
    const x = clientX ?? stageRect.left + stage.current.clientWidth / 2;
    const y = clientY ?? stageRect.top + stage.current.clientHeight / 2;
    zoomAnchor.current = {
      x: (x - rect.left) / viewport.width,
      y: (y - rect.top) / viewport.height,
      clientX: x,
      clientY: y,
    };
    setZoom(next);
  }

  // A non-passive listener keeps trackpad zoom inside the drawing.
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (!document || !viewport) return;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        setZoomAt(
          zoom * Math.exp(-event.deltaY * 0.008),
          event.clientX,
          event.clientY,
        );
      }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  });

  async function acceptFile(name: string, bytes: Uint8Array, demo = false) {
    if (operation.current) return;
    if (
      fileDirty &&
      document &&
      !window.confirm(
        t(
          "当前图纸尚未另存为项目文件。打开新文件会替换自动恢复记录，继续打开？",
        ),
      )
    )
      return;
    operation.current = true;
    setBusy(t("正在打开图纸"));
    let candidate: PDFDocumentProxy | undefined;
    try {
      let pdfBytes = bytes;
      let filename = name;
      let next = initialData();
      if (name.toLowerCase().endsWith(".planmeasure")) {
        const project = JSON.parse(new TextDecoder().decode(bytes));
        if (
          ![1, 2, 3].includes(project.version) ||
          typeof project.pdf !== "string" ||
          typeof project.filename !== "string"
        )
          throw new Error(t("不支持的项目格式"));
        pdfBytes = base64ToBytes(project.pdf);
        filename = project.filename;
        candidate = await openPDF(pdfBytes);
        next = validateData(project.data, candidate.numPages);
      } else {
        candidate = await openPDF(pdfBytes);
      }
      const old = activeDocument.current;
      const doc = { pdf: candidate, bytes: pdfBytes, name: filename };
      activeDocument.current = doc;
      setDocument(doc);
      setData(next);
      dataRef.current = next;
      setHistory({ past: [], future: [] });
      setPage(1);
      setViewport(null);
      setCalibrationPoints(null);
      setHelp(false);
      setExportMenu(false);
      setTool("pan");
      setFileDirty(false);
      revision.current++;
      await fit(candidate, 1, next.rotations);
      // Let the previous render effect cancel before destroying its worker.
      if (old)
        setTimeout(() => {
          void old.pdf.loadingTask.destroy();
        }, 100);
      notify(
        demo
          ? t("示例已打开，点击「校准比例」开始")
          : t`已打开 ${candidate.numPages} 页图纸`,
      );
    } catch (error) {
      if (candidate && candidate !== activeDocument.current?.pdf)
        void candidate.loadingTask.destroy();
      notify(t`打开失败，原图纸保留。${errorMessage(error)}`, true);
    } finally {
      setBusy("");
      operation.current = false;
    }
  }

  async function openFile() {
    if (window.desktop) {
      try {
        const result = await window.desktop.openFile();
        if (result) await acceptFile(result.name, new Uint8Array(result.bytes));
      } catch (error) {
        notify(t`读取失败。${errorMessage(error)}`, true);
      }
    } else input.current?.click();
  }

  async function writeFile(
    name: string,
    bytes: Uint8Array,
    extension: string,
  ): Promise<boolean> {
    if (window.desktop)
      return window.desktop.saveFile({ name, bytes, extension });
    const blob = new Blob([bytes.slice().buffer], {
      type:
        extension === "pdf"
          ? "application/pdf"
          : extension === "csv"
            ? "text/csv;charset=utf-8"
            : "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  }

  async function saveProject() {
    if (!document || operation.current) return;
    if (regionDraftRef.current.length || regionGesture.current) {
      notify(t("请先完成区域或按 Esc 取消草稿"));
      return;
    }
    operation.current = true;
    setBusy(t("正在保存项目"));
    const savedRevision = revision.current;
    try {
      const content = JSON.stringify({
        version: dataRef.current.regions.length
          ? 3
          : dataRef.current.measurements.some((item) => item.path)
            ? 2
            : 1,
        filename: document.name,
        pdf: bytesToBase64(document.bytes),
        data: dataRef.current,
      });
      const saved = await writeFile(
        `${document.name.replace(/\.pdf$/i, "")}.planmeasure`,
        new TextEncoder().encode(content),
        "planmeasure",
      );
      if (saved) {
        if (revision.current === savedRevision) setFileDirty(false);
        notify(t("项目已保存，包含原 PDF、校准和可编辑标注"));
      }
    } catch (error) {
      notify(t`保存失败。${errorMessage(error)}`, true);
    } finally {
      setBusy("");
      operation.current = false;
    }
  }

  async function exportFile(type: "pdf" | "csv") {
    setExportMenu(false);
    if (!document || operation.current) return;
    if (regionDraftRef.current.length || regionGesture.current) {
      notify(t("请先完成区域或按 Esc 取消草稿"));
      return;
    }
    operation.current = true;
    setBusy(type === "pdf" ? t("正在导出标注 PDF") : t("正在导出清单"));
    try {
      const bytes =
        type === "pdf"
          ? await exportPDF(document.bytes, dataRef.current)
          : new TextEncoder().encode(measurementCSV(dataRef.current));
      const saved = await writeFile(
        `${document.name.replace(/\.pdf$/i, "")}-measured.${type}`,
        bytes,
        type,
      );
      if (saved)
        notify(
          type === "pdf"
            ? t("带标注 PDF 已导出，可在其他阅读器查看")
            : t("测量清单已导出"),
        );
    } catch (error) {
      notify(t`导出失败。${errorMessage(error)}`, true);
    } finally {
      setBusy("");
      operation.current = false;
    }
  }

  function chooseTool(next: Tool) {
    setRegionDraft([]);
    regionDraftRef.current = [];
    setRegionPreview(null);
    regionGesture.current = null;
    setSelected(null);
    pendingMeasureTool.current = null;
    if ((next === "measure" || next === "curve") && !scale) {
      pendingMeasureTool.current = next;
      setTool("calibrate");
      notify(t("请先选取已知尺寸的两个端点，校准当前页"));
      return;
    }
    setTool(next);
    setAnchor(null);
  }

  function navigate(next: number) {
    if (!document || next < 1 || next > document.pdf.numPages) return;
    setPage(next);
    void fit(document.pdf, next, data.rotations).catch((error) =>
      notify(errorMessage(error), true),
    );
  }

  function toPDF(event: {
    clientX: number;
    clientY: number;
    shiftKey: boolean;
    altKey: boolean;
  }): Point | null {
    if (!viewport || !paper.current) return null;
    const rect = paper.current.getBoundingClientRect();
    let x = Math.max(0, Math.min(viewport.width, event.clientX - rect.left));
    let y = Math.max(0, Math.min(viewport.height, event.clientY - rect.top));
    const [rawX, rawY] = viewport.convertToPdfPoint(x, y);
    if (event.shiftKey && pickAnchor) {
      const [ax, ay] = viewport.convertToViewportPoint(
        pickAnchor.x,
        pickAnchor.y,
      );
      if (Math.abs(x - ax) >= Math.abs(y - ay)) y = ay;
      else x = ax;
    }
    const [px, py] = viewport.convertToPdfPoint(x, y);
    let hit: SnapHit | null = null;
    let tracked: TrackHit | null = null;
    let candidate: SnapHit | null = null;
    if (
      snapEnabled &&
      !event.altKey &&
      !space &&
      (tool === "calibrate" || tool === "measure" || tool === "fill")
    ) {
      const axis: OrthoConstraint | undefined =
        event.shiftKey && pickAnchor
          ? {
              coordinate: (Math.abs(px - pickAnchor.x) < 1e-6 ? "x" : "y") as
                "x" | "y",
              value:
                Math.abs(px - pickAnchor.x) < 1e-6
                  ? pickAnchor.x
                  : pickAnchor.y,
            }
          : undefined;
      const pixelsPerPoint = Math.hypot(
        viewport.transform[0],
        viewport.transform[1],
      );
      hit =
        snapContext?.index?.nearest(
          { x: px, y: py },
          10 / pixelsPerPoint,
          axis,
        ) || null;
      if (axis && !calibrationPoints) {
        candidate =
          snapContext?.index?.nearest(
            { x: rawX, y: rawY },
            10 / pixelsPerPoint,
          ) || null;
        if (candidate && pickAnchor && samePoint(candidate.point, pickAnchor))
          candidate = null;
        tracked = nearestTrackingPoint(
          { x: px, y: py },
          axis,
          smartPoints,
          10 / pixelsPerPoint,
        );
        if (
          tracked &&
          hit &&
          distance({ x: px, y: py }, hit.point) <
            distance({ x: px, y: py }, tracked.point) - 1e-7
        )
          tracked = null;
      }
    }
    setTrackingCandidate((previous) =>
      previous && candidate && samePoint(previous.point, candidate.point)
        ? previous
        : candidate,
    );
    setTrackHit(tracked);
    setSnapHit(tracked ? null : hit);
    return tracked?.point || hit?.point || { x: px, y: py };
  }

  useEffect(() => {
    if (!lastPointer.current || space || calibrationPoints) return;
    setCursor(
      toPDF({
        clientX: lastPointer.current.x,
        clientY: lastPointer.current.y,
        shiftKey: shiftPressed,
        altKey: altPressed,
      }),
    );
  }, [
    shiftPressed,
    altPressed,
    space,
    snapEnabled,
    viewport,
    smartPoints,
    pickAnchor,
    tool,
    calibrationPoints,
  ]);

  function pointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (!rendered || busy || calibrationPoints) return;
    setShiftPressed(event.shiftKey);
    setAltPressed(event.altKey);
    if ((tool === "pan" || space || event.button === 1) && stage.current) {
      event.preventDefault();
      setSnapHit(null);
      setCurveHit(null);
      setTrackingCandidate(null);
      setTrackHit(null);
      drag.current = {
        x: event.clientX,
        y: event.clientY,
        left: stage.current.scrollLeft,
        top: stage.current.scrollTop,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    lastPointer.current = { x: event.clientX, y: event.clientY };
    if (tool === "select") {
      setSelected(null);
      return;
    }
    if (snapEnabled && !event.altKey && snapStatus === "loading") {
      notify(t("正在准备矢量捕捉，请稍后选点，也可按住 Alt 自由选点"));
      return;
    }
    if (tool === "curve") {
      const hit = curveAt(event);
      if (!hit) {
        notify(
          t(
            snapContext?.index?.curves.paths.length
              ? "未选中矢量曲线，请靠近曲线后点击"
              : "此页没有可测量的矢量曲线，扫描图或折线无法自动识别",
          ),
        );
        return;
      }
      if (!scale) return;
      if (
        data.measurements.reduce(
          (sum, item) => sum + (item.path?.length || 0),
          hit.length,
        ) > 1000000
      ) {
        notify(t("曲线过于复杂，无法保存"), true);
        return;
      }
      const item: Measurement = {
        id: crypto.randomUUID(),
        page,
        a: hit[0],
        b: hit[hit.length - 1],
        path: hit,
        color,
        note: "",
      };
      change({ ...data, measurements: [...data.measurements, item] });
      setSelected(item.id);
      setCurveHit(null);
      return;
    }
    const point = toPDF(
      tool === "fill" && !regionDraft.length
        ? {
            ...event,
            clientX: event.clientX,
            clientY: event.clientY,
            shiftKey: false,
            altKey: event.altKey,
          }
        : event,
    );
    if (!point) return;
    if (tool === "fill") {
      const completed = lastRegionCompletion.current;
      if (
        !regionDraft.length &&
        completed &&
        performance.now() - completed.time < 350 &&
        distance(point, completed.point) * zoom < 10
      )
        return;
      regionGesture.current = {
        kind: regionDraft.length ? "polygon" : "start",
        start: point,
        client: { x: event.clientX, y: event.clientY },
        next: point,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setCursor(point);
      return;
    }
    if (!anchor) {
      setAnchor(point);
      setCursor(point);
      return;
    }
    if (distance(anchor, point) * zoom < 3) {
      notify(t("两点距离过近，请放大后重新选点"), true);
      return;
    }
    if (tool === "calibrate") {
      setCalibrationPoints([anchor, point]);
      setCalibrationValue("");
      setCalibrationUnit(data.unit);
      setCalibrationError("");
    } else if (scale) {
      const item: Measurement = {
        id: crypto.randomUUID(),
        page,
        a: anchor,
        b: point,
        note: "",
        color,
      };
      change({ ...data, measurements: [...data.measurements, item] });
      setSelected(item.id);
    }
    setAnchor(null);
    setCursor(null);
  }

  function curveAt(event: {
    clientX: number;
    clientY: number;
  }): Point[] | null {
    if (!viewport || !paper.current || snapStatus !== "ready") return null;
    const box = paper.current.getBoundingClientRect();
    const [x, y] = viewport.convertToPdfPoint(
      event.clientX - box.left,
      event.clientY - box.top,
    );
    return (
      snapContext?.index?.curves.nearest({ x, y }, 10 / viewport.scale) || null
    );
  }

  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    setShiftPressed(event.shiftKey);
    setAltPressed(event.altKey);
    lastPointer.current = { x: event.clientX, y: event.clientY };
    if (drag.current && stage.current) {
      stage.current.scrollLeft =
        drag.current.left - event.clientX + drag.current.x;
      stage.current.scrollTop =
        drag.current.top - event.clientY + drag.current.y;
      return;
    }
    const gesture = regionGesture.current;
    if (gesture) {
      const point = toPDF({
        ...event,
        clientX: event.clientX,
        clientY: event.clientY,
        shiftKey: gesture.kind === "polygon" ? event.shiftKey : false,
        altKey: event.altKey,
      });
      if (!point) return;
      if (gesture.kind === "vertex") {
        gesture.next = resizeRegionVertex(
          gesture.original,
          gesture.index,
          point,
        );
        setRegionPreview(gesture.next);
      } else {
        gesture.next = point;
        if (
          gesture.kind === "start" &&
          Math.hypot(
            event.clientX - gesture.client.x,
            event.clientY - gesture.client.y,
          ) > 5
        )
          gesture.kind = "rectangle";
        if (gesture.kind === "rectangle")
          setRegionPreview({
            id: "draft",
            page,
            kind: "rectangle",
            a: gesture.start,
            b: point,
            ...fillStyle,
            note: "",
          });
        setCursor(point);
      }
      return;
    }
    if (tool === "curve") setCurveHit(curveAt(event));
    else setCursor(toPDF(event));
  }

  function updateRegion(region: RegionFill) {
    change({
      ...dataRef.current,
      regions: dataRef.current.regions.map((item) =>
        item.id === region.id ? region : item,
      ),
    });
  }

  function completeRegion(region: RegionFill) {
    if (!isValidRegionGeometry(region)) {
      notify(t("区域边界无效，请避免自交或零面积"), true);
      return false;
    }
    if (
      dataRef.current.regions.length + dataRef.current.measurements.length >=
      100000
    ) {
      notify(t("项目标注数量超出限制"), true);
      return false;
    }
    change({
      ...dataRef.current,
      regions: [...dataRef.current.regions, region],
    });
    setRegionDraft([]);
    regionDraftRef.current = [];
    setRegionPreview(null);
    setSelected(null);
    setCursor(null);
    return true;
  }

  function finishRegionDraft() {
    const vertices = regionDraftRef.current;
    if (!validPolygon(vertices)) {
      notify(t("区域边界无效，请避免自交或零面积"), true);
      return;
    }
    if (
      completeRegion({
        id: crypto.randomUUID(),
        page,
        kind: "polygon",
        vertices: [...vertices],
        ...fillStyle,
        note: "",
      })
    )
      lastRegionCompletion.current = {
        point: vertices[vertices.length - 1],
        time: performance.now(),
      };
  }

  function beginRegionVertex(
    event: ReactPointerEvent<SVGCircleElement>,
    region: RegionFill,
    index: number,
  ) {
    if (event.button !== 0 || tool !== "select" || busy) return;
    event.stopPropagation();
    event.preventDefault();
    regionGesture.current = {
      kind: "vertex",
      original: region,
      index,
      next: region,
    };
    setRegionPreview(region);
    event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
  }

  function pointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (drag.current) {
      drag.current = null;
    } else if (regionGesture.current) {
      const gesture = regionGesture.current;
      regionGesture.current = null;
      setRegionPreview(null);
      if (gesture.kind === "vertex") {
        if (!isValidRegionGeometry(gesture.next))
          notify(t("区域边界无效，请避免自交或零面积"), true);
        else if (
          JSON.stringify(gesture.next) !== JSON.stringify(gesture.original)
        )
          updateRegion(gesture.next);
      } else if (gesture.kind === "rectangle") {
        completeRegion({
          id: crypto.randomUUID(),
          page,
          kind: "rectangle",
          a: gesture.start,
          b: gesture.next,
          ...fillStyle,
          note: "",
        });
      } else {
        const points = regionDraftRef.current;
        if (
          points.length >= 3 &&
          distance(gesture.next, points[0]) * zoom <= 10
        )
          finishRegionDraft();
        else if (
          !points.length ||
          distance(gesture.next, points[points.length - 1]) * zoom > 2
        ) {
          if (points.length >= 4096) notify(t("区域顶点过多"), true);
          else {
            const next = [...points, gesture.next];
            regionDraftRef.current = next;
            setRegionDraft(next);
          }
        }
      }
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function commitOpacity() {
    const pending = opacityChange.current;
    opacityChange.current = null;
    setOpacityPreview(null);
    if (!pending) return;
    const region = dataRef.current.regions.find(
      (item) => item.id === pending.id,
    );
    if (region && region.opacity !== pending.value)
      updateRegion({ ...region, opacity: pending.value });
  }

  function calibrate(event: React.FormEvent) {
    event.preventDefault();
    if (!calibrationPoints || !document) return;
    try {
      const calibration = makeCalibration(
        ...calibrationPoints,
        parseDistance(calibrationValue, calibrationUnit),
      );
      const scales: ProjectData["scales"] = {
        ...data.scales,
        [page]: calibration,
      };
      change({ ...data, scales });
      setCalibrationPoints(null);
      setTool(pendingMeasureTool.current || "measure");
      pendingMeasureTool.current = null;
      notify(t("当前页校准完成，可以连续测量"));
    } catch (error) {
      setCalibrationError(errorMessage(error));
    }
  }

  function removeSelected() {
    if (!selected) return;
    change({
      ...data,
      measurements: data.measurements.filter((item) => item.id !== selected),
      regions: data.regions.filter((item) => item.id !== selected),
    });
    setSelected(null);
  }

  const commandContext = {
    hasDocument: !!document,
    busy: !!busy || !ready,
    hasSelection: !!selectedAnnotation,
    canUndo: !!history.past.length,
    canRedo: !!history.future.length,
    page,
    pageCount: document?.pdf.numPages || 0,
  };
  const commandEnabled = Object.fromEntries(
    commandRegistry.map((command) => [
      command.id,
      command.enabled(commandContext) &&
        !help &&
        !calibrationPoints &&
        !shortcutsOpen &&
        (!regionGesture.current || command.id === "thinLines"),
    ]),
  );
  const menuStateJson = JSON.stringify({
    bindings: shortcuts.bindings,
    enabled: commandEnabled,
    capturing: capturingShortcut,
    labels: Object.fromEntries(
      commandRegistry.map((command) => [
        command.id,
        commandLabel(command.id, language),
      ]),
    ),
  });
  useEffect(() => {
    window.desktop?.setShortcuts(JSON.parse(menuStateJson));
  }, [menuStateJson]);

  async function dispatchCommand(id: CommandId) {
    if (
      help ||
      calibrationPoints ||
      shortcutsOpen ||
      (regionGesture.current && id !== "thinLines") ||
      capturingShortcut
    )
      return;
    const command = commandRegistry.find((item) => item.id === id);
    if (!command?.enabled(commandContext)) return;
    if (
      regionDraftRef.current.length &&
      ["save", "exportPdf", "exportCsv", "undo", "redo"].includes(id)
    ) {
      notify(t("请先完成区域或按 Esc 取消草稿"));
      return;
    }
    if (["open", "save", "exportPdf", "exportCsv"].includes(id)) {
      const active = window.document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement
      ) {
        active.blur();
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
      }
    }
    switch (id) {
      case "measure":
      case "curve":
      case "fill":
      case "calibrate":
      case "select":
      case "pan":
        chooseTool(id);
        break;
      case "prevPage":
        navigate(page - 1);
        break;
      case "nextPage":
        navigate(page + 1);
        break;
      case "fit":
        if (document) void fit(document.pdf, page, data.rotations);
        break;
      case "actual":
        setZoomAt(1);
        break;
      case "zoomOut":
        setZoomAt(zoom / 1.25);
        break;
      case "zoomIn":
        setZoomAt(zoom * 1.25);
        break;
      case "rotateCW":
      case "rotateCCW":
        change({
          ...data,
          rotations: {
            ...data.rotations,
            [page]: (rotation + (id === "rotateCW" ? 90 : 270)) % 360,
          },
        });
        break;
      case "thinLines":
        setThinLinesEnabled((value) => !value);
        break;
      case "snap":
        setSnapEnabled((value) => !value);
        break;
      case "editNote": {
        const note = window.document.getElementById(
          "note",
        ) as HTMLInputElement | null;
        note?.focus();
        note?.select();
        break;
      }
      case "delete":
        removeSelected();
        break;
      case "undo":
        undo();
        break;
      case "redo":
        redo();
        break;
      case "open":
        await openFile();
        break;
      case "save":
        await saveProject();
        break;
      case "exportPdf":
        await exportFile("pdf");
        break;
      case "exportCsv":
        await exportFile("csv");
        break;
      case "shortcuts":
        setShortcutsOpen(true);
        break;
    }
  }

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.key === "Alt") setAltPressed(true);
      if (event.key === "Shift") setShiftPressed(true);
      const target = event.target;
      const inputTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (shortcutsOpen) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (help) {
          setHelp(false);
          return;
        }
        if (calibrationPoints) {
          setCalibrationPoints(null);
          pendingMeasureTool.current = null;
          return;
        }
        if (exportMenu) {
          setExportMenu(false);
          return;
        }
        if (regionGesture.current) {
          regionGesture.current = null;
          setRegionPreview(null);
          return;
        }
        if (regionDraftRef.current.length) {
          setRegionDraft([]);
          regionDraftRef.current = [];
          setCursor(null);
          return;
        }
        if (anchor) {
          setAnchor(null);
          setSnapHit(null);
          setSmartPoints([]);
          setTrackingCandidate(null);
          setTrackHit(null);
          return;
        }
        setCurveHit(null);
        setSelected(null);
        setTool("select");
        return;
      }
      if (help || calibrationPoints || busy || !ready) return;
      if (inputTarget) {
        const chord = chordFromEvent(event, isMac);
        if (chord?.startsWith("Mod+")) {
          const id = matchCommand(
            chord,
            shortcuts.bindings,
            commandContext,
            event.repeat,
          );
          if (id && ["open", "save", "exportPdf", "exportCsv"].includes(id)) {
            event.preventDefault();
            void dispatchCommand(id);
          }
        }
        return;
      }
      if (
        tool === "fill" &&
        regionDraftRef.current.length &&
        event.key === "Enter"
      ) {
        event.preventDefault();
        if (!event.repeat) finishRegionDraft();
        return;
      }
      if (
        tool === "fill" &&
        regionDraftRef.current.length &&
        event.key === "Backspace"
      ) {
        event.preventDefault();
        if (!event.repeat) {
          const next = regionDraftRef.current.slice(0, -1);
          regionDraftRef.current = next;
          setRegionDraft(next);
        }
        return;
      }
      if (event.code === "Space") {
        if (target instanceof HTMLButtonElement) return;
        event.preventDefault();
        setSpace(true);
        return;
      }
      if (
        event.key === "Tab" &&
        (event.shiftKey || target instanceof HTMLButtonElement)
      )
        return;
      const chord = chordFromEvent(event, isMac);
      const id =
        chord &&
        matchCommand(chord, shortcuts.bindings, commandContext, event.repeat);
      if (id) {
        event.preventDefault();
        void dispatchCommand(id);
      }
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpace(false);
      if (event.key === "Alt") setAltPressed(false);
      if (event.key === "Shift") setShiftPressed(false);
    };
    const blur = () => {
      setSpace(false);
      setAltPressed(false);
      setShiftPressed(false);
      setTrackingCandidate(null);
      setTrackHit(null);
      lastPointer.current = null;
      drag.current = null;
      regionGesture.current = null;
      setRegionPreview(null);
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", blur);
    const unsubscribe = window.desktop?.onCommand((command) => {
      const active = window.document.activeElement;
      if (
        (command === "undo" || command === "redo") &&
        (active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement ||
          (active instanceof HTMLElement && active.isContentEditable))
      ) {
        window.desktop?.editText(command);
        return;
      }
      if (commandRegistry.some((item) => item.id === command))
        void dispatchCommand(command as CommandId);
    });
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", blur);
      unsubscribe?.();
    };
  });

  const screen = (point: Point) => {
    const [x, y] = viewport!.convertToViewportPoint(point.x, point.y);
    return { x, y };
  };
  const snapScreen = snapHit && viewport ? screen(snapHit.point) : null;
  const trackScreen = trackHit && viewport ? screen(trackHit.point) : null;
  const sourceScreen =
    trackHit && viewport ? screen(trackHit.source.point) : null;
  const anchorScreen = pickAnchor && viewport ? screen(pickAnchor) : null;
  const verticalTrack =
    !!trackScreen &&
    !!anchorScreen &&
    Math.abs(trackScreen.x - anchorScreen.x) >=
      Math.abs(trackScreen.y - anchorScreen.y);

  function dimension(
    a: Point,
    b: Point,
    text: string,
    stroke: string,
    id: string,
    preview = false,
    path?: Point[],
  ) {
    const start = screen(a),
      end = screen(b);

    const width = Math.max(48, text.length * 7 + 16);
    const points = path ? path.map(screen) : [start, end];
    const center = path
      ? screen(pathMidpoint(path))
      : { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    return (
      <g
        key={id}
        className={
          preview
            ? "dimension preview"
            : `dimension ${selected === id ? "selected" : ""}`
        }
        style={{ color: stroke }}
        onPointerDown={(event) => {
          if (preview || space || tool !== "select" || event.button !== 0)
            return;
          event.stopPropagation();
          setSelected(id);
          setAnchor(null);
        }}
      >
        <polyline
          className="dimension-hit"
          points={points.map((point) => `${point.x},${point.y}`).join(" ")}
        />
        <polyline
          className="dimension-line"
          points={points.map((point) => `${point.x},${point.y}`).join(" ")}
          strokeDasharray={preview ? "5 4" : undefined}
        />
        {[start, end].map((point, index) => {
          const adjacent = index === 0 ? points[1] : points[points.length - 2];
          const tangentLength = distance(point, adjacent);
          const dx = tangentLength
            ? (-(point.y - adjacent.y) / tangentLength) * 6
            : 0;
          const dy = tangentLength
            ? ((point.x - adjacent.x) / tangentLength) * 6
            : 6;
          return (
            <g key={index}>
              <line
                className="dimension-line"
                x1={point.x - dx}
                y1={point.y - dy}
                x2={point.x + dx}
                y2={point.y + dy}
              />
              <circle
                cx={point.x}
                cy={point.y}
                r={selected === id ? 4 : 2.5}
                fill="currentColor"
              />
            </g>
          );
        })}
        <rect
          className="dimension-label"
          x={center.x - width / 2}
          y={center.y - 31}
          width={width}
          height={23}
          rx={4}
        />
        <text x={center.x} y={center.y - 15} textAnchor="middle">
          {text}
        </text>
      </g>
    );
  }

  const instructions =
    tool === "fill"
      ? t(
          "拖动绘制矩形，逐点点击绘制多边形 · Enter 完成 / Backspace 退点 / Esc 取消",
        )
      : tool === "curve"
        ? t("靠近矢量曲线高亮整段，点击记录长度")
        : trackingActive
          ? trackHit
            ? t("已对齐参考点，点击确认正交落点")
            : t("正交选点 · 悬停捕捉点获取智慧轨迹")
          : tool === "calibrate"
            ? anchor
              ? t("选择已知尺寸的第二个端点")
              : t("选择已知尺寸的第一个端点")
            : tool === "measure"
              ? anchor
                ? t("选择第二点，完成一次测量")
                : t("选择第一点，开始测量")
              : tool === "pan"
                ? t("拖动画布平移，⌘ / Ctrl + 滚轮缩放")
                : t("点击标注以选择，可编辑备注或删除");

  function buttonHint(id: CommandId) {
    const key = shortcuts.hint(id);
    return { title: `${commandLabel(id, language)}${key ? ` (${key})` : ""}` };
  }
  function shortcutBadge(id: CommandId) {
    const key = shortcuts.hint(id);
    return key ? (
      <kbd className="button-shortcut" aria-hidden="true">
        {key}
      </kbd>
    ) : null;
  }

  return (
    <div
      className="app"
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file && /\.(pdf|planmeasure)$/i.test(file.name))
          void file
            .arrayBuffer()
            .then((bytes) => acceptFile(file.name, new Uint8Array(bytes)));
        else notify(t("请拖入 PDF 或 .planmeasure 项目文件"), true);
      }}
    >
      <input
        ref={input}
        data-testid="file-input"
        type="file"
        accept=".pdf,.planmeasure"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file)
            void file
              .arrayBuffer()
              .then((bytes) => acceptFile(file.name, new Uint8Array(bytes)));
          event.target.value = "";
        }}
      />
      <header className="topbar">
        <div className="brand">
          <span className="brand-symbol">
            <img src="./dim-it-logo.png" alt="" width={32} height={32} />
          </span>
          <strong>Dim It</strong>
          <span className="version">0.4.3</span>
        </div>
        <div className="document-title" title={document?.name}>
          {document ? (
            <>
              <span className="file-dot" />
              {document.name}
              {fileDirty && (
                <span className="dirty" title={t("尚未另存项目")}>
                  •
                </span>
              )}
            </>
          ) : (
            t("图纸测量工作台")
          )}
        </div>
        <select
          className="language-select"
          aria-label="Language / 语言"
          value={language}
          disabled={!!busy}
          onChange={(event) => {
            if (!setLanguage(event.target.value as "zh" | "en"))
              notify(t("语言偏好保存失败，下次启动可能恢复中文"), true);
          }}
        >
          <option value="zh">简体中文</option>
          <option value="en">English</option>
        </select>
        <button
          className="icon-button"
          aria-label={t("快捷键设置")}
          onClick={() => void dispatchCommand("shortcuts")}
          {...buttonHint("shortcuts")}
        >
          <Keyboard size={18} />
        </button>
        <button
          className="icon-button"
          title={t("使用帮助")}
          aria-label={t("使用帮助")}
          onClick={() => setHelp(true)}
        >
          <HelpCircle size={18} />
        </button>
      </header>
      <nav
        className="toolbar"
        aria-label={t("图纸工具")}
        onClick={(event) => {
          if (event.detail > 0)
            requestAnimationFrame(() =>
              window.document
                .querySelector<SVGSVGElement>(".overlay")
                ?.focus({ preventScroll: true }),
            );
        }}
      >
        <div className="toolgroup">
          <button
            onClick={() => void dispatchCommand("open")}
            disabled={!!busy || !ready}
            {...buttonHint("open")}
          >
            <FolderOpen size={17} />
            {t("打开图纸")}
            {shortcutBadge("open")}
          </button>
          <button
            className="save-button"
            onClick={() => void dispatchCommand("save")}
            disabled={!document || !!busy}
            {...buttonHint("save")}
          >
            <Save size={17} />
            {t("保存项目")}
            {shortcutBadge("save")}
          </button>
        </div>
        <span className="divider" />
        <div className="toolgroup modes">
          <button
            className={tool === "select" ? "active" : ""}
            onClick={() => void dispatchCommand("select")}
            disabled={!document}
            {...buttonHint("select")}
          >
            <MousePointer2 size={17} />
            <span>{t("选择")}</span>
            {shortcutBadge("select")}
          </button>
          <button
            className={tool === "pan" ? "active" : ""}
            onClick={() => void dispatchCommand("pan")}
            disabled={!document}
            {...buttonHint("pan")}
          >
            <Hand size={17} />
            <span>{t("平移")}</span>
            {shortcutBadge("pan")}
          </button>
          <button
            className={tool === "calibrate" ? "active" : ""}
            onClick={() => void dispatchCommand("calibrate")}
            disabled={!document}
            {...buttonHint("calibrate")}
          >
            <Crosshair size={18} />
            {t("校准比例")}
            {shortcutBadge("calibrate")}
          </button>
          <button
            className={tool === "measure" ? "active" : ""}
            onClick={() => void dispatchCommand("measure")}
            disabled={!document}
            {...buttonHint("measure")}
          >
            <Ruler size={18} />
            {t("长度测量")}
            {shortcutBadge("measure")}
          </button>
          <button
            className={tool === "curve" ? "active" : ""}
            onClick={() => void dispatchCommand("curve")}
            disabled={!document}
            {...buttonHint("curve")}
          >
            <Spline size={18} />
            {t("曲线长度")}
            {shortcutBadge("curve")}
          </button>
        </div>
        <div className="toolgroup">
          <button
            className={tool === "fill" ? "active" : ""}
            disabled={!document}
            onClick={() => void dispatchCommand("fill")}
            {...buttonHint("fill")}
          >
            <PaintBucket size={18} />
            {t("区域填色")}
            {shortcutBadge("fill")}
          </button>
        </div>
        <span className="divider" />
        <div className="toolgroup">
          <button
            className={snapEnabled ? "active snap-toggle" : "snap-toggle"}
            aria-label={t("对象捕捉")}
            aria-pressed={snapEnabled}
            disabled={!document}
            onClick={() => void dispatchCommand("snap")}
            {...buttonHint("snap")}
          >
            <Magnet size={17} />
            <span>{t("捕捉")}</span>
            {shortcutBadge("snap")}
          </button>
        </div>
        <div className="toolgroup">
          <button
            className="icon-button"
            aria-label={t("撤销")}
            onClick={() => void dispatchCommand("undo")}
            disabled={!history.past.length}
            {...buttonHint("undo")}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-button"
            aria-label={t("重做")}
            onClick={() => void dispatchCommand("redo")}
            disabled={!history.future.length}
            {...buttonHint("redo")}
          >
            <Redo2 size={17} />
          </button>
        </div>
        <button
          aria-label={t("细线显示")}
          aria-pressed={thinLines}
          className={thinLines ? "active" : ""}
          disabled={!document}
          onClick={() => void dispatchCommand("thinLines")}
          {...buttonHint("thinLines")}
        >
          {t("细线显示")}
          {shortcutBadge("thinLines")}
        </button>
        <div className="toolbar-spacer" />
        <div className="export-control">
          <button
            className="export-button"
            onClick={() => setExportMenu(!exportMenu)}
            disabled={!document || !!busy}
          >
            <ArrowDownToLine size={16} />
            {t("导出")}
            <ChevronDown size={14} />
          </button>
          {exportMenu && (
            <>
              <button
                className="menu-dismiss"
                aria-label={t("关闭导出菜单")}
                onClick={() => setExportMenu(false)}
              />
              <div className="dropdown">
                <button
                  onClick={() => void dispatchCommand("exportPdf")}
                  {...buttonHint("exportPdf")}
                >
                  {t("带标注 PDF")}
                  <small>{t("供查看与打印")}</small>
                  {shortcutBadge("exportPdf")}
                </button>
                <button
                  onClick={() => void dispatchCommand("exportCsv")}
                  {...buttonHint("exportCsv")}
                >
                  {t("测量清单 CSV")}
                  <small>{t("尺寸与备注")}</small>
                  {shortcutBadge("exportCsv")}
                </button>
              </div>
            </>
          )}
        </div>
      </nav>
      <main className="workspace">
        <aside className="pages-sidebar">
          <div className="panel-heading">
            <span>{t("图纸页面")}</span>
            <small>
              {document ? t`${document.pdf.numPages} 页` : t("0 页")}
            </small>
          </div>
          <div className="thumbnails">
            {document ? (
              Array.from({ length: document.pdf.numPages }, (_, index) => (
                <Thumbnail
                  key={`${document.name}-${index}`}
                  pdf={document.pdf}
                  page={index + 1}
                  active={page === index + 1}
                  calibrated={!!data.scales[index + 1]}
                  count={
                    data.measurements.filter((item) => item.page === index + 1)
                      .length
                  }
                  onSelect={() => navigate(index + 1)}
                />
              ))
            ) : (
              <div className="pages-empty">
                <FilePlus2 size={27} />
                <span>
                  {t("打开 PDF 后")}
                  <br />
                  {t("在这里切换页面")}
                </span>
              </div>
            )}
          </div>
          <div className="local-note">
            <ShieldCheck size={14} />
            {t("文件仅在本机处理")}
          </div>
        </aside>
        <section className="drawing-workspace">
          <div className="canvas-bar">
            <span className={`scale-state ${scale ? "calibrated" : ""}`}>
              <span />
              {document
                ? scale
                  ? t("当前页已校准")
                  : t("当前页待校准")
                : t("准备就绪")}
            </span>
            {document && (
              <span
                className={`snap-status ${snapStatus}`}
                data-testid="snap-status"
                title={t(
                  "端点、直线中点和有限线段交点。按住 Alt 临时自由选点。",
                )}
              >
                {tool === "curve"
                  ? snapStatus === "loading"
                    ? t("正在准备矢量曲线")
                    : t`可测量曲线 ${snapContext?.index?.curves.paths.length || 0} 段`
                  : !snapEnabled
                    ? t("自由选点")
                    : snapStatus === "loading"
                      ? t("矢量捕捉准备中")
                      : snapStatus === "empty"
                        ? t("此页无矢量直线 · 手动选点")
                        : snapStatus === "error"
                          ? t("捕捉解析失败 · 手动选点")
                          : t("端点 / 中点 / 交点捕捉")}
              </span>
            )}
            <span className="canvas-bar-right">
              {document ? t`第 ${page} 页` : t("PDF 工作区")}
              <span className="small-divider" />
              {document ? t(unitLabels[data.unit]) : t("本地离线")}
            </span>
          </div>
          <div
            ref={stage}
            className={`stage ${tool} ${space ? "space-pan" : ""}`}
            data-testid="stage"
          >
            {document ? (
              <div className="paper-holder">
                <div
                  ref={paper}
                  className="paper"
                  style={{
                    width: viewport?.width || 1,
                    height: viewport?.height || 1,
                  }}
                  data-thin-lines={thinLines}
                  data-testid="paper"
                >
                  <canvas
                    ref={canvas}
                    className="pdf-canvas"
                    style={{
                      width: viewport?.width || 1,
                      height: viewport?.height || 1,
                    }}
                  />
                  <canvas
                    ref={detailCanvas}
                    className="detail-canvas"
                    data-testid="detail-canvas"
                  />
                  {viewport && (
                    <svg
                      className="overlay"
                      data-tool={tool}
                      data-testid="drawing-overlay"
                      data-snap-state={snapStatus}
                      width={viewport.width}
                      height={viewport.height}
                      onPointerDown={pointerDown}
                      onPointerMove={pointerMove}
                      tabIndex={0}
                      onDoubleClick={(event) => {
                        if (
                          tool === "fill" &&
                          regionDraftRef.current.length >= 3
                        ) {
                          event.preventDefault();
                          finishRegionDraft();
                        }
                      }}
                      onPointerUp={pointerUp}
                      onPointerCancel={() => {
                        drag.current = null;
                        regionGesture.current = null;
                        setRegionPreview(null);
                        setTrackingCandidate(null);
                        setTrackHit(null);
                      }}
                      onPointerLeave={() => {
                        if (!drag.current) {
                          setCursor(null);
                          setCurveHit(null);
                          setSnapHit(null);
                          setTrackingCandidate(null);
                          setTrackHit(null);
                          lastPointer.current = null;
                        }
                      }}
                    >
                      <RegionLayer
                        regions={pageRegions.map((region) =>
                          region.id === selected && opacityPreview !== null
                            ? { ...region, opacity: opacityPreview }
                            : region,
                        )}
                        selected={selected}
                        preview={regionPreview}
                        draft={regionDraft}
                        cursor={cursor}
                        screen={screen}
                        canSelect={tool === "select" && !space}
                        onSelect={setSelected}
                        color={fillStyle.color}
                        opacity={fillStyle.opacity}
                      />
                      {trackingActive && (
                        <g
                          className="smart-track-overlay"
                          data-testid="smart-track-overlay"
                        >
                          {trackScreen && sourceScreen && (
                            <g
                              className="smart-guides"
                              data-testid="smart-guides"
                            >
                              <line
                                className="smart-guide-extended"
                                x1={verticalTrack ? sourceScreen.x : 0}
                                y1={verticalTrack ? 0 : sourceScreen.y}
                                x2={
                                  verticalTrack
                                    ? sourceScreen.x
                                    : viewport.width
                                }
                                y2={
                                  verticalTrack
                                    ? viewport.height
                                    : sourceScreen.y
                                }
                              />
                              <line
                                className="smart-guide"
                                x1={sourceScreen.x}
                                y1={sourceScreen.y}
                                x2={trackScreen.x}
                                y2={trackScreen.y}
                              />
                            </g>
                          )}
                          {smartPoints.map((item, index) => {
                            const position = screen(item.point);
                            const active =
                              !!trackHit &&
                              samePoint(item.point, trackHit.source.point);
                            return (
                              <g
                                key={index}
                                className={`smart-reference ${active ? "active" : ""}`}
                                data-testid="smart-reference"
                                data-pdf-x={item.point.x}
                                data-pdf-y={item.point.y}
                                data-kind={item.kind}
                              >
                                <circle
                                  cx={position.x}
                                  cy={position.y}
                                  r={active ? 6 : 4}
                                />
                                <path
                                  d={`M${position.x - 9},${position.y} h18 M${position.x},${position.y - 9} v18`}
                                />
                              </g>
                            );
                          })}
                          {trackingCandidate &&
                            !smartPoints.some((item) =>
                              samePoint(item.point, trackingCandidate.point),
                            ) && (
                              <g
                                className="smart-candidate"
                                data-testid="smart-candidate"
                                data-pdf-x={trackingCandidate.point.x}
                                data-pdf-y={trackingCandidate.point.y}
                              >
                                <circle
                                  cx={screen(trackingCandidate.point).x}
                                  cy={screen(trackingCandidate.point).y}
                                  r={9}
                                />
                                <text
                                  x={Math.max(
                                    4,
                                    Math.min(
                                      screen(trackingCandidate.point).x + 15,
                                      viewport.width - 90,
                                    ),
                                  )}
                                  y={Math.max(
                                    16,
                                    screen(trackingCandidate.point).y - 12,
                                  )}
                                >
                                  {t("停留获取")}
                                  {t(snapLabels[trackingCandidate.kind])}
                                </text>
                              </g>
                            )}
                        </g>
                      )}
                      {tool === "curve" &&
                        curveHit &&
                        scale &&
                        dimension(
                          curveHit[0],
                          curveHit[curveHit.length - 1],
                          formatDistance(
                            pathLength(curveHit) * scale.mmPerPoint,
                            data.unit,
                            data.precision,
                          ),
                          color,
                          "curve-preview",
                          true,
                          curveHit,
                        )}
                      {pageMeasurements.map((item) =>
                        dimension(
                          item.a,
                          item.b,
                          formatDistance(
                            measurementMM(item, data)!,
                            data.unit,
                            data.precision,
                          ),
                          item.color,
                          item.id,
                          false,
                          item.path,
                        ),
                      )}
                      {anchor &&
                        cursor &&
                        dimension(
                          anchor,
                          cursor,
                          tool === "calibrate"
                            ? t("已知尺寸")
                            : formatDistance(
                                distance(anchor, cursor) *
                                  (scale?.mmPerPoint || 0),
                                data.unit,
                                data.precision,
                              ),
                          tool === "calibrate" ? "#d08a18" : color,
                          "preview",
                          true,
                        )}
                      {calibrationPoints &&
                        dimension(
                          ...calibrationPoints,
                          t("校准参考线"),
                          "#d08a18",
                          "calibration-preview",
                          true,
                        )}
                      {cursor &&
                        (tool === "measure" || tool === "calibrate") &&
                        !space && (
                          <g className="crosshair">
                            <line
                              x1={screen(cursor).x - 11}
                              y1={screen(cursor).y}
                              x2={screen(cursor).x + 11}
                              y2={screen(cursor).y}
                            />
                            <line
                              x1={screen(cursor).x}
                              y1={screen(cursor).y - 11}
                              x2={screen(cursor).x}
                              y2={screen(cursor).y + 11}
                            />
                          </g>
                        )}
                      {snapHit &&
                        snapScreen &&
                        snapEnabled &&
                        !space &&
                        !altPressed &&
                        !calibrationPoints && (
                          <g
                            className="snap-highlight"
                            data-testid="snap-highlight"
                            data-kind={snapHit.kind}
                            data-pdf-x={snapHit.point.x}
                            data-pdf-y={snapHit.point.y}
                            role="img"
                            aria-label={t`已捕捉${t(snapLabels[snapHit.kind])}`}
                          >
                            <circle
                              className="snap-halo"
                              cx={snapScreen.x}
                              cy={snapScreen.y}
                              r={13}
                            />
                            {snapHit.kind === "endpoint" && (
                              <rect
                                className="snap-marker"
                                x={snapScreen.x - 5}
                                y={snapScreen.y - 5}
                                width={10}
                                height={10}
                              />
                            )}
                            {snapHit.kind === "midpoint" && (
                              <polygon
                                className="snap-marker"
                                points={`${snapScreen.x},${snapScreen.y - 7} ${snapScreen.x - 6.5},${snapScreen.y + 5} ${snapScreen.x + 6.5},${snapScreen.y + 5}`}
                              />
                            )}
                            {snapHit.kind === "intersection" && (
                              <path
                                className="snap-marker"
                                d={`M${snapScreen.x - 5},${snapScreen.y - 5} l10,10 M${snapScreen.x - 5},${snapScreen.y + 5} l10,-10`}
                              />
                            )}
                            <g
                              transform={`translate(${Math.max(4, Math.min(snapScreen.x + 17, viewport.width - 58))},${Math.max(4, Math.min(snapScreen.y - 28, viewport.height - 26))})`}
                            >
                              <rect
                                className="snap-label"
                                width={53}
                                height={23}
                                rx={4}
                              />
                              <text x={26.5} y={15.5} textAnchor="middle">
                                {t(snapLabels[snapHit.kind])}
                              </text>
                            </g>
                          </g>
                        )}
                      {trackingActive && trackHit && trackScreen && (
                        <g
                          className="smart-track-hit"
                          data-testid="smart-track-hit"
                          data-pdf-x={trackHit.point.x}
                          data-pdf-y={trackHit.point.y}
                          data-source-x={trackHit.source.point.x}
                          data-source-y={trackHit.source.point.y}
                          role="img"
                          aria-label={t("智慧轨迹正交交点")}
                        >
                          <path
                            className="smart-target"
                            d={`M${trackScreen.x},${trackScreen.y - 7} l7,7 -7,7 -7,-7 Z`}
                          />
                          <g
                            transform={`translate(${Math.max(4, Math.min(trackScreen.x + 17, viewport.width - 82))},${Math.max(4, Math.min(trackScreen.y - 29, viewport.height - 27))})`}
                          >
                            <rect width={77} height={24} rx={4} />
                            <text x={38.5} y={16} textAnchor="middle">
                              {t("正交追踪")}
                            </text>
                          </g>
                        </g>
                      )}
                      {tool === "select" && !space && selectedRegion && (
                        <RegionHandles
                          region={
                            regionPreview?.id === selectedRegion.id
                              ? regionPreview
                              : selectedRegion
                          }
                          screen={screen}
                          onVertexDown={beginRegionVertex}
                        />
                      )}
                    </svg>
                  )}
                </div>
              </div>
            ) : (
              <div className="welcome">
                <div className="welcome-mark">
                  <ScanLine size={49} strokeWidth={1} />
                  <Ruler size={23} strokeWidth={1.5} />
                </div>
                <span className="welcome-kicker">{t("从图纸到尺寸")}</span>
                <h1>
                  {t("让每一段距离")}
                  <br />
                  {t("都有准确的尺度。")}
                </h1>
                <p>{t("打开 PDF，校准一个已知尺寸，即可开始测量。")}</p>
                <button
                  className="primary"
                  onClick={() => void dispatchCommand("open")}
                  disabled={!ready || !!busy}
                  {...buttonHint("open")}
                >
                  <FolderOpen size={18} />
                  {t("打开 PDF 图纸")}
                  {shortcutBadge("open")}
                </button>
                <span className="drop-hint">
                  {t("也可以将 PDF 或项目文件拖入窗口")}
                </span>
                <button
                  className="demo-link"
                  onClick={() => {
                    void createDemo()
                      .then((bytes) =>
                        acceptFile("DimIt-Demo.pdf", bytes, true),
                      )
                      .catch((error) => notify(errorMessage(error), true));
                  }}
                  disabled={!ready || !!busy}
                >
                  {t("用示例图纸体验")}
                  <ChevronRight size={14} />
                </button>
                <div className="welcome-steps">
                  <span>
                    <b>1</b>
                    {t("选取参考两点")}
                  </span>
                  <span>
                    <b>2</b>
                    {t("输入真实尺寸")}
                  </span>
                  <span>
                    <b>3</b>
                    {t("连续测量标注")}
                  </span>
                </div>
              </div>
            )}
          </div>
          {document && (
            <>
              <div className="instruction-pill">
                <span className={`instruction-dot ${tool}`} />
                {instructions}
                {(tool === "measure" || tool === "calibrate") && (
                  <kbd>{t("Shift 约束水平 / 垂直")}</kbd>
                )}
                {anchor && <kbd>{t("Esc 取消")}</kbd>}
              </div>
              <div className="view-controls">
                <button
                  className="icon-button"
                  onClick={() => void dispatchCommand("zoomOut")}
                  aria-label={t("缩小")}
                  {...buttonHint("zoomOut")}
                >
                  <Minus size={16} />
                </button>
                <button
                  className="zoom-value"
                  onClick={() => void dispatchCommand("actual")}
                  {...buttonHint("actual")}
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  className="icon-button"
                  onClick={() => void dispatchCommand("zoomIn")}
                  aria-label={t("放大")}
                  {...buttonHint("zoomIn")}
                >
                  <Plus size={16} />
                </button>
                <span />
                <button
                  className="icon-button"
                  onClick={() => void dispatchCommand("fit")}
                  aria-label={t("适合页面")}
                  {...buttonHint("fit")}
                >
                  <Maximize size={16} />
                </button>
                <button
                  className="icon-button"
                  onClick={() => void dispatchCommand("rotateCW")}
                  aria-label={t("旋转页面")}
                  {...buttonHint("rotateCW")}
                >
                  <RotateCw size={16} />
                </button>
              </div>
            </>
          )}
        </section>
        <aside className="inspector">
          <div className="panel-heading">
            <span>{t("测量设置")}</span>
            <Ruler size={15} />
          </div>
          <section className="settings-section">
            <label htmlFor="unit">{t("显示单位")}</label>
            <select
              id="unit"
              value={data.unit}
              disabled={!document}
              onChange={(event) =>
                change({ ...data, unit: event.target.value as Unit })
              }
            >
              {Object.entries(unitLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {t(label)}
                </option>
              ))}
            </select>
            <div className="precision-row">
              <label htmlFor="precision">
                {data.unit === "ft-in" ? t("分数精度") : t("小数位数")}
              </label>
              {data.unit === "ft-in" ? (
                <span>1/16 inch</span>
              ) : (
                <select
                  id="precision"
                  value={data.precision}
                  disabled={!document}
                  onChange={(event) =>
                    change({ ...data, precision: Number(event.target.value) })
                  }
                >
                  {[0, 1, 2, 3].map((value) => (
                    <option key={value} value={value}>
                      {value}
                      {language === "zh" && t("位")}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <label>{t("标注颜色")}</label>
            <div className="color-options">
              {colors.map((value) => (
                <button
                  key={value}
                  aria-label={t`颜色 ${value}`}
                  className={
                    value ===
                    (selectedRegion?.color ||
                      (tool === "fill" ? fillStyle.color : color))
                      ? "chosen"
                      : ""
                  }
                  style={{ background: value }}
                  onClick={() => {
                    if (selectedRegion) {
                      updateRegion({ ...selectedRegion, color: value });
                      return;
                    }
                    if (tool === "fill") {
                      setFillStyle((style) => ({ ...style, color: value }));
                      return;
                    }
                    setColor(value);
                    if (selectedMeasurement)
                      change({
                        ...data,
                        measurements: data.measurements.map((item) =>
                          item.id === selected
                            ? { ...item, color: value }
                            : item,
                        ),
                      });
                  }}
                >
                  {value ===
                    (selectedRegion?.color ||
                      (tool === "fill" ? fillStyle.color : color)) && (
                    <Check size={12} />
                  )}
                </button>
              ))}
            </div>
          </section>
          {(tool === "fill" || selectedRegion) && (
            <section className="fill-settings">
              <label htmlFor="fill-opacity">
                {t("不透明度")}{" "}
                {Math.round(
                  (opacityPreview ??
                    selectedRegion?.opacity ??
                    fillStyle.opacity) * 100,
                )}
                %
              </label>
              <input
                id="fill-opacity"
                type="range"
                min="0"
                max="100"
                value={Math.round(
                  (opacityPreview ??
                    selectedRegion?.opacity ??
                    fillStyle.opacity) * 100,
                )}
                onChange={(event) => {
                  const value = Number(event.target.value) / 100;
                  if (selectedRegion) {
                    opacityChange.current = { id: selectedRegion.id, value };
                    setOpacityPreview(value);
                  } else
                    setFillStyle((style) => ({ ...style, opacity: value }));
                }}
                onPointerUp={commitOpacity}
                onPointerCancel={commitOpacity}
                onKeyUp={commitOpacity}
                onBlur={commitOpacity}
              />
            </section>
          )}
          <section className="calibration-card">
            <div className="section-title">
              <Crosshair size={16} />
              <strong>{t("比例校准")}</strong>
              {scale && (
                <span className="verified">
                  <Check size={11} />
                  {t("已校准")}
                </span>
              )}
            </div>
            {scale ? (
              <>
                <div className="reference-value">
                  {formatDistance(scale.millimeters, data.unit, data.precision)}
                </div>
                <p>{t("参考线实际尺寸 · 仅作用于当前页")}</p>
                <button
                  className="subtle-button"
                  onClick={() => void dispatchCommand("calibrate")}
                  {...buttonHint("calibrate")}
                >
                  {t("重新校准")}
                  {shortcutBadge("calibrate")}
                </button>
                <small className="recalculate-note">
                  {t("重新校准会同步重算本页测量。")}
                </small>
              </>
            ) : (
              <>
                <p>{t("选取图纸上有明确尺寸标注的两点，输入实际距离。")}</p>
                <button
                  className="subtle-button"
                  disabled={!document}
                  onClick={() => void dispatchCommand("calibrate")}
                  {...buttonHint("calibrate")}
                >
                  <Crosshair size={14} />
                  {t("校准当前页")}
                  {shortcutBadge("calibrate")}
                </button>
              </>
            )}
          </section>
          <div className="panel-heading list-heading">
            <span>
              {t("测量记录")}
              <small>{pageMeasurements.length}</small>
            </span>
            <span className="list-scope">{t("当前页")}</span>
          </div>
          <div className="measurements-list">
            {pageMeasurements.length
              ? pageMeasurements.map((item) => {
                  const index = data.measurements.indexOf(item) + 1;
                  return (
                    <button
                      className={`measurement-row ${selected === item.id ? "selected" : ""}`}
                      key={item.id}
                      onClick={() => {
                        setSelected(item.id);
                        setTool("select");
                      }}
                    >
                      <span
                        className="measurement-index"
                        style={{ color: item.color }}
                      >
                        {String(index).padStart(2, "0")}
                      </span>
                      <span>
                        <strong>
                          {formatDistance(
                            measurementMM(item, data)!,
                            data.unit,
                            data.precision,
                          )}
                        </strong>
                        <small>
                          {item.note ||
                            (item.path ? t("曲线长度") : t("长度测量"))}
                        </small>
                      </span>
                      <Ruler size={14} />
                    </button>
                  );
                })
              : !pageRegions.length && (
                  <div className="records-empty">
                    <Ruler size={29} strokeWidth={1.2} />
                    <strong>{t("等待第一条测量")}</strong>
                    <p>
                      {scale
                        ? t("点击「长度测量」，在图纸上选取两个端点。")
                        : t("完成比例校准后，即可在图纸上连续测量。")}
                    </p>
                  </div>
                )}
            {!!pageRegions.length && (
              <div className="region-records">
                <div className="panel-heading">
                  {t("填色区域")}
                  <small>{pageRegions.length}</small>
                </div>
                {pageRegions.map((region, index) => (
                  <button
                    data-testid="region-row"
                    key={region.id}
                    className={`region-row ${selected === region.id ? "selected" : ""}`}
                    onClick={() => {
                      setSelected(region.id);
                      setTool("select");
                    }}
                  >
                    <span
                      className="region-swatch"
                      style={{ background: region.color }}
                    />
                    <span>
                      {t("填色区域")} {index + 1}
                      <small>
                        {region.note ||
                          (region.kind === "rectangle"
                            ? t("矩形")
                            : t("多边形"))}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedAnnotation && (
            <div className="selection-editor">
              <div>
                <label htmlFor="note">{t("标注备注")}</label>
                <button
                  className="icon-button danger"
                  onClick={() => void dispatchCommand("delete")}
                  aria-label={t("删除标注")}
                  {...buttonHint("delete")}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <input
                id="note"
                key={selectedAnnotation.id + selectedAnnotation.note}
                defaultValue={selectedAnnotation.note}
                maxLength={120}
                placeholder={t("例如 客厅净宽")}
                onBlur={(event) => {
                  if (event.target.value !== selectedAnnotation.note)
                    change({
                      ...data,
                      measurements: data.measurements.map((item) =>
                        item.id === selected
                          ? { ...item, note: event.target.value }
                          : item,
                      ),
                      regions: data.regions.map((item) =>
                        item.id === selected
                          ? { ...item, note: event.target.value }
                          : item,
                      ),
                    });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.stopPropagation();
                    event.currentTarget.blur();
                  }
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    event.currentTarget.value = selectedAnnotation.note;
                    event.currentTarget.blur();
                  }
                }}
              />
            </div>
          )}
          <div className="inspector-footer">
            <b>
              {t`${data.measurements.length} 条测量`} · {data.regions.length}{" "}
              {t("区域")}
            </b>
            <span>{t("整份图纸")}</span>
          </div>
        </aside>
      </main>
      <footer className="statusbar">
        <span>
          <span className="status-dot" />
          {t(
            busy ||
              (document && !rendered ? "正在渲染图纸" : autosave || "就绪"),
          )}
        </span>
        {document && (
          <div className="page-navigation">
            <button
              onClick={() => void dispatchCommand("prevPage")}
              disabled={page <= 1}
              aria-label={t("上一页")}
              {...buttonHint("prevPage")}
            >
              <ChevronLeft size={14} />
            </button>
            <span>
              {page} / {document.pdf.numPages}
            </span>
            <button
              onClick={() => void dispatchCommand("nextPage")}
              disabled={page >= document.pdf.numPages}
              aria-label={t("下一页")}
              {...buttonHint("nextPage")}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
        <span className="status-end">
          {document
            ? `${(document.bytes.length / 1048576).toFixed(1)} MB`
            : "mm / inch / feet"}
          <span className="small-divider" />
          {t("离线工作台")}
        </span>
      </footer>
      {notice && (
        <div
          className={`toast ${notice.error ? "error" : ""}`}
          role={notice.error ? "alert" : "status"}
        >
          {notice.error ? <HelpCircle size={17} /> : <Check size={17} />}
          <span>{notice.text}</span>
          <button aria-label={t("关闭提示")} onClick={() => setNotice(null)}>
            <X size={15} />
          </button>
        </div>
      )}
      {calibrationPoints && (
        <div className="modal-backdrop">
          <form
            className="modal calibration-modal"
            onSubmit={calibrate}
            role="dialog"
            aria-modal="true"
            aria-labelledby="calibration-title"
          >
            <div className="modal-heading">
              <span className="modal-icon">
                <Crosshair size={22} />
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label={t("关闭校准")}
                onClick={() => setCalibrationPoints(null)}
              >
                <X size={18} />
              </button>
            </div>
            <h2 id="calibration-title">{t("这段距离的实际尺寸是多少？")}</h2>
            <p>
              {t("按图纸上已有的尺寸标注填写，建立第")}
              {page} {t("页的测量比例。")}
            </p>
            <label htmlFor="calibration-value">{t("已知尺寸")}</label>
            <div className="calibration-inputs">
              <input
                autoFocus
                id="calibration-value"
                value={calibrationValue}
                onChange={(event) => {
                  setCalibrationValue(event.target.value);
                  setCalibrationError("");
                }}
                placeholder={
                  calibrationUnit === "ft-in" ? `12' 6 1/2"` : t("例如 6000")
                }
                autoComplete="off"
              />
              <select
                aria-label={t("校准单位")}
                value={calibrationUnit}
                onChange={(event) =>
                  setCalibrationUnit(event.target.value as Unit)
                }
              >
                {Object.entries(unitLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {t(label)}
                  </option>
                ))}
              </select>
            </div>
            <small>
              {calibrationUnit === "ft-in"
                ? t("支持 12' 6 1/2\"，只填数字时按英尺解释。")
                : t("支持整数、小数和分数，例如 3 1/2。")}
            </small>
            {calibrationError && (
              <p className="form-error" role="alert">
                {calibrationError}
              </p>
            )}
            {scale && (
              <p className="calibration-warning">
                {t("本页已有")}
                {pageMeasurements.length}{" "}
                {t("条测量，确认后会按新比例重新计算。")}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                title={`${t("取消")} (Esc)`}
                onClick={() => setCalibrationPoints(null)}
              >
                {t("取消")}
                <kbd className="button-shortcut" aria-hidden="true">
                  Esc
                </kbd>
              </button>
              <button
                title={`${t("确认校准")} (Enter)`}
                className="primary"
                type="submit"
              >
                {t("确认校准")}
                <kbd className="button-shortcut" aria-hidden="true">
                  Enter
                </kbd>
                <Check size={16} />
              </button>
            </div>
          </form>
        </div>
      )}
      {help && (
        <QuickStart
          onClose={() => setHelp(false)}
          shortcutHint={shortcuts.hint}
        />
      )}
      {shortcutsOpen && (
        <ShortcutSettings
          bindings={shortcuts.bindings}
          onChange={shortcuts.change}
          onClose={() => {
            setShortcutsOpen(false);
            setCapturingShortcut(false);
          }}
          onCaptureChange={(value) => {
            setCapturingShortcut(value);
            window.desktop?.setShortcuts({
              ...JSON.parse(menuStateJson),
              capturing: value,
            });
          }}
          isMac={isMac}
          warning={shortcuts.warning}
        />
      )}
    </div>
  );
}
