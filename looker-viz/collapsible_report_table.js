/*
 * Collapsible Report Table — production Looker custom visualization
 * -----------------------------------------------------------------
 * Combines, in one table:
 *   - Merged repeated dimension values (spanning cells), the "Report Table" look
 *   - Per-dimension click-to-collapse at EVERY level (built-in Table behavior)
 *   - Per-column header controls: image-by-URL, position, size, hide-text, align, color
 *   - In-cell bars (per measure, toggle on)
 *   - Conditional formatting (per measure): color scale or a threshold rule
 *   - Subtotals per group with per-measure aggregation (sum / average / min / max / ratio)
 *   - Drill-to-Explore on measure cells (via Looker's cell markup)
 *
 * Works two ways:
 *   1) Inside Looker (registers itself as "collapsible_report_table")
 *   2) Standalone (call window.renderCollapsibleTable(container, data, queryResponse, config))
 */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function keyify(name) { return String(name).replace(/[^a-zA-Z0-9]/g, "_"); }

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

  function aggregate(rows, measures, measureAgg) {
    var out = {};
    measures.forEach(function (mf) {
      var spec = (measureAgg && measureAgg[mf.name]) || "sum";
      if (spec && spec.ratio) {
        var num = 0, den = 0;
        rows.forEach(function (r) {
          num += Number((r[spec.ratio[0]] || {}).value) || 0;
          den += Number((r[spec.ratio[1]] || {}).value) || 0;
        });
        out[mf.name] = den ? num / den : null;
        return;
      }
      var mode = (typeof spec === "string") ? spec : "sum";
      var vals = [];
      rows.forEach(function (r) { var x = (r[mf.name] || {}).value; if (x != null && !isNaN(x)) vals.push(Number(x)); });
      if (!vals.length) { out[mf.name] = null; return; }
      if (mode === "average" || mode === "avg") out[mf.name] = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
      else if (mode === "min") out[mf.name] = Math.min.apply(null, vals);
      else if (mode === "max") out[mf.name] = Math.max.apply(null, vals);
      else out[mf.name] = vals.reduce(function (a, b) { return a + b; }, 0);
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

  window.renderCollapsibleTable = function (container, data, queryResponse, config, utils) {
    config = config || {};
    var fields = queryResponse.fields || {};
    var dims = fields.dimensions || [];
    var measures = (fields.measures || []).concat(fields.table_calculations || []);
    var cols = dims.concat(measures);
    var lastDim = dims.length - 1;
    var showSub = config.showSubtotals !== false;
    var headers = config.headers || {};
    var measureAgg = config.measureAgg || {};
    var cellViz = config.cellViz || {};
    var condFmt = config.conditionalFormat || {};
    var collapsed = container.__collapsedState || (container.__collapsedState = new Set());

    if (!data || !data.length) { container.innerHTML = '<div style="padding:16px;font-family:Arial;color:#64748b;">No results</div>'; return; }

    var fmt = {};
    measures.forEach(function (mf) { fmt[mf.name] = makeFormatter(mf.value_format); });

    // per-measure min/max across leaf data (for bars + color scales)
    var stats = {};
    measures.forEach(function (mf) {
      var mn = Infinity, mx = -Infinity;
      data.forEach(function (r) { var x = Number((r[mf.name] || {}).value); if (!isNaN(x)) { if (x < mn) mn = x; if (x > mx) mx = x; } });
      stats[mf.name] = { min: mn, max: mx };
    });

    // ---- no-dimension fallback: flat table ----
    if (!dims.length) {
      renderFlat(container, data, measures, fmt, headers, cellViz, condFmt, stats, config, utils);
      return;
    }

    var tree = buildTree(data, dims);

    function pk(parentNode, key) { return (parentNode.__path || "") + "\u0001" + key; }
    (function assign(node) { node.childOrder.forEach(function (k) { var c = node.children.get(k); c.__path = pk(node, k); assign(c); }); })(tree);

    if (!container.__seeded && config.defaultCollapsed) {
      (function seed(node) {
        node.childOrder.forEach(function (k) {
          var c = node.children.get(k);
          if (c.level < lastDim) { collapsed.add(c.__path); seed(c); }
        });
      })(tree);
    }
    container.__seeded = true;

    // ---- produce ordered list of visible rows ----
    var vis = [];
    (function walk(node) {
      node.childOrder.forEach(function (k) {
        var c = node.children.get(k);
        var isCollapsed = collapsed.has(c.__path) && c.level < lastDim;
        var keys = keysFor(c);
        if (isCollapsed) {
          vis.push({ kind: "collapsed", node: c, atLevel: c.level, keys: keys, measures: aggregate(c.rows, measures, measureAgg) });
        } else if (c.level === lastDim) {
          c.rows.forEach(function (r) {
            var mv = {}; measures.forEach(function (mf) { mv[mf.name] = (r[mf.name] || {}).value; });
            vis.push({ kind: "data", node: c, atLevel: c.level, keys: keys, row: r, measures: mv });
          });
          if (showSub && c.rows.length > 1) vis.push({ kind: "sub", node: c, atLevel: c.level, keys: keys, measures: aggregate(c.rows, measures, measureAgg) });
        } else {
          walk(c);
          if (showSub) vis.push({ kind: "sub", node: c, atLevel: c.level, keys: keys, measures: aggregate(c.rows, measures, measureAgg) });
        }
      });
    })(tree);

    function keysFor(node) {
      var arr = new Array(dims.length).fill(undefined);
      var parts = node.__path.split("\u0001").slice(1);
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
        while (j < vis.length && samePrefix(vis[i].keys, vis[j].keys, c)) j++;
        var nodeAtC = nodeByKeys(tree, vis[i].keys, c);
        var collapsible = nodeAtC && nodeAtC.level < lastDim;
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

    var hHeight = 0;
    cols.forEach(function (f) { var h = (headers[f.name] || {}).headerHeight; if (h) hHeight = Math.max(hHeight, h); });

    var thead = "<thead><tr>" + cols.map(function (f, idx) { return headerCell(f, idx < dims.length, headers, hHeight); }).join("") + "</tr></thead>";

    var caretOpen = "\u25be", caretClosed = "\u25b8";
    var body = vis.map(function (row, ri) {
      var tds = "";
      for (var c = 0; c < dims.length; c++) {
        var g = grid[ri][c];
        if (!g || g.render === false) continue;
        if (g.empty) { tds += '<td class="dimc empty"></td>'; continue; }
        var caret = g.caret ? '<span class="caret" data-path="' + esc(g.path) + '">' + (g.isCollapsed ? caretClosed : caretOpen) + "</span> " : "";
        var dval = g.cell ? cellDisplay(g.cell, null, utils) : esc(g.value);
        tds += '<td class="dimc" rowspan="' + g.span + '">' + caret + dval + "</td>";
      }
      var mcls = row.kind === "data" ? "mnum" : "mnum agg";
      measures.forEach(function (mf) {
        tds += measureCell(mf, row, fmt, stats, cellViz, condFmt, mcls, utils);
      });
      var rowCls = row.kind === "data" ? "datarow" : (row.kind === "collapsed" ? "collapsedrow" : "subrow");
      return '<tr class="' + rowCls + '">' + tds + "</tr>";
    }).join("");

    container.innerHTML = styleBlock(config) + '<table class="crt">' + thead + "<tbody>" + body + "</tbody></table>";
    wireCarets(container, data, queryResponse, config, utils);
  };

  // ---- shared cell/header renderers ----
  function measureCell(mf, row, fmt, stats, cellViz, condFmt, mcls, utils) {
    var v = row.measures[mf.name];
    var st = stats[mf.name] || { min: 0, max: 0 };
    var tdStyle = "";
    var content;
    if (row.kind === "data") content = cellDisplay(row.row[mf.name] || {}, fmt[mf.name], utils);
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
    return '<td class="' + mcls + '" style="' + tdStyle + '">' + inner + "</td>";
  }

  function headerCell(f, isDim, headers, hHeight) {
    var hc = headers[f.name] || {};
    var pos = hc.imagePos || "above", size = hc.imageSize || 20, pad = hc.imagePad != null ? hc.imagePad : 4;
    var align = hc.textAlign || (isDim ? "left" : "right");
    var text = hc.suppressText ? "" : esc(f.label_short || f.label || f.name);
    var img = hc.image ? '<img src="' + esc(hc.image) + '" alt="' + esc(hc.alt || text) + '" title="' + esc(hc.alt || "") +
      '" style="width:' + size + "px;height:" + size + 'px;object-fit:contain;" onerror="this.style.display=\'none\'"/>' : "";
    var flexDir = { above: "column", below: "column-reverse", left: "row", right: "row-reverse" }[pos] || "column";
    var justify = align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start";
    var style = "display:flex;flex-direction:" + flexDir + ";align-items:center;justify-content:" + justify + ";gap:" + pad + "px;" +
      (hc.color ? "color:" + hc.color + ";" : "") + (hc.fontSize ? "font-size:" + hc.fontSize + "px;" : "");
    var thStyle = (hc.background ? "background:" + hc.background + ";" : "") + "text-align:" + align + ";" + (hHeight ? "height:" + hHeight + "px;" : "");
    return '<th style="' + thStyle + '"><div style="' + style + '">' + img + (text ? '<span>' + text + "</span>" : "") + "</div></th>";
  }

  function styleBlock(config) {
    var bodyFont = config.bodyFontSize || 12;
    return '<style>' +
      '.crt{border-collapse:collapse;width:100%;font-family:Roboto,Arial,sans-serif;font-size:' + bodyFont + 'px;color:#1f2937;}' +
      '.crt th{border-bottom:2px solid #cbd5e1;padding:6px 10px;background:#f8fafc;position:sticky;top:0;z-index:2;}' +
      '.crt td{padding:5px 10px;border-bottom:1px solid #eef2f7;}' +
      '.crt td.mnum{text-align:right;font-variant-numeric:tabular-nums;position:relative;overflow:hidden;}' +
      '.crt .cellbar{position:absolute;left:0;top:3px;bottom:3px;border-radius:2px;z-index:0;opacity:.6;}' +
      '.crt .cellval{position:relative;z-index:1;}' +
      '.crt td.dimc{vertical-align:top;background:#fff;font-weight:600;white-space:nowrap;}' +
      '.crt tr.datarow td.mnum{font-weight:400;}' +
      '.crt tr.subrow{background:#f1f5f9;} .crt tr.subrow td{font-weight:700;border-top:1px solid #cbd5e1;}' +
      '.crt tr.collapsedrow{background:#eef2ff;} .crt tr.collapsedrow td{font-weight:700;}' +
      '.crt tr.datarow:hover{background:#f9fafb;}' +
      '.crt .caret{cursor:pointer;color:#2563eb;user-select:none;font-size:' + (bodyFont + 1) + 'px;}' +
      '.crt td.empty{background:#fff;}' +
      '</style>';
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

  function renderFlat(container, data, measures, fmt, headers, cellViz, condFmt, stats, config, utils) {
    var thead = "<thead><tr>" + measures.map(function (f) { return headerCell(f, false, headers, 0); }).join("") + "</tr></thead>";
    var body = data.map(function (r) {
      var tds = measures.map(function (mf) {
        return measureCell(mf, { kind: "data", row: r, measures: (function () { var o = {}; measures.forEach(function (m) { o[m.name] = (r[m.name] || {}).value; }); return o; })() }, fmt, stats, cellViz, condFmt, "mnum", utils);
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

          // ---- build dynamic per-column options for the config panel ----
          var options = {
            showSubtotals: { type: "boolean", label: "Show subtotals", default: true, section: "Table", order: 1 },
            defaultCollapsed: { type: "boolean", label: "Start collapsed", default: false, section: "Table", order: 2 },
            bodyFontSize: { type: "number", label: "Body font size (px)", default: 12, section: "Table", order: 3 }
          };
          function addCommon(f, secOrder) {
            var id = keyify(f.name), sec = f.label_short || f.label || f.name, o = 0;
            options["img_" + id] = { type: "string", label: "Header image URL", section: sec, order: ++o, placeholder: "https://…" };
            options["imgpos_" + id] = { type: "string", label: "Image position", display: "select", values: [{ Above: "above" }, { Below: "below" }, { Left: "left" }, { Right: "right" }], default: "above", section: sec, order: ++o };
            options["imgsize_" + id] = { type: "number", label: "Image size (px)", default: 20, section: sec, order: ++o };
            options["suppress_" + id] = { type: "boolean", label: "Hide header text", default: false, section: sec, order: ++o };
            options["align_" + id] = { type: "string", label: "Text align", display: "select", values: [{ Default: "" }, { Left: "left" }, { Center: "center" }, { Right: "right" }], default: "", section: sec, order: ++o };
            return o;
          }
          dims.forEach(function (f) { addCommon(f); });
          measures.forEach(function (f) {
            var id = keyify(f.name), sec = f.label_short || f.label || f.name;
            var o = addCommon(f);
            options["agg_" + id] = { type: "string", label: "Subtotal aggregation", display: "select", values: [{ Sum: "sum" }, { Average: "average" }, { Min: "min" }, { Max: "max" }], default: "sum", section: sec, order: ++o };
            options["bar_" + id] = { type: "boolean", label: "Show in-cell bar", default: false, section: sec, order: ++o };
            options["barcolor_" + id] = { type: "string", label: "Bar color", display: "color", default: "#bfdbfe", section: sec, order: ++o };
            options["cf_" + id] = { type: "string", label: "Conditional formatting", display: "select", values: [{ None: "none" }, { "Color scale": "scale" }, { "Threshold rule": "rule" }], default: "none", section: sec, order: ++o };
            options["cflo_" + id] = { type: "string", label: "Scale: low color", display: "color", default: "#fecaca", section: sec, order: ++o };
            options["cfhi_" + id] = { type: "string", label: "Scale: high color", display: "color", default: "#bbf7d0", section: sec, order: ++o };
            options["cfop_" + id] = { type: "string", label: "Rule: operator", display: "select", values: [{ "≥": ">=" }, { ">": ">" }, { "≤": "<=" }, { "<": "<" }, { "=": "=" }], default: ">=", section: sec, order: ++o };
            options["cfval_" + id] = { type: "number", label: "Rule: value", section: sec, order: ++o };
            options["cfbg_" + id] = { type: "string", label: "Rule: cell color", display: "color", default: "#dcfce7", section: sec, order: ++o };
          });
          this.trigger("registerOptions", options);

          // ---- map flat config -> nested config for the renderer ----
          var cfg = {
            showSubtotals: config.showSubtotals !== false,
            defaultCollapsed: !!config.defaultCollapsed,
            bodyFontSize: config.bodyFontSize || 12,
            headers: {}, cellViz: {}, conditionalFormat: {}, measureAgg: {}
          };
          function readHeader(f) {
            var id = keyify(f.name);
            var h = {};
            if (config["img_" + id]) h.image = config["img_" + id];
            if (config["imgpos_" + id]) h.imagePos = config["imgpos_" + id];
            if (config["imgsize_" + id]) h.imageSize = config["imgsize_" + id];
            if (config["suppress_" + id]) h.suppressText = true;
            if (config["align_" + id]) h.textAlign = config["align_" + id];
            cfg.headers[f.name] = h;
          }
          dims.forEach(readHeader);
          measures.forEach(function (f) {
            readHeader(f);
            var id = keyify(f.name);
            if (config["agg_" + id]) cfg.measureAgg[f.name] = config["agg_" + id];
            if (config["bar_" + id]) cfg.cellViz[f.name] = { bar: true, barColor: config["barcolor_" + id] || "#bfdbfe" };
            var cf = config["cf_" + id];
            if (cf === "scale") cfg.conditionalFormat[f.name] = { type: "scale", colors: [config["cflo_" + id] || "#fecaca", config["cfhi_" + id] || "#bbf7d0"] };
            else if (cf === "rule") cfg.conditionalFormat[f.name] = { type: "threshold", rules: [{ op: config["cfop_" + id] || ">=", value: config["cfval_" + id], bg: config["cfbg_" + id] || "#dcfce7" }] };
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
