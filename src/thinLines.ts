// CanvasFactory is the public PDF.js hook, including form/transparency canvases.
// Strokes are redrawn in device space so zoom and non-uniform PDF transforms
// retain their centerlines while showing a uniform one-screen-pixel width.
export class PDFCanvasFactory {
  thinLines = false;
  private ownerDocument: Document;
  private willReadFrequently: boolean;
  constructor({ ownerDocument = globalThis.document, enableHWA = false } = {}) {
    this.ownerDocument = ownerDocument;
    this.willReadFrequently = !enableHWA;
  }
  create(width: number, height: number) {
    const canvas = this.ownerDocument.createElement("canvas");
    this.reset({ canvas }, width, height);
    return { canvas, context: this.context(canvas, true) };
  }
  reset(
    { canvas }: { canvas: HTMLCanvasElement },
    width: number,
    height: number,
  ) {
    if (width <= 0 || height <= 0) throw new Error("Invalid canvas size");
    canvas.width = width;
    canvas.height = height;
  }
  destroy(entry: {
    canvas: HTMLCanvasElement | null;
    context: CanvasRenderingContext2D | null;
  }) {
    if (entry.canvas) entry.canvas.width = entry.canvas.height = 0;
    entry.canvas = null;
    entry.context = null;
  }
  getNoAlphaContext(canvas: HTMLCanvasElement) {
    return this.context(canvas, false);
  }
  private contexts = new WeakSet<CanvasRenderingContext2D>();
  private context(canvas: HTMLCanvasElement, alpha: boolean) {
    const ctx = canvas.getContext("2d", {
      alpha,
      willReadFrequently: this.willReadFrequently,
    })!;
    if (this.contexts.has(ctx)) return ctx;
    this.contexts.add(ctx);
    const stroke = ctx.stroke.bind(ctx);
    ctx.stroke = ((path?: Path2D) => {
      if (!this.thinLines || !path) {
        path ? stroke(path) : stroke();
        return;
      }
      const transform = ctx.getTransform();
      const devicePath = new Path2D();
      devicePath.addPath(path, transform);
      const scale = Math.sqrt(
        Math.abs(transform.a * transform.d - transform.b * transform.c),
      );
      ctx.save();
      ctx.resetTransform();
      ctx.lineWidth = canvas.clientWidth
        ? canvas.width / canvas.clientWidth
        : Math.min(window.devicePixelRatio || 1, 2);
      ctx.setLineDash(ctx.getLineDash().map((value) => value * scale));
      ctx.lineDashOffset *= scale;
      stroke(devicePath);
      ctx.restore();
    }) as CanvasRenderingContext2D["stroke"];
    return ctx;
  }
}
