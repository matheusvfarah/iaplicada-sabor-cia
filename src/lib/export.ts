export function exportCSV<T extends Record<string, unknown>>(filename: string, rows: T[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const v = r[h];
          const s = v == null ? "" : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, `${filename}.csv`);
}

export function exportPDF(filename: string, title: string, body: string) {
  // Minimal client-side "PDF" — opens a print-ready page. Real PDF gen can be
  // added later with a proper library.
  const html = `<!doctype html><html><head><title>${title}</title>
  <style>body{font-family:Inter,sans-serif;padding:40px;color:#111}
  h1{font-family:Sora,sans-serif;color:#C4552D}
  pre{white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:12px}
  </style></head><body><h1>${title}</h1><pre>${body}</pre>
  <script>window.print()</script></body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) triggerDownload(blob, `${filename}.html`);
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
