// Parser for Source Engine .smd model files.
//
// Format (per Valve's SMD spec):
//   version <n>
//   nodes
//     <id> "<name>" <parentId>        ... until 'end'
//   skeleton
//     time <n>
//       <boneId> px py pz rx ry rz    ... until next 'time' or 'end'
//     end
//   triangles
//     <materialName>
//       <parentBone> px py pz nx ny nz u v [links]   x3
//       ... until 'end'
//
// Tolerant-parser choices (documented, reasonable when the spec is ambiguous):
//   - CRLF and extra/mixed whitespace are normalized.
//   - Comments (// ...) and blank lines are stripped anywhere.
//   - Unknown top-level blocks are skipped through their 'end' line.
//   - Vertex links: the standard SMD line puts a link-count right after the UVs,
//     then that many (boneId weight) pairs. We follow that; a count of 0 or an
//     absent count yields no links. Tolerant fallback: if a count is present but
//     the remaining tokens don't fill it, we read as many complete pairs as exist.
//
// NOTE: this file is intentionally dependency-free (no vscode/node imports) so
// it can be bundled into both the extension (node) and the webview viewer
// (browser) with esbuild.
export interface SmdNode {
  id: number;
  name: string;
  parent: number;
}

export interface SmdBone {
  id: number;
  pos: [number, number, number];
  rot: [number, number, number];
}

export interface SmdSkeleton {
  time: number;
  bones: SmdBone[];
}

export interface SmdVertex {
  parentBone: number;
  pos: [number, number, number];
  norm: [number, number, number];
  uv: [number, number];
  /** Pairs of [boneId, weight]. */
  links: [number, number][];
}

export interface SmdTriangle {
  material: string;
  verts: SmdVertex[];
}

export interface SmdModel {
  nodes: SmdNode[];
  skeleton: SmdSkeleton[];
  triangles: SmdTriangle[];
}

/** Strip comments and surrounding whitespace from a raw source line. */
function clean(line: string): string {
  const noComment = line.indexOf('//') >= 0 ? line.slice(0, line.indexOf('//')) : line;
  return noComment.trim();
}

const NUM = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?';

function parseVertex(line: string): SmdVertex {
  const parts = line.split(/\s+/);
  const v: SmdVertex = {
    parentBone: +parts[0],
    pos: [+parts[1], +parts[2], +parts[3]],
    norm: [+parts[4], +parts[5], +parts[6]],
    uv: [+parts[7], +parts[8]],
    links: [],
  };
  // parts[9] is the link count; read that many (boneId weight) pairs if present.
  if (parts.length > 9) {
    const count = +parts[9];
    if (count > 0 && Number.isFinite(count)) {
      let k = 10;
      for (let n = 0; n < count && k + 1 < parts.length; n++) {
        v.links.push([+parts[k], +parts[k + 1]]);
        k += 2;
      }
    }
  }
  return v;
}

export function parseSmd(text: string): SmdModel {
  // Normalize CRLF and lone CR to LF.
  const raw = text.replace(/\r\n?/g, '\n').split('\n');
  const model: SmdModel = { nodes: [], skeleton: [], triangles: [] };
  let i = 0;

  while (i < raw.length) {
    const line = clean(raw[i]);
    if (line === '') {
      i++;
      continue;
    }

    if (line === 'nodes') {
      i++;
      while (i < raw.length) {
        const l = clean(raw[i]);
        if (l === '') { i++; continue; }
        if (l === 'end') { i++; break; }
        const m = l.match(new RegExp(`^(\\d+)\\s+"([^"]*)"\\s+(-?\\d+)\\s*$`));
        if (m) model.nodes.push({ id: +m[1], name: m[2], parent: +m[3] });
        i++;
      }
    } else if (line === 'skeleton') {
      i++;
      while (i < raw.length) {
        const l = clean(raw[i]);
        if (l === '') { i++; continue; }
        if (l === 'end') { i++; break; }
        if (/^time\b/i.test(l)) {
          const t = l.match(/^time\s+(-?\d+)\s*$/i);
          const sk: SmdSkeleton = { time: t ? +t[1] : 0, bones: [] };
          model.skeleton.push(sk);
          i++;
          while (i < raw.length) {
            const bl = clean(raw[i]);
            if (bl === '' ) { i++; continue; }
            if (bl === 'end' || /^time\b/i.test(bl)) break;
            const bm = bl.match(
              new RegExp(`^(-?\\d+)\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s*$`)
            );
            if (bm) {
              sk.bones.push({
                id: +bm[1],
                pos: [+bm[2], +bm[3], +bm[4]],
                rot: [+bm[5], +bm[6], +bm[7]],
              });
            }
            i++;
          }
          continue; // do not re-consume the current line; inner loop advanced i
        }
        i++;
      }
    } else if (/^version\b/i.test(line)) {
      // Scalar header (e.g. "version 1"): just a single line, not a block.
      i++;
    } else if (line === 'triangles') {
      i++;
      while (i < raw.length) {
        const l = clean(raw[i]);
        if (l === '') { i++; continue; }
        if (l === 'end') { i++; break; }
        const tri: SmdTriangle = { material: l, verts: [] };
        model.triangles.push(tri);
        i++;
        for (let v = 0; v < 3; v++) {
          if (i >= raw.length) break;
          const vl = clean(raw[i]);
          if (vl === '' ) { i++; continue; } // tolerate blank between vertices
          if (vl === 'end') break;
          tri.verts.push(parseVertex(vl));
          i++;
        }
      }
    } else {
      // Unknown top-level block: skip until its 'end'.
      i++;
      while (i < raw.length && clean(raw[i]) !== 'end') i++;
      if (i < raw.length) i++; // consume 'end'
    }
  }

  return model;
}
