"use client";
import { useEffect, useRef, useState } from "react";

export default function PdfCanvasViewer({ pdfUrl, pins = [], onPinDrop, onPinClick }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;
    let pdfDoc = null;

    async function load() {
      setLoading(true);
      setError("");
      try {
        // Load PDF.js from CDN if not present
        if (!window.pdfjsLib) {
          await new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
          });
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        }
        const loadingTask = window.pdfjsLib.getDocument(pdfUrl);
        pdfDoc = await loadingTask.promise;
        if (cancelled) return;
        setNumPages(pdfDoc.numPages);
        await renderPage(pdfDoc, pageNum);
      } catch (e) {
        if (!cancelled) setError("Could not load PDF. Try Open in new tab.");
      }
      if (!cancelled) setLoading(false);
    }

    async function renderPage(doc, num) {
      const page = await doc.getPage(num);
      const viewport = page.getViewport({ scale: 1.2 });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
    }

    load();
    return () => { cancelled = true; };
  }, [pdfUrl, pageNum]);

  function handleCanvasClick(e) {
    if (!onPinDrop) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onPinDrop({ x, y, page: pageNum });
  }

  return (
    <div className="relative bg-slate-900 rounded-lg overflow-hidden">
      {loading && <div className="absolute inset-0 flex items-center justify-center text-white text-sm">Loading plan…</div>}
      {error && (
        <div className="p-4 text-center text-sm text-red-300">
          {error}
          <br />
          <a href={pdfUrl} target="_blank" rel="noreferrer" className="underline text-blue-300">Open PDF in new tab</a>
        </div>
      )}
      <div ref={containerRef} className="overflow-auto max-h-[70vh]">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="mx-auto cursor-crosshair"
          style={{ maxWidth: "100%", height: "auto" }}
        />
      </div>
      {numPages > 1 && (
        <div className="flex justify-center gap-2 p-2 text-xs text-white bg-slate-800">
          <button disabled={pageNum <= 1} onClick={() => setPageNum(p => p - 1)} className="px-2 py-1 bg-slate-600 rounded disabled:opacity-40">Prev</button>
          <span>{pageNum} / {numPages}</span>
          <button disabled={pageNum >= numPages} onClick={() => setPageNum(p => p + 1)} className="px-2 py-1 bg-slate-600 rounded disabled:opacity-40">Next</button>
        </div>
      )}
      {/* Pin overlays */}
      {pins.filter(p => !p.page || p.page === pageNum).map((p, i) => (
        <div
          key={p.id || i}
          onClick={() => onPinClick?.(p)}
          className="absolute w-6 h-6 rounded-full bg-red-500 border-2 border-white text-white text-xs flex items-center justify-center -translate-x-1/2 -translate-y-1/2 cursor-pointer"
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
          title={p.note}
        >
          {i + 1}
        </div>
      ))}
    </div>
  );
}
