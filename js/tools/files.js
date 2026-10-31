// File creation (PDF, DOCX, XLSX, CSV, code, …) and attachment reading (text, PDF, DOCX, XLSX, media).
import { fileExt, readAsText, readAsDataURL, readAsArrayBuffer, uid, formatBytes } from '../util.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
const MIME = {
  pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', md: 'text/markdown', txt: 'text/plain',
  json: 'application/json', html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', ts: 'text/plain', py: 'text/x-python',
  svg: 'image/svg+xml', xml: 'application/xml', yaml: 'text/yaml', yml: 'text/yaml', ics: 'text/calendar', sql: 'text/plain', sh: 'text/x-sh', java: 'text/plain',
  c: 'text/plain', cpp: 'text/plain', go: 'text/plain', rs: 'text/plain', rb: 'text/plain', php: 'text/plain', swift: 'text/plain', kt: 'text/plain', tsv: 'text/tab-separated-values', vcf: 'text/vcard',
};
export const mimeFor = (name) => MIME[fileExt(name)] || 'text/plain';

export function fileBadge(name) {
  const e = fileExt(name);
  const map = { docx: 'DOC', doc: 'DOC', xlsx: 'XLS', xls: 'XLS', pptx: 'PPT', markdown: 'MD', javascript: 'JS', mjs: 'JS', python: 'PY', yaml: 'YML' };
  return (map[e] || e || 'FILE').toUpperCase().slice(0, 4);
}

export function fileKindLabel(name) {
  const e = fileExt(name);
  return ({ pdf: 'PDF document', docx: 'Word document', xlsx: 'Excel spreadsheet', csv: 'CSV spreadsheet', md: 'Markdown', txt: 'Text file', json: 'JSON', html: 'Web page', svg: 'SVG image', ics: 'Calendar event', py: 'Python script', js: 'JavaScript', ts: 'TypeScript', css: 'Stylesheet' })[e] || `${e.toUpperCase() || 'Text'} file`;
}

// ---------------------------------------------------------------------------
// Markdown → simple block model (shared by PDF and DOCX writers)
// ---------------------------------------------------------------------------
function mdBlocks(md) {
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  const flush = () => { if (para.length) { out.push({ t: 'p', text: para.join('\n') }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m;
    if (/^\s*```/.test(l)) {
      flush();
      const code = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      out.push({ t: 'code', text: code.join('\n') });
      continue;
    }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) { flush(); out.push({ t: 'h', level: m[1].length, text: m[2] }); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { flush(); out.push({ t: 'hr' }); continue; }
    if (l.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      flush();
      const row = (s) => s.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = row(l);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|')) rows.push(row(lines[i++]));
      i--;
      out.push({ t: 'table', head, rows });
      continue;
    }
    if ((m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l))) { flush(); out.push({ t: 'li', ordered: /\d/.test(m[2]), marker: m[2], level: Math.floor(m[1].length / 2), text: m[3] }); continue; }
    if ((m = /^\s*>\s?(.*)$/.exec(l))) { flush(); out.push({ t: 'quote', text: m[1] }); continue; }
    if (!l.trim()) { flush(); continue; }
    para.push(l.trim());
  }
  flush();
  return out;
}

// Inline runs: **bold**, *italic*, `code`; links reduced to text.
function runs(text) {
  const s = String(text).replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1').replace(/\[(\d+)\]/g, '[$1]');
  const out = [];
  const re = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index), b: false, i: false, code: false });
    const tok = m[0];
    if (tok.startsWith('**') || tok.startsWith('__')) out.push({ text: tok.slice(2, -2), b: true });
    else if (tok.startsWith('`')) out.push({ text: tok.slice(1, -1), code: true });
    else out.push({ text: tok.slice(1, -1), i: true });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out.filter((r) => r.text);
}

// ---------------------------------------------------------------------------
// PDF writer (standard Type1 fonts, WinAnsi encoding)
// ---------------------------------------------------------------------------
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const WIN = { '€': 128, '‚': 130, 'ƒ': 131, '„': 132, '…': 133, '†': 134, '‡': 135, 'ˆ': 136, '‰': 137, 'Š': 138, '‹': 139, 'Œ': 140, 'Ž': 142, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '˜': 152, '™': 153, 'š': 154, '›': 155, 'œ': 156, 'ž': 158, 'Ÿ': 159 };
function toWin(str) {
  let out = '';
  for (const ch of String(str)) {
    const c = ch.codePointAt(0);
    if (c < 128) out += ch;
    else if (WIN[ch]) out += String.fromCharCode(WIN[ch]);
    else if (c >= 160 && c <= 255) out += ch;
    else if (/[✓✔]/.test(ch)) out += 'v';
    else if (/[→⇒]/.test(ch)) out += '->';
    else if (/[←]/.test(ch)) out += '<-';
    else if (/[×]/.test(ch)) out += String.fromCharCode(215);
    else if (/[≤]/.test(ch)) out += '<=';
    else if (/[≥]/.test(ch)) out += '>=';
    else if (/[✦★☆]/.test(ch)) out += '*';
    else if (/\p{Extended_Pictographic}|[\u200d\ufe0f]/u.test(ch)) out += '';
    else out += '?';
  }
  return out;
}
function charW(c, font) {
  if (font === 'F3') return 600;
  const code = c.charCodeAt(0);
  const w = code >= 32 && code <= 126 ? HELV[code - 32] : 556;
  return font === 'F2' ? w * 1.06 : w;
}
function textW(s, font, size) { let w = 0; for (const c of s) w += charW(c, font); return (w / 1000) * size; }
function pdfStr(s) { return '(' + s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[\x80-\xff]/g, (c) => '\\' + c.charCodeAt(0).toString(8).padStart(3, '0')) + ')'; }

export function markdownToPDF(md, { title = 'Document' } = {}) {
  const PW = 595.28, PH = 841.89, M = 56, CW = PW - M * 2;
  const pages = [];
  let ops = [];
  let y = PH - M;
  const newPage = () => { if (ops.length) pages.push(ops); ops = []; y = PH - M; };
  const ensure = (h) => { if (y - h < M + 20) newPage(); };
  const fontOf = (r) => (r.code ? 'F3' : r.b ? 'F2' : r.i ? 'F4' : 'F1');

  function flow(rs, size, { indent = 0, lead = 1.45, color = '0.07 0.08 0.23', prefix = null } = {}) {
    const words = [];
    rs.forEach((r) => {
      const f = fontOf(r);
      toWin(r.text).split(/(\s+)/).forEach((w) => { if (w) words.push({ w, f }); });
    });
    const lh = size * lead;
    const maxW = CW - indent;
    let line = [], lw = 0;
    const emit = (first) => {
      ensure(lh);
      y -= lh;
      let x = M + indent;
      if (first && prefix) ops.push(`BT /F1 ${size} Tf ${color} rg ${(M + indent - 14).toFixed(2)} ${y.toFixed(2)} Td ${pdfStr(toWin(prefix))} Tj ET`);
      // trim trailing spaces
      while (line.length && /^\s+$/.test(line[line.length - 1].w)) line.pop();
      line.forEach((t) => {
        const fs = t.f === 'F3' ? size * 0.92 : size;
        ops.push(`BT /${t.f} ${fs} Tf ${color} rg ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfStr(t.w)} Tj ET`);
        x += textW(t.w, t.f, fs);
      });
    };
    let first = true;
    for (const t of words) {
      if (t.w.includes('\n')) { if (line.length) { emit(first); first = false; } line = []; lw = 0; continue; }
      const ww = textW(t.w, t.f, size);
      if (lw + ww > maxW && line.length && !/^\s+$/.test(t.w)) { emit(first); first = false; line = []; lw = 0; }
      if (!line.length && /^\s+$/.test(t.w)) continue;
      line.push(t); lw += ww;
    }
    if (line.length) emit(first);
  }

  // Title
  flow([{ text: title, b: true }], 22, { color: '0.17 0.15 0.62' });
  y -= 4;
  ops.push(`0.43 0.24 0.96 RG 2 w ${M} ${y.toFixed(2)} m ${M + 60} ${y.toFixed(2)} l S`);
  y -= 14;

  for (const b of mdBlocks(md)) {
    if (b.t === 'h') {
      if (b.level === 1 && b.text.trim() === title.trim()) continue;
      const size = [0, 18, 15, 13, 12, 11, 11][b.level];
      y -= size * 0.6;
      ensure(size * 2.2);
      flow(runs(b.text).map((r) => ({ ...r, b: true })), size, { color: b.level <= 2 ? '0.17 0.15 0.62' : '0.07 0.08 0.23' });
      y -= 4;
    } else if (b.t === 'p') { flow(runs(b.text), 11); y -= 7; }
    else if (b.t === 'quote') { const y0 = y; flow(runs(b.text), 11, { indent: 14, color: '0.3 0.32 0.5' }); ops.push(`0.55 0.42 1 RG 2 w ${M + 4} ${(y0 - 3).toFixed(2)} m ${M + 4} ${(y + 3).toFixed(2)} l S`); y -= 6; }
    else if (b.t === 'li') { flow(runs(b.text), 11, { indent: 18 + b.level * 16, prefix: b.ordered ? b.marker : '•' }); y -= 3; }
    else if (b.t === 'hr') { y -= 8; ensure(10); ops.push(`0.8 0.8 0.9 RG 0.7 w ${M} ${y.toFixed(2)} m ${PW - M} ${y.toFixed(2)} l S`); y -= 10; }
    else if (b.t === 'code') {
      const lines = b.text.split('\n');
      const size = 9.2, lh = size * 1.45;
      y -= 4;
      for (let k = 0; k < lines.length; k++) {
        ensure(lh + 4);
        if (k === 0 || y === PH - M) ops.push('');
        y -= lh;
        ops.push(`0.95 0.95 0.99 rg ${M - 6} ${(y - 4).toFixed(2)} ${CW + 12} ${lh} re f`);
        let s = toWin(lines[k]);
        const maxChars = Math.floor(CW / (size * 0.6));
        if (s.length > maxChars) s = s.slice(0, maxChars - 1) + '>';
        ops.push(`BT /F3 ${size} Tf 0.15 0.15 0.35 rg ${M} ${y.toFixed(2)} Td ${pdfStr(s)} Tj ET`);
      }
      y -= 12;
    } else if (b.t === 'table') {
      const cols = b.head.length, cw = CW / cols, size = 9.5, lh = size * 1.5;
      const row = (cells, bold, shade) => {
        const wrapped = cells.map((c) => {
          const out = []; let line = '';
          toWin(String(c ?? '').replace(/\*\*/g, '')).split(' ').forEach((w) => {
            if (textW(line + ' ' + w, bold ? 'F2' : 'F1', size) > cw - 10 && line) { out.push(line); line = w; } else line = line ? line + ' ' + w : w;
          });
          out.push(line); return out;
        });
        const h = Math.max(...wrapped.map((w) => w.length)) * lh + 6;
        ensure(h);
        if (shade) ops.push(`0.93 0.92 1 rg ${M} ${(y - h).toFixed(2)} ${CW} ${h.toFixed(2)} re f`);
        wrapped.forEach((ls, ci) => ls.forEach((t, li) => ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf 0.07 0.08 0.23 rg ${(M + ci * cw + 5).toFixed(2)} ${(y - 4 - (li + 1) * lh + 4).toFixed(2)} Td ${pdfStr(t)} Tj ET`)));
        y -= h;
        ops.push(`0.85 0.85 0.93 RG 0.5 w ${M} ${y.toFixed(2)} m ${PW - M} ${y.toFixed(2)} l S`);
      };
      row(b.head, true, true);
      b.rows.forEach((r) => row(r, false, false));
      y -= 12;
    }
  }
  if (ops.length) pages.push(ops);

  // serialize
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  const catalog = add(null), pagesId = add(null);
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const f3 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
  const f4 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');
  const kids = [];
  pages.forEach((p, i) => {
    const footer = `BT /F1 8.5 Tf 0.5 0.52 0.66 rg ${M} 30 Td ${pdfStr(toWin(`${title} — page ${i + 1} of ${pages.length}`))} Tj ET BT /F1 8.5 Tf 0.5 0.52 0.66 rg ${PW - M - 70} 30 Td (Created with Nova) Tj ET`;
    const stream = p.filter(Boolean).join('\n') + '\n' + footer;
    const contents = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R /F3 ${f3} 0 R /F4 ${f4} 0 R >> >> /Contents ${contents} 0 R >>`));
  });
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const info = add(`<< /Title ${pdfStr(toWin(title))} /Producer (Nova AI) /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}) >>`);
  let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: 'application/pdf' });
}

// ---------------------------------------------------------------------------
// ZIP (store) writer + reader (for DOCX/XLSX)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

export function zipStore(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true); cen.setUint16(28, name.length, true); cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cenSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)]);
}

export async function unzip(buf) {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const files = {};
  for (let n = 0; n < count; n++) {
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), nlen = v.getUint16(p + 28, true), elen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), lho = v.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nlen));
    files[name] = { method, csize, lho };
    p += 46 + nlen + elen + clen;
  }
  return {
    names: Object.keys(files),
    async text(name) {
      const f = files[name];
      if (!f) return null;
      const lnl = v.getUint16(f.lho + 26, true), lel = v.getUint16(f.lho + 28, true);
      const data = new Uint8Array(buf, f.lho + 30 + lnl + lel, f.csize);
      if (f.method === 0) return dec.decode(data);
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(stream).text();
    },
  };
}

// ---------------------------------------------------------------------------
// DOCX writer
// ---------------------------------------------------------------------------
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function wRuns(text, extra = '') {
  return runs(text).map((r) => {
    const pr = [r.b ? '<w:b/>' : '', r.i ? '<w:i/>' : '', r.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:shd w:val="clear" w:fill="EEEEF8"/>' : '', extra].join('');
    return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEsc(r.text).replace(/\n/g, '</w:t><w:br/><w:t xml:space="preserve">')}</w:t></w:r>`;
  }).join('');
}

export function markdownToDOCX(md, { title = 'Document' } = {}) {
  const body = [];
  body.push(`<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr>${wRuns(title)}</w:p>`);
  for (const b of mdBlocks(md)) {
    if (b.t === 'h') { if (b.level === 1 && b.text.trim() === title.trim()) continue; body.push(`<w:p><w:pPr><w:pStyle w:val="Heading${Math.min(3, b.level)}"/></w:pPr>${wRuns(b.text)}</w:p>`); }
    else if (b.t === 'p') body.push(`<w:p>${wRuns(b.text)}</w:p>`);
    else if (b.t === 'quote') body.push(`<w:p><w:pPr><w:pStyle w:val="Quote"/></w:pPr>${wRuns(b.text)}</w:p>`);
    else if (b.t === 'li') body.push(`<w:p><w:pPr><w:ind w:left="${720 + b.level * 360}" w:hanging="360"/></w:pPr><w:r><w:t xml:space="preserve">${b.ordered ? xmlEsc(b.marker) : '•'}\t</w:t></w:r>${wRuns(b.text)}</w:p>`);
    else if (b.t === 'hr') body.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="C4B5FD"/></w:pBdr></w:pPr></w:p>');
    else if (b.t === 'code') b.text.split('\n').forEach((l) => body.push(`<w:p><w:pPr><w:pStyle w:val="Code"/></w:pPr><w:r><w:t xml:space="preserve">${xmlEsc(l)}</w:t></w:r></w:p>`));
    else if (b.t === 'table') {
      const cell = (c, head) => `<w:tc><w:tcPr>${head ? '<w:shd w:val="clear" w:fill="EDE9FE"/>' : ''}</w:tcPr><w:p>${wRuns(c ?? '', head ? '<w:b/>' : '')}</w:p></w:tc>`;
      body.push(`<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:color="C7C9E8"/>`).join('')}</w:tblBorders></w:tblPr>
<w:tr>${b.head.map((c) => cell(c, true)).join('')}</w:tr>${b.rows.map((r) => `<w:tr>${b.head.map((_, k) => cell(r[k], false)).join('')}</w:tr>`).join('')}</w:tbl><w:p/>`);
    }
  }
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1200" w:right="1200" w:bottom="1200" w:left="1200" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:color w:val="11143A"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:color w:val="2B2A9E"/><w:sz w:val="48"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="2B2A9E"/><w:sz w:val="34"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="4C2BC4"/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="567"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="8B5CF6"/></w:pBdr></w:pPr><w:rPr><w:i/><w:color w:val="484D7C"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:shd w:val="clear" w:fill="F2F2FC"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="19"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;
  return zipStore([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
    { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEsc(title)}</dc:title><dc:creator>Nova AI</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>` },
    { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'word/document.xml', data: doc },
    { name: 'word/styles.xml', data: styles },
  ]);
}

// ---------------------------------------------------------------------------
// XLSX writer (from CSV / TSV / markdown table)
// ---------------------------------------------------------------------------
export function parseCSV(text) {
  const t = String(text).trim();
  if (/^\s*\|/.test(t)) {
    const rows = t.split('\n').filter((l) => l.includes('|') && !/^\s*\|?\s*:?-+/.test(l));
    return rows.map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  }
  const delim = t.split('\n')[0].includes('\t') ? '\t' : t.split('\n')[0].includes(';') && !t.split('\n')[0].includes(',') ? ';' : ',';
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  row.push(cur); rows.push(row);
  return rows;
}

export function tableToXLSX(rows, { sheet = 'Sheet1' } = {}) {
  const col = (n) => { let s = ''; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const widths = rows[0]?.map((_, c) => Math.min(60, Math.max(8, ...rows.map((r) => String(r[c] ?? '').length + 2)))) || [];
  const data = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
    const ref = col(ci) + (ri + 1);
    const s = ri === 0 ? ' s="1"' : '';
    const num = String(v).trim();
    if (ri > 0 && /^-?\d+(\.\d+)?$/.test(num)) return `<c r="${ref}"${s}><v>${num}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xmlEsc(v ?? '')}</t></is></c>`;
  }).join('')}</row>`).join('');
  return zipStore([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(sheet.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF5B2BE0"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs></styleSheet>' },
    { name: 'xl/worksheets/sheet1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${data}</sheetData></worksheet>` },
  ]);
}

/** Build a downloadable Blob for a generated file. */
export function buildFile(name, content) {
  const ext = fileExt(name);
  const h1 = /^#\s+(.+)$/m.exec(content || '')?.[1]?.replace(/[*_`]/g, '').trim();
  const title = h1 || name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  if (ext === 'pdf') return markdownToPDF(content, { title });
  if (ext === 'docx' || ext === 'doc') return markdownToDOCX(content, { title });
  if (ext === 'xlsx' || ext === 'xls') return tableToXLSX(parseCSV(content), { sheet: title });
  return new Blob([content], { type: mimeFor(name) + ';charset=utf-8' });
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------
const TEXT_EXT = /^(txt|md|markdown|csv|tsv|json|jsonl|xml|yaml|yml|toml|ini|cfg|conf|log|html?|css|scss|less|js|mjs|cjs|jsx|ts|tsx|py|rb|php|java|kt|swift|go|rs|c|h|cpp|hpp|cs|sql|sh|bash|zsh|ps1|bat|r|m|lua|dart|scala|vue|svelte|tex|srt|vtt|ics|vcf|env|gitignore|dockerfile|makefile)$/i;

export function attachmentKind(file) {
  const t = file.type || '';
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  return 'file';
}

let pdfjsPromise = null;
async function pdfText(buf) {
  if (!pdfjsPromise) {
    pdfjsPromise = import('https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.min.mjs').then((m) => {
      m.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.worker.min.mjs';
      return m;
    }).catch((e) => { pdfjsPromise = null; throw e; });
  }
  const pdfjs = await pdfjsPromise;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages = [];
  const n = Math.min(doc.numPages, 80);
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pages.push(tc.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+\n/g, '\n'));
  }
  return { text: pages.join('\n\n'), pages: doc.numPages };
}

async function docxText(buf) {
  const z = await unzip(buf);
  const xml = await z.text('word/document.xml');
  if (!xml) return '';
  return xml.replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<w:br\/>/g, '\n').replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
}

async function xlsxText(buf) {
  const z = await unzip(buf);
  const ss = (await z.text('xl/sharedStrings.xml')) || '';
  const strings = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));
  const sheet = (await z.text('xl/worksheets/sheet1.xml')) || '';
  const rows = [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((r) => [...r[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)].map((c) => {
    const isS = /t="s"/.test(c[1]);
    const v = /<v>([\s\S]*?)<\/v>/.exec(c[2])?.[1] ?? /<t[^>]*>([\s\S]*?)<\/t>/.exec(c[2])?.[1] ?? '';
    return isS ? strings[+v] ?? '' : v;
  }).join(','));
  return rows.join('\n');
}

function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

export async function downscale(dataUrl, max = 1568, quality = 0.88) {
  const img = await loadImg(dataUrl);
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { dataUrl: c.toDataURL('image/jpeg', quality), width: img.naturalWidth, height: img.naturalHeight };
}

export async function imageStats(dataUrl) {
  const img = await loadImg(dataUrl);
  const c = document.createElement('canvas');
  const s = 64 / Math.max(img.naturalWidth, img.naturalHeight);
  c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const buckets = new Map();
  let lum = 0, sat = 0, n = 0, warm = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const key = `${r >> 5},${g >> 5},${b >> 5}`;
    const e = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0 };
    e.r += r; e.g += g; e.b += b; e.n++;
    buckets.set(key, e);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    lum += 0.2126 * r + 0.7152 * g + 0.0722 * b; sat += mx ? (mx - mn) / mx : 0; warm += r - b; n++;
  }
  const colors = [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, 5).map((e) => '#' + [e.r / e.n, e.g / e.n, e.b / e.n].map((x) => Math.round(x).toString(16).padStart(2, '0')).join(''));
  return { colors, brightness: n ? lum / n / 255 : 0, saturation: n ? sat / n : 0, warmth: n ? warm / n : 0, width: img.naturalWidth, height: img.naturalHeight };
}

async function videoInfo(file) {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.src = url; v.playsInline = true;
  await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; setTimeout(res, 8000); });
  const frames = [];
  const dur = isFinite(v.duration) ? v.duration : 0;
  const c = document.createElement('canvas');
  const s = Math.min(1, 768 / Math.max(v.videoWidth || 1, v.videoHeight || 1));
  c.width = Math.max(1, Math.round((v.videoWidth || 320) * s)); c.height = Math.max(1, Math.round((v.videoHeight || 180) * s));
  const ctx = c.getContext('2d');
  for (const f of [0.08, 0.35, 0.62, 0.9]) {
    try {
      await new Promise((res) => { v.onseeked = res; v.currentTime = dur * f; setTimeout(res, 2500); });
      ctx.drawImage(v, 0, 0, c.width, c.height);
      frames.push(c.toDataURL('image/jpeg', 0.8));
    } catch { /* ignore */ }
  }
  return { url, duration: dur, width: v.videoWidth, height: v.videoHeight, frames };
}

/** Read a File into a Nova attachment object. */
export async function readAttachment(file) {
  const kind = attachmentKind(file);
  const base = { id: uid('a'), kind, name: file.name || `${kind}-${Date.now()}`, mime: file.type || mimeFor(file.name || ''), size: file.size };
  if (kind === 'image') {
    const raw = await readAsDataURL(file);
    let dataUrl = raw, width, height;
    try {
      const d = await downscale(raw, file.type === 'image/gif' ? 4096 : 2048, 0.9);
      width = d.width; height = d.height;
      if (file.size > 1.5e6 || /heic|heif|bmp|tiff/.test(file.type)) dataUrl = d.dataUrl;
    } catch { /* keep raw */ }
    let stats = null;
    try { stats = await imageStats(dataUrl); } catch {}
    return { ...base, dataUrl, width, height, stats };
  }
  if (kind === 'video') {
    const info = await videoInfo(file);
    const keep = file.size <= 15e6 ? await readAsDataURL(file) : null;
    return { ...base, dataUrl: keep, objectUrl: info.url, duration: info.duration, width: info.width, height: info.height, frames: info.frames };
  }
  if (kind === 'audio') {
    return { ...base, dataUrl: file.size <= 15e6 ? await readAsDataURL(file) : null, objectUrl: URL.createObjectURL(file) };
  }
  const ext = fileExt(file.name);
  try {
    if (ext === 'pdf' || file.type === 'application/pdf') {
      const buf = await readAsArrayBuffer(file);
      const dataUrl = file.size <= 20e6 ? await readAsDataURL(file) : null;
      try {
        const { text, pages } = await pdfText(buf.slice(0));
        return { ...base, text: text.slice(0, 400000), pages, dataUrl };
      } catch { return { ...base, dataUrl, text: '', note: 'Could not extract text from this PDF on-device.' }; }
    }
    if (ext === 'docx') return { ...base, text: (await docxText(await readAsArrayBuffer(file))).slice(0, 400000) };
    if (ext === 'xlsx') return { ...base, text: (await xlsxText(await readAsArrayBuffer(file))).slice(0, 400000) };
    if (TEXT_EXT.test(ext) || (file.type || '').startsWith('text/') || /json|xml|javascript/.test(file.type || '')) {
      return { ...base, text: (await readAsText(file)).slice(0, 400000) };
    }
  } catch (e) {
    return { ...base, text: '', note: 'Could not read this file: ' + e.message };
  }
  return { ...base, text: '', note: `Nova can't read ${ext ? '.' + ext : 'this type of'} files yet.` };
}

export function describeAttachment(a) {
  if (a.kind === 'image') return `${a.width || '?'}×${a.height || '?'} image`;
  if (a.kind === 'video') return `${Math.round(a.duration || 0)}s video`;
  if (a.kind === 'audio') return a.transcript ? 'Voice message' : 'Audio';
  return `${fileKindLabel(a.name)}${a.size ? ' · ' + formatBytes(a.size) : ''}`;
}
