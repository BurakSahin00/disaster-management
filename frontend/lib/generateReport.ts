import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { RegionsGeoJson, ClustersGeoJson } from '@/types'

// jsPDF uses Helvetica which lacks Turkish glyphs — replace before rendering
function tr(s: string): string {
  return s
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
    .replace(/ş/g, 's').replace(/Ş/g, 'S')
    .replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O')
    .replace(/ü/g, 'u').replace(/Ü/g, 'U')
    .replace(/ç/g, 'c').replace(/Ç/g, 'C')
}

const BLUE   = [37,  99,  235] as const
const GREEN  = [22,  163,  74] as const
const LIME   = [101, 163,  13] as const
const ORANGE = [234,  88,  12] as const
const RED    = [220,  38,  38] as const
const GRAY   = [107, 114, 128] as const
const LGRAY  = [243, 244, 246] as const

const DAMAGE: { label: string; rgb: readonly [number, number, number] }[] = [
  { label: 'Hasarsiz',      rgb: GREEN  },
  { label: 'Az Hasarli',    rgb: LIME   },
  { label: 'Agir Hasarli',  rgb: ORANGE },
  { label: 'Yikik',         rgb: RED    },
]

export interface ReportInput {
  analysisId: string
  projectName: string
  counts: Record<number, number>
  total: number
  regionCount: number
  clusterCount: number
  regionsGeojson: RegionsGeoJson | null
  clustersGeojson: ClustersGeoJson | null
}

type Doc = jsPDF & { lastAutoTable: { finalY: number } }

// ── Helpers ──────────────────────────────────────────────────────────────────

function setColor(doc: jsPDF, rgb: readonly [number, number, number], kind: 'fill' | 'text' | 'draw') {
  const [r, g, b] = rgb
  if (kind === 'fill') doc.setFillColor(r, g, b)
  else if (kind === 'text') doc.setTextColor(r, g, b)
  else doc.setDrawColor(r, g, b)
}

function sectionTitle(doc: jsPDF, text: string, y: number): number {
  setColor(doc, BLUE, 'fill')
  doc.rect(14, y, 3, 5, 'F')
  setColor(doc, BLUE, 'text')
  doc.setFontSize(10.5)
  doc.setFont('helvetica', 'bold')
  doc.text(text, 20, y + 4)
  setColor(doc, [220, 220, 220], 'draw')
  doc.line(20, y + 6, doc.internal.pageSize.getWidth() - 14, y + 6)
  return y + 12
}

function statCard(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  rgb: readonly [number, number, number],
  value: string, label: string, sub: string,
) {
  // Card background
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(x, y, w, h, 2, 2, 'F')
  setColor(doc, [220, 220, 220], 'draw')
  doc.setLineWidth(0.3)
  doc.roundedRect(x, y, w, h, 2, 2, 'S')

  // Left accent bar
  setColor(doc, rgb, 'fill')
  doc.roundedRect(x, y, 3, h, 1, 1, 'F')

  // Value
  setColor(doc, rgb, 'text')
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(value, x + w / 2 + 1.5, y + h * 0.45, { align: 'center' })

  // Label
  setColor(doc, [30, 30, 30], 'text')
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.text(label, x + w / 2 + 1.5, y + h * 0.67, { align: 'center' })

  // Sub
  setColor(doc, GRAY, 'text')
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'normal')
  doc.text(sub, x + w / 2 + 1.5, y + h * 0.82, { align: 'center' })
}

function damageBar(
  doc: jsPDF,
  x: number, y: number, barW: number,
  pct: number, rgb: readonly [number, number, number],
) {
  // Track background
  setColor(doc, LGRAY, 'fill')
  doc.roundedRect(x, y + 1, barW, 3.5, 1, 1, 'F')
  // Fill
  if (pct > 0) {
    setColor(doc, rgb, 'fill')
    doc.roundedRect(x, y + 1, Math.max(barW * pct, 1.5), 3.5, 1, 1, 'F')
  }
}

function drawHeader(doc: jsPDF, projectName: string) {
  const W = doc.internal.pageSize.getWidth()

  // Blue top stripe
  setColor(doc, BLUE, 'fill')
  doc.rect(0, 0, W, 24, 'F')

  // Title
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Deprem Hasar Analiz Raporu', 14, 10)

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.text(tr('DisasterSense — ML Destekli Bina Hasar Degerlendirme Sistemi'), 14, 17)

  // Date top-right
  const now = new Date().toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' })
  doc.text(tr(now), W - 14, 17, { align: 'right' })

  // Project name band
  setColor(doc, [245, 247, 255], 'fill')
  doc.rect(0, 24, W, 12, 'F')
  setColor(doc, BLUE, 'text')
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(tr(projectName || 'Isimsiz Proje'), 14, 32)
}

function drawFooter(doc: jsPDF, pageNum: number, totalPages: number) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()

  setColor(doc, LGRAY, 'fill')
  doc.rect(0, H - 12, W, 12, 'F')

  setColor(doc, GRAY, 'text')
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.text('DisasterSense — Gizli / Kurumsal Kullanim', 14, H - 4.5)
  doc.text(`Sayfa ${pageNum} / ${totalPages}`, W - 14, H - 4.5, { align: 'right' })
}

function riskLabel(damagedPct: number): { text: string; rgb: readonly [number, number, number] } {
  if (damagedPct >= 50) return { text: 'COK YUKSEK', rgb: RED }
  if (damagedPct >= 30) return { text: 'YUKSEK',     rgb: ORANGE }
  if (damagedPct >= 10) return { text: 'ORTA',        rgb: LIME }
  return                       { text: 'DUSUK',       rgb: GREEN }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function generateDamageReport(input: ReportInput): void {
  const { analysisId, projectName, counts, total, regionCount, clusterCount, regionsGeojson, clustersGeojson } = input
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }) as Doc
  const W = doc.internal.pageSize.getWidth()

  drawHeader(doc, projectName)

  let y = 42

  // ── Meta bilgi (iki sütun) ────────────────────────────────────────────
  const metaLeft  = [
    ['Analiz ID',         analysisId.slice(0, 18) + '…'],
    ['Koordinat Sistemi', 'EPSG:4326 (WGS 84)'],
  ]
  const metaRight = [
    ['Rapor Tarihi', tr(new Date().toLocaleDateString('tr-TR', { dateStyle: 'long' }))],
    ['Model',        tr('SegFormer + 4-sinif hasar siniflandirici')],
  ]
  const colW = (W - 28 - 6) / 2

  autoTable(doc, {
    startY: y,
    head: [['Alan', 'Deger']],
    body: metaLeft,
    theme: 'plain',
    headStyles: { fillColor: [235, 238, 255], textColor: [60, 60, 60], fontStyle: 'bold', fontSize: 7.5, cellPadding: 2 },
    bodyStyles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 38, fontStyle: 'bold', textColor: [80, 80, 80] } },
    margin: { left: 14, right: colW + 14 + 6 },
    tableWidth: colW,
  })

  autoTable(doc, {
    startY: y,
    head: [['Alan', 'Deger']],
    body: metaRight,
    theme: 'plain',
    headStyles: { fillColor: [235, 238, 255], textColor: [60, 60, 60], fontStyle: 'bold', fontSize: 7.5, cellPadding: 2 },
    bodyStyles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 32, fontStyle: 'bold', textColor: [80, 80, 80] } },
    margin: { left: colW + 20, right: 14 },
    tableWidth: colW,
  })

  y = doc.lastAutoTable.finalY + 8

  // ── İstatistik kartları ───────────────────────────────────────────────
  const damaged    = (counts[2] ?? 0) + (counts[3] ?? 0)
  const safe       = (counts[0] ?? 0) + (counts[1] ?? 0)
  const damagedPct = total > 0 ? Math.round((damaged / total) * 100) : 0
  const safePct    = total > 0 ? Math.round((safe / total) * 100) : 0

  const cardW = (W - 28 - 9) / 4
  const cardH = 22
  const cards = [
    { value: String(total),           label: 'TOPLAM BINA',   sub: 'Tespit edilen',    rgb: BLUE   },
    { value: String(safe),            label: 'GUVENLI',        sub: `%${safePct} oran`, rgb: GREEN  },
    { value: String(damaged),         label: 'ETKILENEN',      sub: `%${damagedPct} oran`, rgb: ORANGE },
    { value: String(counts[3] ?? 0),  label: 'YIKIK',          sub: `%${total > 0 ? Math.round(((counts[3]??0)/total)*100) : 0} oran`, rgb: RED },
  ] as const
  cards.forEach((c, i) => {
    statCard(doc, 14 + i * (cardW + 3), y, cardW, cardH, c.rgb, c.value, c.label, c.sub)
  })
  y += cardH + 10

  // ── Risk Badge ────────────────────────────────────────────────────────
  const risk = riskLabel(damagedPct)
  setColor(doc, risk.rgb, 'fill')
  doc.roundedRect(14, y, W - 28, 10, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text(`GENEL HASAR RISKI: ${risk.text}  —  ${damagedPct}% bina etkilendi`, W / 2, y + 6.5, { align: 'center' })
  y += 16

  // ── Hasar Sınıfı Dağılımı ─────────────────────────────────────────────
  y = sectionTitle(doc, '1. Hasar Sinifi Dagilimi', y)

  DAMAGE.forEach((d, i) => {
    const cnt = counts[i] ?? 0
    const pct = total > 0 ? cnt / total : 0
    const pctLabel = `%${Math.round(pct * 100)}`
    const barX  = 14
    const barW  = W - 28
    const rowH  = 9

    // Row bg alternate
    if (i % 2 === 0) {
      setColor(doc, LGRAY, 'fill')
      doc.rect(barX, y, barW, rowH, 'F')
    }

    // Color dot
    setColor(doc, d.rgb, 'fill')
    doc.circle(barX + 5, y + rowH / 2, 2, 'F')

    // Label
    setColor(doc, [30, 30, 30], 'text')
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.text(d.label, barX + 10, y + rowH / 2 + 1.2)

    // Count + pct (right-aligned)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    setColor(doc, GRAY, 'text')
    doc.text(`${cnt} bina  ${pctLabel}`, barX + barW - 2, y + 4, { align: 'right' })

    // Bar
    const trackX = barX + 40
    const trackW = barW - 80
    damageBar(doc, trackX, y + 2.5, trackW, pct, d.rgb)

    y += rowH
  })
  y += 8

  // ── Bölge Analizi ──────────────────────────────────────────────────────
  if (y > 235) { doc.addPage(); drawHeader(doc, projectName); y = 42 }

  y = sectionTitle(doc, '2. Bolge Analizi (Izgara)', y)

  if (regionCount === 0 || !regionsGeojson) {
    setColor(doc, GRAY, 'text')
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'italic')
    doc.text('Bolge verisi henuz hesaplanmamis veya mevcut degil.', 14, y)
    y += 8
  } else {
    const sevs      = regionsGeojson.features.map((f) => f.properties.severity ?? 0)
    const avgSev    = sevs.reduce((a, b) => a + b, 0) / sevs.length
    const maxSev    = Math.max(...sevs)
    const critical  = sevs.filter((s) => s >= 2).length

    autoTable(doc, {
      startY: y,
      head: [['Metrik', 'Deger', 'Aciklama']],
      body: [
        ['Toplam Hucre',          String(regionCount),     'Izgara bolge sayisi'],
        ['Ort. Hasar Siddeti',    avgSev.toFixed(3),       '0=Hasarsiz, 3=Yikik'],
        ['Max. Hasar Siddeti',    maxSev.toFixed(3),       'En cok etkilenen hucre'],
        ['Kritik Hucre (>=2.0)',  String(critical),        `${regionCount > 0 ? Math.round(critical/regionCount*100) : 0}% kritik bolge`],
        ['Hasar Kumesi Sayisi',   String(clusterCount),    'DBSCAN kume sonucu'],
      ],
      theme: 'grid',
      headStyles: { fillColor: [...ORANGE] as [number,number,number], textColor: [255,255,255], fontSize: 8.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8.5 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 }, 2: { textColor: [120,120,120], fontSize: 7.5 } },
      alternateRowStyles: { fillColor: [255, 247, 237] },
      margin: { left: 14, right: 14 },
    })
    y = doc.lastAutoTable.finalY + 8
  }

  // ── Küme Analizi ───────────────────────────────────────────────────────
  if (y > 220) { doc.addPage(); drawHeader(doc, projectName); y = 42 }

  y = sectionTitle(doc, '3. Kume Analizi (DBSCAN)', y)

  if (clusterCount === 0 || !clustersGeojson) {
    setColor(doc, GRAY, 'text')
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'italic')
    doc.text('Kume verisi henuz hesaplanmamis veya mevcut degil.', 14, y)
    y += 8
  } else {
    const rows = clustersGeojson.features.map((f, i) => {
      const sev = f.properties.avg_cell_severity ?? f.properties.severity ?? 0
      const { text: risk } = riskLabel(sev * 33.3)
      return [
        String(i + 1),
        String(f.properties.region_cells ?? '—'),
        sev.toFixed(3),
        risk,
      ]
    })

    autoTable(doc, {
      startY: y,
      head: [['Kume No', 'Hucre Sayisi', 'Ort. Siddet', 'Risk']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [124, 58, 237], textColor: [255,255,255], fontSize: 8.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8.5 },
      columnStyles: {
        0: { cellWidth: 22, halign: 'center' },
        1: { cellWidth: 32, halign: 'center' },
        2: { cellWidth: 32, halign: 'center' },
      },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const risk = rows[data.row.index]?.[3]
          const rgb = risk === 'COK YUKSEK' ? RED : risk === 'YUKSEK' ? ORANGE : risk === 'ORTA' ? LIME : GREEN
          setColor(doc, rgb, 'fill')
          doc.roundedRect(data.cell.x + 1, data.cell.y + 1.5, data.cell.width - 2, data.cell.height - 3, 1, 1, 'F')
          doc.setTextColor(255, 255, 255)
          doc.setFontSize(7)
          doc.setFont('helvetica', 'bold')
          doc.text(risk ?? '', data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: 'center' })
        }
      },
      alternateRowStyles: { fillColor: [245, 243, 255] },
      margin: { left: 14, right: 14 },
    })
    y = doc.lastAutoTable.finalY + 8
  }

  // ── Yasal not ─────────────────────────────────────────────────────────
  if (y > 245) { doc.addPage(); drawHeader(doc, projectName); y = 42 }
  setColor(doc, LGRAY, 'fill')
  doc.roundedRect(14, y, W - 28, 16, 2, 2, 'F')
  setColor(doc, GRAY, 'text')
  doc.setFontSize(7)
  doc.setFont('helvetica', 'italic')
  const note = tr(
    'Bu rapor otomatik ML analizi sonucunda uretilmistir. Sonuclar tahmine dayalidir ve saha dogrulamasi gerektirmektedir. ' +
    'Resmi karar alma sureclerinde uzman degerlendirmesiyle birlikte kullanilmalidir.'
  )
  const lines = doc.splitTextToSize(note, W - 36)
  doc.text(lines, 20, y + 6)

  // ── Footer tüm sayfalara ──────────────────────────────────────────────
  const totalPages = (doc.internal as unknown as { pages: unknown[] }).pages.length - 1
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    drawFooter(doc, i, totalPages)
  }

  const filename = tr(`hasar_raporu_${analysisId.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.pdf`)
  doc.save(filename)
}
