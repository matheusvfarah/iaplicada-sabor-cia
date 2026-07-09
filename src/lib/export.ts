import { toast } from "sonner";
import logoUrl from "@/assets/logo.png";

// Serviço único de exportação. Cada página declara um dataset — nunca
// serializa objetos crus (era o bug: JSON.stringify aparecendo no
// export) — cada coluna extrai explicitamente o valor já formatado
// exatamente como aparece na tela.
export type ExportValue = string | number | null | undefined;

export type ExportColumn<T> = {
  header: string;
  value: (row: T) => ExportValue;
};

export type ExportSection<T = Record<string, unknown>> = {
  title?: string;
  columns: ExportColumn<T>[];
  rows: T[];
};

export type ExportDataset = {
  /** kebab-case, usado no nome do arquivo: sabor-cia_<page>_<aaaa-mm-dd> */
  page: string;
  /** título de exibição no cabeçalho do PDF */
  title: string;
  /** período ativo, já formatado (ex.: "Últimos 6 meses") */
  period: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- seções de tipos de linha diferentes num mesmo dataset
  sections: ExportSection<any>[];
};

function formatValue(v: ExportValue): string {
  if (v == null) return "";
  if (typeof v === "number") {
    return Number.isInteger(v)
      ? v.toLocaleString("pt-BR")
      : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(v);
}

function csvEscape(s: string): string {
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function fileBase(page: string) {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `sabor-cia_${page}_${y}-${m}-${d}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// CSV: separador ";", decimal com vírgula, UTF-8 com BOM (abre certo
// no Excel BR), datas dd/mm/aaaa (a página já formata antes de passar
// a coluna — ver PLATFORM_LABEL/CURRENCY_FULL nas páginas).
export function exportCsv(dataset: ExportDataset) {
  try {
    const sectionsComDados = dataset.sections.filter((s) => s.rows.length > 0);
    if (sectionsComDados.length === 0) {
      toast.error("Nada para exportar nesse período");
      return;
    }

    const lines: string[] = [];
    lines.push(csvEscape(dataset.title));
    lines.push(csvEscape(`Período: ${dataset.period}`));
    lines.push("");

    for (const section of sectionsComDados) {
      if (section.title) lines.push(csvEscape(section.title));
      lines.push(section.columns.map((c) => csvEscape(c.header)).join(";"));
      for (const row of section.rows) {
        lines.push(section.columns.map((c) => csvEscape(formatValue(c.value(row)))).join(";"));
      }
      lines.push("");
    }

    const csv = "﻿" + lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    triggerDownload(blob, `${fileBase(dataset.page)}.csv`);
    toast.success("CSV exportado");
  } catch (error) {
    toast.error("Não foi possível exportar o CSV", {
      description: error instanceof Error ? error.message : undefined,
    });
  }
}

// PDF via jsPDF + autotable: cabeçalho com logo, título, período e
// "gerado em", uma tabela por seção. jsPDF é importado sob demanda —
// sozinho já traz +1MB de dependências (html2canvas, canvg), não faz
// sentido carregar isso pra quem nunca exporta.
export async function exportPdf(dataset: ExportDataset) {
  try {
    const sectionsComDados = dataset.sections.filter((s) => s.rows.length > 0);
    if (sectionsComDados.length === 0) {
      toast.error("Nada para exportar nesse período");
      return;
    }

    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const marginX = 40;
    let cursorY = 50;

    const logoDataUrl = await loadImageAsDataUrl(logoUrl).catch(() => null);
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", marginX, cursorY - 24, 28, 28);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(46, 33, 29);
    doc.text(dataset.title, marginX + (logoDataUrl ? 38 : 0), cursorY);

    const geradoEm = new Date().toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(107, 90, 76);
    doc.text(
      `Período: ${dataset.period} · Gerado em ${geradoEm}`,
      marginX + (logoDataUrl ? 38 : 0),
      cursorY + 14,
    );

    cursorY += 34;
    doc.setDrawColor(234, 224, 210);
    doc.line(marginX, cursorY, doc.internal.pageSize.getWidth() - marginX, cursorY);
    cursorY += 16;

    for (const section of sectionsComDados) {
      if (section.title) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(74, 44, 36);
        doc.text(section.title, marginX, cursorY);
        cursorY += 8;
      }

      autoTable(doc, {
        startY: cursorY,
        margin: { left: marginX, right: marginX },
        head: [section.columns.map((c) => c.header)],
        body: section.rows.map((row) => section.columns.map((c) => formatValue(c.value(row)))),
        styles: { font: "helvetica", fontSize: 9, cellPadding: 5, textColor: [46, 33, 29] },
        headStyles: { fillColor: [122, 69, 59], textColor: [250, 246, 238] },
        alternateRowStyles: { fillColor: [250, 246, 238] },
      });

      cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
    }

    doc.save(`${fileBase(dataset.page)}.pdf`);
    toast.success("PDF exportado");
  } catch (error) {
    toast.error("Não foi possível exportar o PDF", {
      description: error instanceof Error ? error.message : undefined,
    });
  }
}

function loadImageAsDataUrl(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("sem contexto 2d"));
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = src;
  });
}
