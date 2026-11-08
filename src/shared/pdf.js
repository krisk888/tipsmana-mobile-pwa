/**
 * Générateur PDF minimal (texte + rectangles), sans dépendance : A4 portrait,
 * Helvetica / Helvetica-Bold en WinAnsiEncoding (accents français, €).
 *
 *   const doc = createPdf()
 *   doc.text('Titre', { size: 18, bold: true })
 *   doc.row('CA', '1 234,00 €')
 *   const blob = doc.toBlob()
 */

const PAGE_W = 595
const PAGE_H = 842
const MARGIN = 50
const VALUE_X = 380

// Caractères hors Latin-1 présents dans la police WinAnsi
const WIN_ANSI = {
  '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94,
  '•': 0x95, '–': 0x96, '—': 0x97, 'œ': 0x9c, 'Œ': 0x8c, 'Ÿ': 0x9f,
  ' ': 0x20, ' ': 0x20, // espaces fines (Intl.NumberFormat fr)
}

/** Chaîne JS → chaîne d'octets WinAnsi échappée pour un littéral PDF ( … ). */
export function encodePdfText(str) {
  let out = ''
  for (const ch of String(str ?? '')) {
    let code = WIN_ANSI[ch]
    if (code == null) {
      code = ch.codePointAt(0)
      if (code > 0xff || (code >= 0x7f && code < 0xa0)) code = 0x3f // hors police : « ? »
      else if (code < 0x20) code = 0x20
    }
    const c = String.fromCharCode(code)
    out += c === '(' || c === ')' || c === '\\' ? '\\' + c : c
  }
  return out
}

function num(n) {
  return Number(n.toFixed(2)).toString()
}

export function createPdf() {
  const pages = [[]]
  let y = PAGE_H - MARGIN

  function ops() { return pages[pages.length - 1] }

  function ensure(height) {
    if (y - height < MARGIN) {
      pages.push([])
      y = PAGE_H - MARGIN
    }
  }

  function textAt(x, str, { size = 11, bold = false, gray = 0 } = {}) {
    ops().push(`${num(gray)} g BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${num(x)} ${num(y)} Td (${encodePdfText(str)}) Tj ET`)
  }

  return {
    /** Ligne de texte pleine largeur */
    text(str, { size = 11, bold = false, gray = 0, gap = 6 } = {}) {
      ensure(size + gap)
      y -= size
      textAt(MARGIN, str, { size, bold, gray })
      y -= gap
      return this
    },
    /** Libellé à gauche, valeur en colonne de droite */
    row(label, value, { size = 11, bold = false, gap = 6 } = {}) {
      ensure(size + gap)
      y -= size
      textAt(MARGIN, label, { size, bold })
      textAt(VALUE_X, value, { size, bold: true })
      y -= gap
      return this
    },
    /** Barre horizontale proportionnelle (ratio 0–1) sous la ligne précédente */
    bar(ratio, { color = [0.02, 0.59, 0.41], height = 5, gap = 8 } = {}) {
      ensure(height + gap)
      const width = Math.max(0, Math.min(1, ratio)) * (PAGE_W - 2 * MARGIN)
      y -= height
      ops().push(`0.9 g ${MARGIN} ${num(y)} ${PAGE_W - 2 * MARGIN} ${height} re f`)
      if (width > 0) ops().push(`${color.map(num).join(' ')} rg ${MARGIN} ${num(y)} ${num(width)} ${height} re f`)
      y -= gap
      return this
    },
    rule({ gap = 10 } = {}) {
      ensure(gap * 2)
      y -= gap
      ops().push(`0.8 G 0.5 w ${MARGIN} ${num(y)} m ${PAGE_W - MARGIN} ${num(y)} l S`)
      y -= gap
      return this
    },
    space(h = 10) {
      y -= h
      return this
    },
    get pageCount() { return pages.length },

    /** Document PDF 1.4 sous forme de chaîne d'octets (un caractère = un octet) */
    toBinaryString() {
      const objects = []
      const add = body => objects.push(body) // numéro d'objet = index + 1
      add('<< /Type /Catalog /Pages 2 0 R >>')
      add(null) // Pages : rempli quand les pages sont connues
      add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
      add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
      const kids = []
      for (const pageOps of pages) {
        const stream = pageOps.join('\n')
        add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
        const contentRef = objects.length
        add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentRef} 0 R >>`)
        kids.push(`${objects.length} 0 R`)
      }
      objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`

      let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
      const offsets = []
      objects.forEach((body, i) => {
        offsets.push(out.length)
        out += `${i + 1} 0 obj\n${body}\nendobj\n`
      })
      const xref = out.length
      out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
      for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`
      out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
      return out
    },

    toBytes() {
      const bin = this.toBinaryString()
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return bytes
    },

    toBlob() {
      return new Blob([this.toBytes()], { type: 'application/pdf' })
    },
  }
}
