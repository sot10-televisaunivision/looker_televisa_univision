/*
 * Collapsible Report Table — production Looker custom visualization
 * -----------------------------------------------------------------
 * Combines, in one table:
 *   - Merged repeated dimension values (spanning cells), the "Report Table" look
 *   - Per-dimension click-to-collapse at EVERY level (built-in Table behavior)
 *   - Per-column header controls: image-by-URL, position, size, hide-text, align, color
 *   - In-cell bars (per measure, toggle on)
 *   - Conditional formatting (per measure): color scale OR up to 3 threshold rules
 *   - Subtotals per group with per-measure aggregation (sum / average / min / max / ratio)
 *   - Subtotal depth control (limit subtotals to the outermost N dimension levels)
 *   - Calculate Others (keep Top-N groups, roll the rest into an "Others" row)
 *   - Transpose (measures become rows, dimension combos become columns)
 *   - Pivot-driven spanning column headers (group measure columns under each pivot value)
 *   - Drill-to-Explore on measure cells (via Looker's cell markup)
 *
 * The edit/options panel is organized into three tabs — Table, Dimensions,
 * Measures — and each field gets a bold heading + separator line before its
 * controls so the settings list is easy to scroll.
 *
 * Works two ways:
 *   1) Inside Looker (registers itself as "collapsible_report_table")
 *   2) Standalone (call window.renderCollapsibleTable(container, data, queryResponse, config))
 */
(function () {
  "use strict";

  var COLSEP = "\u0002"; // internal separator for measure+pivot column ids
  var PATHSEP = "\u0001"; // internal separator for tree node paths

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function keyify(name) { return String(name).replace(/[^a-zA-Z0-9]/g, "_"); }

  // ---- ratio detection: parse a measure's SQL into {num, den} short refs ----
  // Collect the LAST path segment of every ${...} reference in an expression.
  function refShorts(expr) {
    var out = [], re = /\$\{([^}]+)\}/g, m;
    while ((m = re.exec(expr)) !== null) { var p = m[1].split("."); out.push(p[p.length - 1]); }
    return out;
  }
  // Split a string on its FIRST top-level (paren-depth 0) occurrence of ch.
  function splitTop(s, ch) {
    var depth = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === ch && depth === 0) return [s.slice(0, i), s.slice(i + 1)];
    }
    return null;
  }
  // Recognize SAFE_DIVIDE(a,b) / DIVIDE(a,b) / a/b where a and b each reference
  // exactly one field. Returns {num:<shortRef>, den:<shortRef>} or null.
  function parseRatio(sql) {
    if (!sql || typeof sql !== "string") return null;
    var s = sql.trim(), numExpr = null, denExpr = null;
    var sd = s.match(/^[a-zA-Z_]*DIVIDE\s*\(([\s\S]*)\)$/i);
    if (sd) { var pair = splitTop(sd[1], ","); if (pair) { numExpr = pair[0]; denExpr = pair[1]; } }
    if (numExpr === null) { var pr = splitTop(s, "/"); if (pr) { numExpr = pr[0]; denExpr = pr[1]; } }
    if (numExpr === null || denExpr === null) return null;
    var nrefs = refShorts(numExpr), drefs = refShorts(denExpr);
    if (nrefs.length !== 1 || drefs.length !== 1) return null;
    return { num: nrefs[0], den: drefs[0] };
  }
  function cssLen(v) { v = String(v == null ? "" : v).trim(); if (v === "") return ""; return /^\d+(\.\d+)?$/.test(v) ? v + "px" : v; }
  function fontStyleCss(hc) {
    var s = "";
    if (hc.bold) s += "font-weight:700;";
    if (hc.italic) s += "font-style:italic;";
    if (hc.underline) s += "text-decoration:underline;";
    if (hc.color) s += "color:" + hc.color + ";";
    return s;
  }

  // tiny value formatter for common Looker value_format strings
  function makeFormatter(vf) {
    return function (v) {
      if (v == null || isNaN(v)) return "";
      if (!vf) return Number(v).toLocaleString();
      var isPct = vf.indexOf("%") !== -1, isCur = vf.indexOf("$") !== -1, dec = 0;
      var m = vf.match(/\.(0+)/); if (m) dec = m[1].length;
      var n = isPct ? v * 100 : v;
      var s = n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
      if (isCur) s = "$" + s; if (isPct) s = s + "%";
      return s;
    };
  }

  // color helpers for conditional-format color scales
  function hexLerp(a, b, t) {
    function p(h) { h = h.replace("#", ""); return [parseInt(h.substr(0,2),16), parseInt(h.substr(2,2),16), parseInt(h.substr(4,2),16)]; }
    var A = p(a), B = p(b);
    return "rgb(" + Math.round(A[0]+(B[0]-A[0])*t) + "," + Math.round(A[1]+(B[1]-A[1])*t) + "," + Math.round(A[2]+(B[2]-A[2])*t) + ")";
  }
  function scaleColor(colors, t) {
    if (t <= 0) return colors[0];
    if (t >= 1) return colors[colors.length - 1];
    var seg = 1 / (colors.length - 1), i = Math.floor(t / seg), lt = (t - i * seg) / seg;
    return hexLerp(colors[i], colors[i + 1], lt);
  }

  // read a measure value from a row, honoring an optional pivot key
  function mval(row, mname, pkey) {
    var cell = row[mname];
    if (cell == null) return null;
    if (pkey != null) { var pc = cell[pkey]; return pc ? pc.value : null; }
    return cell.value;
  }
  // the Looker cell object for a measure, honoring an optional pivot key
  function mcell(row, mname, pkey) {
    var cell = row[mname];
    if (cell == null) return {};
    if (pkey != null) return cell[pkey] || {};
    return cell;
  }

  // aggregate a set of rows over a list of measure-columns (mcols)
  function aggregate(rows, mcols, measureAgg) {
    var out = {};
    mcols.forEach(function (mc) {
      var mf = mc.mf, spec = (measureAgg && measureAgg[mf.name]) || "sum";
      // Exact ratio subtotal: reconstruct numerator & denominator per leaf row
      // from the leaf rate plus whichever component is on the tile, then take
      // Sum(numerator) / Sum(denominator) so the subtotal is a true weighted ratio.
      if (spec && spec.ratioSolve) {
        var rs = spec.ratioSolve, sumN = 0, sumD = 0, any = false;
        rows.forEach(function (r) {
          var rate = mval(r, rs.rate, mc.pkey);
          if (rate == null || isNaN(rate)) return;      // skip rows with no rate
          rate = Number(rate);
          var nv = rs.num ? mval(r, rs.num, mc.pkey) : null;
          var dv = rs.den ? mval(r, rs.den, mc.pkey) : null;
          var ni, di;
          if (rs.num && rs.den) {                        // both components present
            if (nv == null || isNaN(nv) || dv == null || isNaN(dv)) return;
            ni = Number(nv); di = Number(dv);
          } else if (rs.den) {                           // denominator present -> num = rate*den
            if (dv == null || isNaN(dv)) return;
            di = Number(dv); ni = rate * di;
          } else if (rs.num) {                           // numerator present -> den = num/rate
            if (nv == null || isNaN(nv)) return;
            ni = Number(nv);
            if (rate === 0) return;                       // 0/0 indeterminate denominator -> skip row
            di = ni / rate;
          } else { return; }                             // neither component -> can't reconstruct
          sumN += ni; sumD += di; any = true;
        });
        out[mc.colId] = (any && sumD) ? sumN / sumD : null;  // null -> blank subtotal
        return;
      }
      var mode = (typeof spec === "string") ? spec : "sum";
      var vals = [];
      rows.forEach(function (r) { var x = mval(r, mf.name, mc.pkey); if (x != null && !isNaN(x)) vals.push(Number(x)); });
      if (!vals.length) { out[mc.colId] = null; return; }
      if (mode === "average" || mode === "avg") out[mc.colId] = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
      else if (mode === "min") out[mc.colId] = Math.min.apply(null, vals);
      else if (mode === "max") out[mc.colId] = Math.max.apply(null, vals);
      else out[mc.colId] = vals.reduce(function (a, b) { return a + b; }, 0);
    });
    return out;
  }

  function buildTree(data, dims) {
    var root = { key: "__root__", level: -1, children: new Map(), childOrder: [], rows: [] };
    data.forEach(function (row) {
      var node = root;
      for (var L = 0; L < dims.length; L++) {
        var key = String((row[dims[L].name] || {}).value);
        if (!node.children.has(key)) {
          node.children.set(key, {
            key: key, level: L, dimName: dims[L].name, value: (row[dims[L].name] || {}),
            children: new Map(), childOrder: [], rows: []
          });
          node.childOrder.push(key);
        }
        node = node.children.get(key);
        node.rows.push(row);
      }
    });
    return root;
  }

  // Render a Looker cell to safe HTML (uses Looker's drillable markup when available)
  function cellDisplay(cell, formatter, utils) {
    if (utils && utils.htmlForCell && cell) { try { return utils.htmlForCell(cell); } catch (e) {} }
    if (cell && cell.rendered != null) return esc(cell.rendered);
    var v = cell ? cell.value : null;
    return esc(formatter ? formatter(v) : (v == null ? "" : String(v)));
  }

  // build the list of measure-columns (measure x pivot) used for rendering
  function buildMeasureCols(measures, pivots) {
    var mcols = [];
    if (pivots && pivots.length) {
      pivots.forEach(function (p) {
        measures.forEach(function (mf) { mcols.push({ mf: mf, pkey: p.key, pivot: p, colId: mf.name + COLSEP + p.key }); });
      });
    } else {
      measures.forEach(function (mf) { mcols.push({ mf: mf, pkey: null, pivot: null, colId: mf.name }); });
    }
    return mcols;
  }

  window.renderCollapsibleTable = function (container, data, queryResponse, config, utils) {
    config = config || {};
    var fields = queryResponse.fields || {};
    var dims = fields.dimensions || [];
    var measures = (fields.measures || []).concat(fields.table_calculations || []);
    var pivots = queryResponse.pivots || [];

    if (!data || !data.length) { container.innerHTML = '<div style="padding:16px;font-family:Arial;color:#64748b;">No results</div>'; return; }

    if (config.transpose) { renderTransposed(container, data, queryResponse, config, utils, dims, measures); return; }

    var mcols = buildMeasureCols(measures, pivots);
    var lastDim = dims.length - 1;
    var showSub = config.showSubtotals !== false;
    var subDepth = config.subtotalDepth || 0; // 0 = all levels
    var headers = config.headers || {};
    var measureAgg = config.measureAgg || {};
    var cellViz = config.cellViz || {};
    var condFmt = config.conditionalFormat || {};
    var collapsed = container.__collapsedState || (container.__collapsedState = new Set());

    var fmt = {};
    measures.forEach(function (mf) { var nf = (headers[mf.name] || {}).numberFormat; fmt[mf.name] = makeFormatter(nf || mf.value_format); });

    // per-column min/max across leaf data (for bars + color scales)
    var stats = {};
    mcols.forEach(function (mc) {
      var mn = Infinity, mx = -Infinity;
      data.forEach(function (r) { var x = Number(mval(r, mc.mf.name, mc.pkey)); if (!isNaN(x)) { if (x < mn) mn = x; if (x > mx) mx = x; } });
      stats[mc.colId] = { min: mn, max: mx };
    });

    // ---- no-dimension fallback: flat table ----
    if (!dims.length) {
      renderFlat(container, data, mcols, fmt, headers, cellViz, condFmt, stats, config, utils, pivots, measures);
      return;
    }

    var tree = buildTree(data, dims);

    function pk(parentNode, key) { return (parentNode.__path || "") + PATHSEP + key; }
    (function assign(node) { node.childOrder.forEach(function (k) { var c = node.children.get(k); c.__path = pk(node, k); assign(c); }); })(tree);

    // ---- Calculate Others: keep Top-N root groups, roll the rest into "Others" ----
    if (config.calcOthers && tree.childOrder.length > (config.calcOthersLimit || 10)) {
      var limit = config.calcOthersLimit || 10;
      var keep = tree.childOrder.slice(0, limit);
      var drop = tree.childOrder.slice(limit);
      var otherRows = [];
      drop.forEach(function (k) { otherRows = otherRows.concat(tree.children.get(k).rows); tree.children.delete(k); });
      var otherNode = {
        key: "Others", level: 0, dimName: dims[0].name,
        value: { value: "Others", rendered: "Others" },
        children: new Map(), childOrder: [], rows: otherRows, __path: PATHSEP + "Others", __others: true
      };
      tree.children.set("Others", otherNode);
      tree.childOrder = keep.concat(["Others"]);
    }

    // "Start collapsed": collapse all groups when the toggle turns on (and re-expand
    // when it turns off). Tracked per container so re-renders don't fight manual toggles.
    var wantCollapse = !!config.defaultCollapsed;
    if (container.__lastDefaultCollapsed === undefined) container.__lastDefaultCollapsed = false;
    if (wantCollapse && !container.__lastDefaultCollapsed) {
      (function seed(node) {
        node.childOrder.forEach(function (k) {
          var c = node.children.get(k);
          if (c.level < lastDim && !c.__others) { collapsed.add(c.__path); seed(c); }
        });
      })(tree);
    } else if (!wantCollapse && container.__lastDefaultCollapsed) {
      collapsed.clear();
    }
    container.__lastDefaultCollapsed = wantCollapse;

    function subAllowed(level) { return showSub && (subDepth === 0 || level < subDepth); }

    // ---- produce ordered list of visible rows ----
    var vis = [];
    (function walk(node) {
      node.childOrder.forEach(function (k) {
        var c = node.children.get(k);
        var canCollapse = c.level < lastDim && !c.__others;
        var isCollapsed = collapsed.has(c.__path) && canCollapse;
        var keys = keysFor(c);
        if (c.__others || c.level === lastDim || isCollapsed) {
          if (isCollapsed) {
            vis.push({ kind: "collapsed", node: c, atLevel: c.level, keys: keys, measures: aggregate(c.rows, mcols, measureAgg) });
          } else if (c.__others) {
            vis.push({ kind: "sub", node: c, atLevel: c.level, keys: keys, measures: aggregate(c.rows, mcols, measureAgg), othersLabel: true });
          } else { // leaf level
            c.rows.forEach(function (r) {
              var mv = {}; mcols.forEach(function (mc) { mv[mc.colId] = mval(r, mc.mf.name, mc.pkey); });
              vis.push({ kind: "data", node: c, atLevel: c.level, keys: keys, row: r, measures: mv });
            });
            if (subAllowed(c.level) && c.rows.length > 1) vis.push({ kind: "sub", node: c, atLevel: c.level, keys: keys, measures: aggregate(c.rows, mcols, measureAgg), __label: true });
          }
        } else {
          walk(c);
          if (subAllowed(c.level)) vis.push({ kind: "sub", node: c, atLevel: c.level, keys: keys, measures: aggregate(c.rows, mcols, measureAgg), __label: true });
        }
      });
    })(tree);

    // Grand total row (labelled "Total"), shown whenever subtotals are enabled.
    if (showSub && vis.length) {
      vis.push({ kind: "total", atLevel: -1, keys: new Array(dims.length).fill(undefined), measures: aggregate(data, mcols, measureAgg), __label: true });
    }

    function keysFor(node) {
      var arr = new Array(dims.length).fill(undefined);
      var parts = node.__path.split(PATHSEP).slice(1);
      for (var i = 0; i < parts.length; i++) arr[i] = parts[i];
      return arr;
    }
    function samePrefix(a, b, c) { for (var x = 0; x <= c; x++) { if (a[x] === undefined || b[x] === undefined || a[x] !== b[x]) return false; } return true; }
    function nodeByKeys(root, keys, upto) { var node = root; for (var L = 0; L <= upto; L++) { if (keys[L] === undefined) return null; node = node.children.get(keys[L]); if (!node) return null; } return node; }

    // ---- compute rowspans per dimension column ----
    var grid = vis.map(function () { return new Array(dims.length); });
    for (var c = 0; c < dims.length; c++) {
      var i = 0;
      while (i < vis.length) {
        var row = vis[i];
        if (row.keys[c] === undefined) { grid[i][c] = { empty: true }; i++; continue; }
        var j = i + 1;
        while (j < vis.length && samePrefix(vis[i].keys, vis[j].keys, c)) {
          if (c === lastDim && vis[j].__label && vis[j].atLevel === lastDim) break; // let a last-level subtotal own its cell for the label
          j++;
        }
        var nodeAtC = nodeByKeys(tree, vis[i].keys, c);
        var collapsible = nodeAtC && nodeAtC.level < lastDim && !nodeAtC.__others;
        grid[i][c] = {
          render: true, span: j - i,
          cell: nodeAtC ? nodeAtC.value : null,
          value: nodeAtC ? (nodeAtC.value.rendered != null ? nodeAtC.value.rendered : nodeAtC.value.value) : vis[i].keys[c],
          caret: collapsible, path: nodeAtC ? nodeAtC.__path : null,
          isCollapsed: nodeAtC ? collapsed.has(nodeAtC.__path) : false
        };
        for (var k = i + 1; k < j; k++) grid[k][c] = { render: false };
        i = j;
      }
    }

    var thead = buildThead(dims, measures, mcols, pivots, headers, config.truncateHeaders);

    var caretOpen = "\u25be", caretClosed = "\u25b8";
    function subtotalLabelText(row) {
      if (row.kind === "total") return "Total";
      var parts = [];
      for (var L = 0; L <= row.atLevel; L++) {
        var n = nodeByKeys(tree, row.keys, L);
        var v = n ? (n.value.rendered != null ? n.value.rendered : n.value.value) : row.keys[L];
        if (v == null || String(v).trim() === "") v = "Null"; // empty dimension value
        parts.push(v);
      }
      return parts.join(" / ") + " Subtotal";
    }
    function rowClsFor(row) {
      if (row.kind === "total") return "totalrow";
      if (row.kind === "data") return "datarow";
      if (row.kind === "collapsed") return "collapsedrow";
      return "subrow";
    }
    function measureCellsHtml(row) {
      var mcls = row.kind === "data" ? "mnum" : "mnum agg";
      var s = "";
      mcols.forEach(function (mc) { s += measureCell(mc, row, fmt, stats, cellViz, condFmt, mcls, utils, headers); });
      return s;
    }
    var body = vis.map(function (row, ri) {
      // Subtotal / grand-total rows: a single left-aligned label cell spanning the
      // free (right-hand) dimension columns, then the aggregated measure cells.
      if (row.__label) {
        var labelText = subtotalLabelText(row);
        var freeStart = row.atLevel + 1;
        var labelTd;
        if (freeStart <= lastDim) {
          labelTd = '<td class="dimc sublabel" colspan="' + (lastDim - freeStart + 1) + '">' + esc(labelText) + "</td>";
        } else {
          labelTd = '<td class="dimc sublabel">' + esc(labelText) + "</td>"; // last-level edge: grid freed this cell
        }
        return '<tr class="' + rowClsFor(row) + '">' + labelTd + measureCellsHtml(row) + "</tr>";
      }
      var tds = "";
      for (var cc = 0; cc < dims.length; cc++) {
        var g = grid[ri][cc];
        if (!g || g.render === false) continue;
        if (g.empty) { tds += '<td class="dimc empty"></td>'; continue; }
        var caret = g.caret ? '<span class="caret" data-path="' + esc(g.path) + '">' + (g.isCollapsed ? caretClosed : caretOpen) + "</span> " : "";
        var dval = g.cell ? cellDisplay(g.cell, null, utils) : esc(g.value);
        var dhc = headers[dims[cc].name] || {};
        var dstyle = fontStyleCss(dhc);
        if (dhc.background) dstyle += "background:" + dhc.background + ";";
        if (dhc.width) dstyle += "width:" + cssLen(dhc.width) + ";";
        if (dhc.textAlign) dstyle += "text-align:" + dhc.textAlign + ";";
        var dtitle = dhc.tooltip ? ' title="' + esc((dhc.label || dims[cc].label_short || dims[cc].label || dims[cc].name) + ": " + g.value) + '"' : "";
        tds += '<td class="dimc" rowspan="' + g.span + '" style="' + dstyle + '"' + dtitle + '>' + caret + dval + "</td>";
      }
      return '<tr class="' + rowClsFor(row) + '">' + tds + measureCellsHtml(row) + "</tr>";
    }).join("");

    container.innerHTML = styleBlock(config) + '<table class="crt">' + thead + "<tbody>" + body + "</tbody></table>";
    wireCarets(container, data, queryResponse, config, utils);
  };

  // ---- header (supports pivot-driven spanning header row) ----
  function buildThead(dims, measures, mcols, pivots, headers, tHead) {
    var opts = { truncateHeaders: !!tHead };
    var hHeight = 0;
    dims.concat(measures).forEach(function (f) { var h = (headers[f.name] || {}).headerHeight; if (h) hHeight = Math.max(hHeight, h); });

    if (pivots && pivots.length) {
      // top row: dim columns rowspan 2, then a spanning cell per pivot value
      var top = "<tr>";
      dims.forEach(function (f, idx) { top += headerCell(f, true, headers, hHeight, 2, 1, opts); });
      pivots.forEach(function (p) {
        var lbl = esc((p.metadata && p.metadata[Object.keys(p.metadata)[0]] && p.metadata[Object.keys(p.metadata)[0]].value) || p.label || p.key);
        top += '<th class="pivgrp" colspan="' + measures.length + '">' + lbl + "</th>";
      });
      top += "</tr>";
      // second row: one measure header per pivot value
      var bottom = "<tr>";
      mcols.forEach(function (mc) { bottom += headerCell(mc.mf, false, headers, hHeight, 1, 1, opts); });
      bottom += "</tr>";
      return "<thead>" + top + bottom + "</thead>";
    }
    var cells = dims.map(function (f) { return headerCell(f, true, headers, hHeight, 1, 1, opts); })
      .concat(measures.map(function (f) { return headerCell(f, false, headers, hHeight, 1, 1, opts); }));
    return "<thead><tr>" + cells.join("") + "</tr></thead>";
  }

  // ---- shared cell/header renderers ----
  function measureCell(mc, row, fmt, stats, cellViz, condFmt, mcls, utils, headers) {
    var mf = mc.mf;
    var v = row.measures[mc.colId];
    var st = stats[mc.colId] || { min: 0, max: 0 };
    var hc = (headers && headers[mf.name]) || {};
    var tdStyle = fontStyleCss(hc);
    if (hc.background) tdStyle += "background:" + hc.background + ";";
    if (hc.textAlign) tdStyle += "text-align:" + hc.textAlign + ";";
    if (hc.width) tdStyle += "width:" + cssLen(hc.width) + ";";
    var content;
    if (row.kind === "data") content = cellDisplay(mcell(row.row, mf.name, mc.pkey), fmt[mf.name], utils);
    else content = esc(fmt[mf.name](v));
    var inner = '<span class="cellval">' + content + "</span>";

    var cf = condFmt[mf.name];
    if (cf && cf.type === "scale" && v != null && !isNaN(v) && st.max > st.min) {
      var t = Math.max(0, Math.min(1, (Number(v) - st.min) / (st.max - st.min)));
      tdStyle += "background:" + scaleColor(cf.colors, t) + ";";
    } else if (cf && cf.type === "threshold" && v != null && !isNaN(v)) {
      for (var ti = 0; ti < cf.rules.length; ti++) {
        var ru = cf.rules[ti], nv = Number(v), ok = false;
        if (ru.op === ">=") ok = nv >= ru.value; else if (ru.op === "<") ok = nv < ru.value;
        else if (ru.op === ">") ok = nv > ru.value; else if (ru.op === "<=") ok = nv <= ru.value; else if (ru.op === "=") ok = nv === ru.value;
        if (ok) { if (ru.bg) tdStyle += "background:" + ru.bg + ";"; if (ru.color) tdStyle += "color:" + ru.color + ";"; break; }
      }
    }
    var cv = cellViz[mf.name];
    if (cv && cv.bar && row.kind === "data" && v != null && !isNaN(v) && st.max > 0) {
      var pct = Math.max(0, Math.min(100, (Number(v) / st.max) * 100));
      inner = '<div class="cellbar" style="width:' + pct + "%;background:" + (cv.barColor || "#bfdbfe") + ';"></div>' + inner;
    }
    var mtitle = hc.tooltip ? ' title="' + esc((hc.label || mf.label_short || mf.label || mf.name) + ": " + fmt[mf.name](v)) + '"' : "";
    return '<td class="' + mcls + '" style="' + tdStyle + '"' + mtitle + '>' + inner + "</td>";
  }

  function headerCell(f, isDim, headers, hHeight, rowspan, colspan, opts) {
    opts = opts || {};
    var hc = headers[f.name] || {};
    var pos = hc.imagePos || "above", size = hc.imageSize || 20, pad = hc.imagePad != null ? hc.imagePad : 4;
    var align = hc.textAlign || (isDim ? "left" : "right");
    var base = hc.label || f.label_short || f.label || f.name;
    var text = hc.suppressText ? "" : esc(base);
    var img = hc.image ? '<img src="' + esc(hc.image) + '" alt="' + esc(base) + '"' +
      ' style="width:' + size + "px;height:" + size + 'px;object-fit:contain;" onerror="this.style.display=\'none\'"/>' : "";
    var flexDir = { above: "column", below: "column-reverse", left: "row", right: "row-reverse" }[pos] || "column";
    var justify = align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start";
    var style = "display:flex;flex-direction:" + flexDir + ";align-items:center;justify-content:" + justify + ";gap:" + pad + "px;";
    var textSpan = text ? '<span' + (opts.truncateHeaders ? ' class="trunc"' : "") + '>' + text + "</span>" : "";
    var thStyle = "text-align:" + align + ";" + (hHeight ? "height:" + hHeight + "px;" : "") + (hc.width ? "width:" + cssLen(hc.width) + ";" : "");
    var attrs = (rowspan && rowspan > 1 ? ' rowspan="' + rowspan + '"' : "") + (colspan && colspan > 1 ? ' colspan="' + colspan + '"' : "");
    return '<th' + attrs + ' style="' + thStyle + '"><div style="' + style + '">' + img + textSpan + "</div></th>";
  }

  // ---- transpose: measures as rows, dimension combos as columns ----
  function renderTransposed(container, data, queryResponse, config, utils, dims, measures) {
    var fmt = {};
    measures.forEach(function (mf) { fmt[mf.name] = makeFormatter(mf.value_format); });
    var headers = config.headers || {};
    var cellViz = config.cellViz || {};
    var condFmt = config.conditionalFormat || {};

    // each data row becomes a column, labeled by its dimension values
    function colLabel(r) {
      if (!dims.length) return "Value";
      return dims.map(function (d) { var c = r[d.name] || {}; return c.rendered != null ? c.rendered : c.value; }).join(" \u203a ");
    }

    // per-measure stats across the row (for bars + scales)
    var stats = {};
    measures.forEach(function (mf) {
      var mn = Infinity, mx = -Infinity;
      data.forEach(function (r) { var x = Number((r[mf.name] || {}).value); if (!isNaN(x)) { if (x < mn) mn = x; if (x > mx) mx = x; } });
      stats[mf.name] = { min: mn, max: mx };
    });

    var thead = "<thead><tr><th class=\"corner\"></th>" + data.map(function (r) {
      return '<th class="tcol">' + esc(colLabel(r)) + "</th>";
    }).join("") + "</tr></thead>";

    var body = measures.map(function (mf) {
      var hc = headers[mf.name] || {};
      var size = hc.imageSize || 18;
      var icon = hc.image ? '<img src="' + esc(hc.image) + '" style="width:' + size + "px;height:" + size + 'px;object-fit:contain;vertical-align:middle;margin-right:6px;" onerror="this.style.display=\'none\'"/>' : "";
      var base = hc.label || mf.label_short || mf.label || mf.name;
      var label = hc.suppressText ? "" : esc(base);
      var rowHtml = '<th class="trowh">' + icon + label + "</th>";
      var st = stats[mf.name] || { min: 0, max: 0 };
      data.forEach(function (r) {
        var v = (r[mf.name] || {}).value;
        var tdStyle = fontStyleCss(hc); if (hc.background) tdStyle += "background:" + hc.background + ";";
        var inner = '<span class="cellval">' + cellDisplay(r[mf.name] || {}, fmt[mf.name], utils) + "</span>";
        var cf = condFmt[mf.name];
        if (cf && cf.type === "scale" && v != null && !isNaN(v) && st.max > st.min) {
          var t = Math.max(0, Math.min(1, (Number(v) - st.min) / (st.max - st.min)));
          tdStyle += "background:" + scaleColor(cf.colors, t) + ";";
        } else if (cf && cf.type === "threshold" && v != null && !isNaN(v)) {
          for (var ti = 0; ti < cf.rules.length; ti++) {
            var ru = cf.rules[ti], nv = Number(v), ok = false;
            if (ru.op === ">=") ok = nv >= ru.value; else if (ru.op === "<") ok = nv < ru.value;
            else if (ru.op === ">") ok = nv > ru.value; else if (ru.op === "<=") ok = nv <= ru.value; else if (ru.op === "=") ok = nv === ru.value;
            if (ok) { if (ru.bg) tdStyle += "background:" + ru.bg + ";"; if (ru.color) tdStyle += "color:" + ru.color + ";"; break; }
          }
        }
        var cv = cellViz[mf.name];
        if (cv && cv.bar && v != null && !isNaN(v) && st.max > 0) {
          var pct = Math.max(0, Math.min(100, (Number(v) / st.max) * 100));
          inner = '<div class="cellbar" style="width:' + pct + "%;background:" + (cv.barColor || "#bfdbfe") + ';"></div>' + inner;
        }
        rowHtml += '<td class="mnum" style="' + tdStyle + '">' + inner + "</td>";
      });
      return "<tr class='datarow'>" + rowHtml + "</tr>";
    }).join("");

    container.innerHTML = styleBlock(config) +
      '<table class="crt transposed"><thead>' + thead.replace(/^<thead>|<\/thead>$/g, "") + "</thead><tbody>" + body + "</tbody></table>";
  }

  function styleBlock(config) {
    var bodyFont = config.bodyFontSize || 12;
    var minW = config.minColWidth || 0;
    var sizeToFit = config.sizeToFit !== false;
    var truncate = config.truncate !== false;
    var css = '.crt{border-collapse:collapse;width:' + (sizeToFit ? '100%' : 'auto') + ';font-family:Roboto,Arial,sans-serif;font-size:' + bodyFont + 'px;color:#1f2937;}' +
      '.crt th{border-bottom:2px solid #cbd5e1;padding:6px 10px;background:#f8fafc;position:sticky;top:0;z-index:2;}' +
      '.crt th.pivgrp{text-align:center;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;font-weight:700;}' +
      '.crt td{padding:5px 10px;border-bottom:1px solid #eef2f7;}' +
      '.crt td.mnum{text-align:right;font-variant-numeric:tabular-nums;position:relative;overflow:hidden;}' +
      '.crt .cellbar{position:absolute;left:0;top:3px;bottom:3px;border-radius:2px;z-index:0;opacity:.6;}' +
      '.crt .cellval{position:relative;z-index:1;}' +
      '.crt td.dimc{vertical-align:top;background:#fff;font-weight:600;white-space:nowrap;}' +
      '.crt tr.datarow td.mnum{font-weight:400;}' +
      '.crt tr.subrow{background:#f1f5f9;} .crt tr.subrow td{font-weight:700;border-top:1px solid #cbd5e1;}' +
      '.crt td.dimc.sublabel{text-align:left;color:#334155;font-weight:800;background:transparent;}' +
      '.crt tr.totalrow{background:#e2e8f0;} .crt tr.totalrow td{font-weight:800;border-top:2px solid #94a3b8;}' +
      '.crt tr.totalrow td.sublabel{color:#0f172a;}' +
      '.crt tr.collapsedrow{background:#eef2ff;} .crt tr.collapsedrow td{font-weight:700;}' +
      '.crt tr.datarow:hover{background:#f9fafb;}' +
      '.crt .caret{cursor:pointer;color:#2563eb;user-select:none;font-size:' + (bodyFont + 1) + 'px;}' +
      '.crt td.empty{background:#fff;}' +
      '.crt.transposed th.trowh{text-align:left;background:#fff;font-weight:600;white-space:nowrap;}' +
      '.crt.transposed th.tcol{text-align:right;} .crt.transposed th.corner{background:#f8fafc;}' +
      '.crt th .trunc{display:inline-block;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom;}';
    if (truncate) css += '.crt td.dimc{max-width:260px;overflow:hidden;text-overflow:ellipsis;}';
    if (minW > 0) css += '.crt th,.crt td{min-width:' + minW + 'px;}';
    return '<style>' + css + '</style>';
  }

  function wireCarets(container, data, queryResponse, config, utils) {
    var carets = container.querySelectorAll(".caret");
    for (var q = 0; q < carets.length; q++) {
      carets[q].addEventListener("click", function (e) {
        var p = e.target.getAttribute("data-path");
        var collapsed = container.__collapsedState;
        if (collapsed.has(p)) collapsed.delete(p); else collapsed.add(p);
        window.renderCollapsibleTable(container, data, queryResponse, config, utils);
        e.stopPropagation();
      });
    }
  }

  function renderFlat(container, data, mcols, fmt, headers, cellViz, condFmt, stats, config, utils, pivots, measures) {
    var thead = buildThead([], measures, mcols, pivots, headers, config.truncateHeaders);
    var body = data.map(function (r) {
      var mv = {}; mcols.forEach(function (mc) { mv[mc.colId] = mval(r, mc.mf.name, mc.pkey); });
      var tds = mcols.map(function (mc) {
        return measureCell(mc, { kind: "data", row: r, measures: mv }, fmt, stats, cellViz, condFmt, "mnum", utils, headers);
      }).join("");
      return "<tr class='datarow'>" + tds + "</tr>";
    }).join("");
    container.innerHTML = styleBlock(config) + '<table class="crt">' + thead + "<tbody>" + body + "</tbody></table>";
  }

  // ================= Looker registration =================
  if (typeof looker !== "undefined" && looker.plugins && looker.plugins.visualizations) {
    looker.plugins.visualizations.add({
      id: "collapsible_report_table",
      label: "Collapsible Report Table",
      options: {},
      create: function (element, config) {
        this._c = document.createElement("div");
        this._c.style.width = "100%";
        element.appendChild(this._c);
      },
      updateAsync: function (data, element, config, queryResponse, details, done) {
        try {
          var fields = queryResponse.fields || {};
          var dims = fields.dimensions || [];
          var measures = (fields.measures || []).concat(fields.table_calculations || []);

          // Detect ratio measures from their SQL, mapping short refs -> full names.
          // A ratio is "usable" only if at least one component is also in the query,
          // so we can reconstruct the missing side at subtotal time.
          var shortToFull = {};
          measures.forEach(function (f) { shortToFull[String(f.name).split(".").pop()] = f.name; });
          var ratioInfo = {};
          measures.forEach(function (f) {
            var pr = parseRatio(f.sql);
            if (!pr) return;
            var numFull = shortToFull[pr.num] || null, denFull = shortToFull[pr.den] || null;
            if (!numFull && !denFull) return;            // no component on tile -> can't reconstruct
            ratioInfo[f.name] = { num: numFull, den: denFull, rate: f.name };
          });

          var options = {};
          var TAB = { table: "Table", dims: "Dimensions", meas: "Measures" };

          // Each field's heading is folded into its FIRST control's label
          // (a separator line + the field name), because the custom-viz
          // options API has no standalone divider/heading control.
          function headingLabel(f) {
            var fn = (f.label_short || f.label || f.name);
            return "\u2500\u2500\u2500\u2500\u2500  " + fn.toUpperCase() + "  \u2500\u2500\u2500\u2500\u2500";
          }

          // ---------- TABLE tab (global) ----------
          var to = 1;
          options.transpose = { type: "boolean", label: "Transpose (measures as rows)", default: false, section: TAB.table, order: to++ };
          options.showSubtotals = { type: "boolean", label: "Show subtotals", default: true, section: TAB.table, order: to++ };
          options.defaultCollapsed = { type: "boolean", label: "Start collapsed", default: false, section: TAB.table, order: to++ };
          var depthVals = [{ "All levels": "" }];
          // Omit the most granular dimension: the leaf rows already ARE the subtotal at that level.
          dims.slice(0, -1).forEach(function (f) { var o = {}; o[(f.label_short || f.label || f.name)] = f.name; depthVals.push(o); });
          options.subtotalDepth = { type: "string", label: "Subtotal Depth", display: "select", values: depthVals, default: "", section: TAB.table, order: to++ };
          options.bodyFontSize = { type: "number", label: "Body font size (px)", default: 12, section: TAB.table, order: to++, display_size: "half" };
          options.calcOthers = { type: "boolean", label: "Calculate Others (Top-N + Others row)", default: false, section: TAB.table, order: to++ };
          options.calcOthersLimit = { type: "number", label: "Keep top N groups", default: 10, section: TAB.table, order: to++ };
          options.truncate = { type: "boolean", label: "Truncate text", default: true, section: TAB.table, order: to++, display_size: "half" };
          options.truncateHeaders = { type: "boolean", label: "Truncate column names", default: false, section: TAB.table, order: to++, display_size: "half" };
          options.sizeToFit = { type: "boolean", label: "Size columns to fit", default: true, section: TAB.table, order: to++, display_size: "half" };
          options.minColWidth = { type: "number", label: "Minimum column width (px)", default: 0, section: TAB.table, order: to++, display_size: "half" };

          // shared per-field controls; heading folded into lbl_ (the first control)
          function addCommonHeader(f, section, oref) {
            var id = keyify(f.name), cur = (f.label_short || f.label || f.name);
            options["lbl_" + id] = { type: "string", label: headingLabel(f), section: section, order: oref.o++, placeholder: cur };
            options["img_" + id] = { type: "string", label: "Header image URL", section: section, order: oref.o++, placeholder: "https://\u2026" };
            options["imgpos_" + id] = { type: "string", label: "Image position", display: "select", values: [{ Left: "left" }, { Above: "above" }, { Below: "below" }, { Right: "right" }], default: "above", section: section, order: oref.o++, display_size: "half" };
            options["imgsize_" + id] = { type: "number", label: "Image size (px)", default: 20, section: section, order: oref.o++, display_size: "half" };
          }
          function addAlign(f, section, oref) {
            options["align_" + keyify(f.name)] = { type: "string", label: "Text align", display: "select", values: [{ Default: "" }, { Left: "left" }, { Center: "center" }, { Right: "right" }], default: "", section: section, order: oref.o++, display_size: "half" };
          }
          function addFontStyle(f, section, oref) {
            var id = keyify(f.name);
            options["bold_" + id] = { type: "boolean", label: "Bold", default: false, section: section, order: oref.o++, display_size: "third" };
            options["italic_" + id] = { type: "boolean", label: "Italic", default: false, section: section, order: oref.o++, display_size: "third" };
            options["underline_" + id] = { type: "boolean", label: "Underline", default: false, section: section, order: oref.o++, display_size: "third" };
          }
          function addColors(f, section, oref) {
            var id = keyify(f.name);
            options["fontcolor_" + id] = { type: "string", label: "Font color", display: "color", section: section, order: oref.o++, display_size: "half" };
            options["bg_" + id] = { type: "string", label: "Background", display: "color", section: section, order: oref.o++, display_size: "half" };
          }
          function addTooltip(f, section, oref) {
            options["tooltip_" + keyify(f.name)] = { type: "boolean", label: "Custom tooltip", default: false, section: section, order: oref.o++ };
          }

          // ---------- DIMENSIONS tab ----------
          var dref = { o: 100 };
          dims.forEach(function (f) {
            addCommonHeader(f, TAB.dims, dref);
            addAlign(f, TAB.dims, dref);
            options["width_" + keyify(f.name)] = { type: "string", label: "Column width", section: TAB.dims, order: dref.o++, display_size: "half", placeholder: "auto" };
            addFontStyle(f, TAB.dims, dref);
            addColors(f, TAB.dims, dref);
            addTooltip(f, TAB.dims, dref);
          });

          // ---------- MEASURES tab ----------
          var fmtVals = [{ Default: "" }, { "1,234": "#,##0" }, { "1,234.5": "#,##0.0" }, { "1,234.56": "#,##0.00" }, { "12%": "0%" }, { "12.3%": "0.0%" }, { "12.34%": "0.00%" }, { "$1,234": "$#,##0" }, { "$1,234.56": "$#,##0.00" }];
          var mref = { o: 500 };
          measures.forEach(function (f) {
            var id = keyify(f.name);
            addCommonHeader(f, TAB.meas, mref);
            options["fmt_" + id] = { type: "string", label: "Number format", display: "select", values: fmtVals, default: "", section: TAB.meas, order: mref.o++, display_size: "half" };
            addAlign(f, TAB.meas, mref);
            // Ratio measures (num/den detected from SQL) default to exact Ratio: reconstruct
            // components per row and Sum(num)/Sum(den). Other percent-formatted measures
            // default to Average since summing a rate is meaningless. User can override either.
            var isRatio = !!ratioInfo[f.name];
            var isPct = f.value_format && String(f.value_format).indexOf("%") >= 0;
            var aggVals = [{ Sum: "sum" }, { Average: "average" }, { Min: "min" }, { Max: "max" }];
            if (isRatio) aggVals.unshift({ "Ratio (exact)": "ratio" });
            options["agg_" + id] = { type: "string", label: "Subtotal aggregation", display: "select", values: aggVals, default: isRatio ? "ratio" : (isPct ? "average" : "sum"), section: TAB.meas, order: mref.o++ };
            options["bar_" + id] = { type: "boolean", label: "Cell visualization", default: false, section: TAB.meas, order: mref.o++ };
            options["barcolor_" + id] = { type: "string", label: "Bar color", display: "color", default: "#bfdbfe", section: TAB.meas, order: mref.o++ };
            options["cf_" + id] = { type: "string", label: "Conditional formatting", display: "select", values: [{ None: "none" }, { "Color scale": "scale" }, { "Threshold rules": "rule" }], default: "none", section: TAB.meas, order: mref.o++ };
            options["cflo_" + id] = { type: "string", label: "Scale: low color", display: "color", default: "#fecaca", section: TAB.meas, order: mref.o++, display_size: "half" };
            options["cfhi_" + id] = { type: "string", label: "Scale: high color", display: "color", default: "#bbf7d0", section: TAB.meas, order: mref.o++, display_size: "half" };
            for (var ri = 1; ri <= 3; ri++) {
              var sfx = ri === 1 ? "" : String(ri);
              options["cfop" + sfx + "_" + id] = { type: "string", label: "Rule " + ri + ": operator", display: "select", values: [{ "\u2265": ">=" }, { ">": ">" }, { "\u2264": "<=" }, { "<": "<" }, { "=": "=" }], default: ">=", section: TAB.meas, order: mref.o++, display_size: "half" };
              options["cfval" + sfx + "_" + id] = { type: "number", label: "Rule " + ri + ": value", section: TAB.meas, order: mref.o++, display_size: "half" };
              options["cfbg" + sfx + "_" + id] = { type: "string", label: "Rule " + ri + ": cell color", display: "color", default: "#dcfce7", section: TAB.meas, order: mref.o++ };
            }
            addFontStyle(f, TAB.meas, mref);
            addColors(f, TAB.meas, mref);
            addTooltip(f, TAB.meas, mref);
          });

          // Stack every control on its own line so long toggle labels don't wrap:
          // drop half/third column sizing that packed controls side-by-side.
          Object.keys(options).forEach(function (k) { if (options[k] && options[k].display_size) delete options[k].display_size; });
          this.trigger("registerOptions", options);

          // ---- map flat config -> nested config for the renderer ----
          var cfg = {
            transpose: !!config.transpose,
            showSubtotals: config.showSubtotals !== false,
            subtotalDepth: 0,
            defaultCollapsed: !!config.defaultCollapsed,
            calcOthers: !!config.calcOthers,
            calcOthersLimit: config.calcOthersLimit || 10,
            bodyFontSize: config.bodyFontSize || 12,
            truncate: config.truncate !== false,
            truncateHeaders: !!config.truncateHeaders,
            sizeToFit: config.sizeToFit !== false,
            minColWidth: config.minColWidth || 0,
            headers: {}, cellViz: {}, conditionalFormat: {}, measureAgg: {}
          };
          // Subtotal Depth: selected dimension name -> depth cutoff (index+1); "" = all levels
          if (config.subtotalDepth) {
            for (var di = 0; di < dims.length; di++) { if (dims[di].name === config.subtotalDepth) { cfg.subtotalDepth = di + 1; break; } }
          }
          function readHeader(f) {
            var id = keyify(f.name), h = {};
            if (config["lbl_" + id]) h.label = config["lbl_" + id];
            if (config["img_" + id]) h.image = config["img_" + id];
            if (config["imgpos_" + id]) h.imagePos = config["imgpos_" + id];
            if (config["imgsize_" + id]) h.imageSize = config["imgsize_" + id];
            if (config["align_" + id]) h.textAlign = config["align_" + id];
            if (config["width_" + id]) h.width = config["width_" + id];
            if (config["bold_" + id]) h.bold = true;
            if (config["italic_" + id]) h.italic = true;
            if (config["underline_" + id]) h.underline = true;
            if (config["fontcolor_" + id]) h.color = config["fontcolor_" + id];
            if (config["bg_" + id]) h.background = config["bg_" + id];
            if (config["tooltip_" + id]) h.tooltip = true;
            cfg.headers[f.name] = h;
          }
          dims.forEach(readHeader);
          measures.forEach(function (f) {
            readHeader(f);
            var id = keyify(f.name);
            if (config["fmt_" + id]) cfg.headers[f.name].numberFormat = config["fmt_" + id];
            // Effective aggregation must mirror the option's default so a detected
            // ratio computes exact Ratio even before the user touches the dropdown.
            var isRatioM = !!ratioInfo[f.name];
            var isPctM = f.value_format && String(f.value_format).indexOf("%") >= 0;
            var av = config["agg_" + id] || (isRatioM ? "ratio" : (isPctM ? "average" : "sum"));
            if (av === "ratio") cfg.measureAgg[f.name] = ratioInfo[f.name] ? { ratioSolve: ratioInfo[f.name] } : "sum";
            else cfg.measureAgg[f.name] = av;
            if (config["bar_" + id]) cfg.cellViz[f.name] = { bar: true, barColor: config["barcolor_" + id] || "#bfdbfe" };
            var cf = config["cf_" + id];
            if (cf === "scale") {
              cfg.conditionalFormat[f.name] = { type: "scale", colors: [config["cflo_" + id] || "#fecaca", config["cfhi_" + id] || "#bbf7d0"] };
            } else if (cf === "rule") {
              var rules = [];
              [["cfop_", "cfval_", "cfbg_"], ["cfop2_", "cfval2_", "cfbg2_"], ["cfop3_", "cfval3_", "cfbg3_"]].forEach(function (t) {
                var val = config[t[1] + id];
                if (val != null && val !== "") rules.push({ op: config[t[0] + id] || ">=", value: Number(val), bg: config[t[2] + id] || "#dcfce7" });
              });
              if (rules.length) cfg.conditionalFormat[f.name] = { type: "threshold", rules: rules };
            }
          });

          var utils = (typeof LookerCharts !== "undefined" && LookerCharts.Utils) ? LookerCharts.Utils : null;
          window.renderCollapsibleTable(this._c, data, queryResponse, cfg, utils);
        } catch (e) {
          this._c.innerHTML = '<div style="padding:12px;color:#b91c1c;font-family:Arial;">Collapsible Report Table error: ' + esc(e.message) + "</div>";
          throw e;
        } finally { done(); }
      }
    });
  }
})();
