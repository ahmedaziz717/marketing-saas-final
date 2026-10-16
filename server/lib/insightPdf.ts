import PDFDocument from "pdfkit";
import { createRequire } from "node:module";
const requireFont = createRequire(import.meta.url);
import {
  insightMetrics,
  insightChartMetric,
  insightNumber,
  type InsightMetric,
} from "../../shared/insights";
import type { InsightRunRow } from "../../drizzle/insightsSchema";

/** Vector charts and selectable text, generated from the immutable run snapshot. */
export async function insightPdf(run: InsightRunRow): Promise<Buffer> {
  if (!run.result) throw new Error("This run has no report to export.");
  const result = run.result;
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 58, bottom: 55, left: 42, right: 42 },
    bufferPages: true,
    info: {
      Title: result.name,
      Author: "EvokeLoop",
      Subject: "Performance report",
      CreationDate: new Date(result.generatedAtMs),
      ModDate: new Date(result.generatedAtMs),
    },
  });
  doc.registerFont(
    "ReportRegular",
    requireFont.resolve(
      "@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff"
    )
  );
  doc.registerFont(
    "ReportBold",
    requireFont.resolve(
      "@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff"
    )
  );
  doc.font("ReportRegular");
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const ink = "#222132",
    muted = "#69687B",
    teal = "#6D50D8",
    gold = "#B88632",
    light = "#F4F3F8";
  const width = 511;
  let y = 64;
  const line = (
    text: string,
    x: number,
    top: number,
    size = 10,
    color = ink,
    options: PDFKit.Mixins.TextOptions = {}
  ) => {
    doc
      .fontSize(size)
      .fillColor(color)
      .text(text, x, top, { width, lineGap: 3, ...options });
    return doc.y;
  };
  const page = () => {
    doc.addPage();
    y = 64;
  };
  const ensure = (height: number) => {
    if (y + height > 774) page();
  };
  const paragraph = (text: string, size = 10, color = muted) => {
    const height = doc
      .font("ReportRegular")
      .fontSize(size)
      .heightOfString(text, { width, lineGap: 3 });
    ensure(height + 10);
    y = line(text, 42, y, size, color) + 10;
  };
  const heading = (text: string) => {
    ensure(50);
    doc.font("ReportBold");
    y = line(text, 42, y, 17, ink) + 12;
    doc.font("ReportRegular");
  };
  doc.rect(0, 0, 595, 9).fill(teal);
  doc.font("ReportBold");
  y = line("EvokeLoop / INSIGHTS STUDIO", 42, 45, 10, teal) + 30;
  y = line(result.name, 42, y, 29, ink, { width, lineGap: 4 }) + 18;
  doc.font("ReportRegular");
  paragraph(
    `${result.range.since} to ${result.range.until}  |  ${run.status === "partial" ? "Partial data" : run.status === "failed" ? "Data unavailable" : "Performance report"}`,
    12,
    teal
  );
  paragraph(
    `Prepared ${new Date(result.generatedAtMs).toISOString().replace("T", " ").slice(0, 16)} UTC · Reporting timezone: ${result.timezone}`,
    9
  );
  if (result.description) paragraph(result.description, 11, ink);
  if (result.previousRange)
    paragraph(
      `Compared with ${result.previousRange.since} to ${result.previousRange.until}.`,
      10
    );
  doc.moveTo(42, y).lineTo(553, y).strokeColor("#D9E4E9").stroke();
  y += 22;
  if (run.config.sections.summary) {
    heading("Executive summary");
    for (const f of result.findings) paragraph(f, 11, ink);
  }
  for (const [index, account] of Array.from(result.accounts.entries())) {
    if (index || y > 510) page();
    heading(account.name);
    paragraph(
      `${account.channel === "meta_ads" ? "Meta advertising" : "Facebook Page"} · ${account.currency || "No currency supplied"} · Source timezone: ${account.timezone || "not supplied"}`,
      9
    );
    if (account.error) {
      paragraph(account.error, 11, gold);
      continue;
    }
    for (let i = 0; i < account.metrics.length; i += 2) {
      ensure(96);
      for (const [col, m] of Array.from(
        account.metrics.slice(i, i + 2).entries()
      )) {
        const x = 42 + col * 261;
        doc.roundedRect(x, y, 250, 82, 7).fill(light);
        doc.font("ReportRegular");
        line(insightMetrics[m.key].label, x + 13, y + 10, 9, muted, {
          width: 222,
        });
        doc.font("ReportBold");
        line(
          insightNumber(m.value, m.key, account.currency),
          x + 13,
          y + 29,
          18,
          ink,
          { width: 222, height: 26, ellipsis: true }
        );
        doc.font("ReportRegular");
        line(
          m.key === "followers"
            ? "Current snapshot"
            : !run.config.compare
              ? "Selected period"
              : m.change === null
                ? `Previous: ${insightNumber(m.previous, m.key, account.currency)}`
                : `${m.change >= 0 ? "+" : ""}${m.change.toFixed(1)}%  /  Previous: ${insightNumber(m.previous, m.key, account.currency)}`,
          x + 13,
          y + 60,
          8,
          muted,
          { width: 222, height: 14, ellipsis: true }
        );
      }
      y += 94;
    }
    if (run.config.sections.trends) {
      const key = insightChartMetric(run.config.chartMetric, account);
      const points = account.series
        .map(p => ({ date: p.date, value: p.values[key] }))
        .filter(p => typeof p.value === "number" && Number.isFinite(p.value));
      if (points.length > 1) {
        ensure(221);
        heading(`${insightMetrics[key].label} over time`);
        const top = y + 10,
          bottom = y + 135,
          left = 90,
          right = 548;
        const max = Math.max(...points.map(p => p.value!), 1);
        for (let tick = 0; tick <= 4; tick++) {
          const yy = bottom - (tick / 4) * 125;
          doc
            .moveTo(left, yy)
            .lineTo(right, yy)
            .lineWidth(0.5)
            .strokeColor("#DFE7EC")
            .stroke();
          line(
            new Intl.NumberFormat("en-US", {
              notation: "compact",
              maximumFractionDigits: 1,
            }).format((max * tick) / 4),
            42,
            yy - 4,
            8,
            muted,
            { width: 42, align: "right" }
          );
        }
        const firstDate = Date.parse(points[0].date),
          lastDate = Date.parse(points[points.length - 1].date);
        const span = Math.max(lastDate - firstDate, 86400000);
        // Connect only contiguous reported dates, keeping missing days visibly blank.
        doc.strokeColor(teal).lineWidth(2);
        points.forEach((p, i) => {
          const x =
              left + ((Date.parse(p.date) - firstDate) / span) * (right - left),
            yy = bottom - (p.value! / max) * (bottom - top);
          const prev = i ? points[i - 1] : null;
          if (
            prev &&
            Date.parse(p.date) - Date.parse(prev.date) <= 86400000 * 1.1
          ) {
            const px =
                left +
                ((Date.parse(prev.date) - firstDate) / span) * (right - left),
              py = bottom - (prev.value! / max) * (bottom - top);
            doc.moveTo(px, py).lineTo(x, yy).stroke();
          }
          doc.circle(x, yy, points.length < 40 ? 2 : 1).fill(teal);
        });
        line(points[0].date.slice(0, 10), left, bottom + 10, 8, muted, {
          width: 150,
        });
        line(
          points[points.length - 1].date.slice(0, 10),
          right - 150,
          bottom + 10,
          8,
          muted,
          { width: 150, align: "right" }
        );
        y = bottom + 35;
        paragraph(
          `Unit: ${insightMetrics[key].unit === "currency" ? account.currency || "currency not supplied" : insightMetrics[key].unit}. Dates with no reported values are omitted.`,
          8
        );
      }
    }
    if (run.config.sections.details && account.details.length) {
      heading(account.detailLabel);
      const metrics = account.detailMetrics;
      const nameWidth = 215,
        cellWidth = (width - nameWidth) / metrics.length;
      const tableHeader = () => {
        ensure(55);
        doc.rect(42, y, width, 38).fill(ink);
        doc.font("ReportBold");
        line("Campaign / post", 50, y + 10, 9, "#FFFFFF", {
          width: nameWidth - 16,
        });
        metrics.forEach((key, i) =>
          line(
            insightMetrics[key].label,
            42 + nameWidth + i * cellWidth,
            y + 8,
            8,
            "#FFFFFF",
            { width: cellWidth - 8, height: 28, align: "right" }
          )
        );
        doc.font("ReportRegular");
        y += 38;
      };
      tableHeader();
      for (const [i, row] of Array.from(account.details.entries())) {
        const rowHeight = Math.max(
          40,
          Math.min(
            90,
            doc
              .fontSize(9)
              .heightOfString(row.name, { width: nameWidth - 16, lineGap: 2 }) +
              18
          )
        );
        if (y + rowHeight > 765) {
          page();
          tableHeader();
        }
        if (i % 2 === 0) doc.rect(42, y, width, rowHeight).fill(light);
        line(row.name, 50, y + 8, 9, ink, {
          width: nameWidth - 16,
          height: rowHeight - 14,
          ellipsis: true,
        });
        metrics.forEach((key, col) =>
          line(
            insightNumber(row.values[key], key, account.currency),
            42 + nameWidth + col * cellWidth,
            y + 9,
            8,
            ink,
            {
              width: cellWidth - 8,
              align: "right",
              height: rowHeight - 14,
              ellipsis: true,
            }
          )
        );
        y += rowHeight;
      }
      y += 16;
      paragraph("Up to 30 campaigns or posts are included per source.", 8);
    }
    const notesHeight = account.warnings.reduce(
      (sum, note) =>
        sum +
        doc
          .font("ReportRegular")
          .fontSize(9)
          .heightOfString(note, { width, lineGap: 3 }) +
        10,
      50
    );
    ensure(Math.min(notesHeight, 710));
    heading("Source notes");
    for (const note of account.warnings) paragraph(note, 9);
  }
  ensure(170);
  heading("Methodology & data quality");
  for (const note of result.warnings) paragraph(note, 9);
  paragraph(
    `Report revision ${run.revision}. Run ${run.id}. This export preserves this run's original data and settings.`,
    8
  );
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font("ReportRegular")
      .fontSize(8)
      .fillColor(muted)
      .text("EvokeLoop / Insights Studio", 42, 802, {
        width: 350,
        lineBreak: false,
      });
    doc.text(`${i + 1} / ${pages.count}`, 480, 802, {
      width: 73,
      align: "right",
      lineBreak: false,
    });
    if (i) {
      doc
        .fontSize(8)
        .fillColor(teal)
        .text(result.name, 42, 29, { width: 511, height: 16, ellipsis: true });
    }
    doc.page.margins.bottom = bottomMargin;
  }
  doc.end();
  return output;
}
