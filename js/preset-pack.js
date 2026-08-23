/*
 * Suflo Smooth .prfpset okuyucu
 *
 * Premiere preset dosyasi XML tabanlidir. Bu modul paketin klasor agacini,
 * efektlerini ve anahtar karelerini panel tarafinda okunabilir bir kataloga
 * cevirir. Degerler yalnızca sayi/nokta/renk gibi standart parametrelerse
 * "direct" olur; Adobe'nin opak ArbVideo blob'larini kullanan az sayidaki
 * preset, guvenli yerel ice aktarma yoluna birakilir.
 */
window.SufloPresetPack = (function () {
  "use strict";

  function decode(value) {
    return String(value || "")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }

  function text(block, tag) {
    var m = new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + tag + ">", "i").exec(block || "");
    return m ? decode(m[1].replace(/<[^>]+>/g, "").trim()) : "";
  }

  function ref(block, tag) {
    var m = new RegExp("<" + tag + "\\b[^>]*\\bObjectRef=\"(\\d+)\"", "i").exec(block || "");
    return m ? m[1] : "";
  }

  function refs(block, tag) {
    var out = [];
    var re = new RegExp("<" + tag + "\\b[^>]*\\bObjectRef=\"(\\d+)\"", "ig");
    var m;
    while ((m = re.exec(block || ""))) out.push(m[1]);
    return out;
  }

  function objectMap(xml) {
    var out = {};
    var re = /<([A-Za-z][A-Za-z0-9]*)\b([^>]*\bObjectID="(\d+)"[^>]*)>([\s\S]*?)<\/\1>/g;
    var m;
    while ((m = re.exec(String(xml || "")))) {
      out[m[3]] = { type: m[1], id: m[3], block: m[0] };
    }
    return out;
  }

  function number(value, fallback) {
    var n = Number(String(value || "").replace(/\.$/, ""));
    return isFinite(n) ? n : fallback;
  }

  function value(raw) {
    raw = String(raw === undefined || raw === null ? "" : raw).trim();
    if (!raw) return null;
    if (raw === "true" || raw === "false") return raw === "true";
    if (raw.indexOf(":") !== -1) {
      var parts = raw.split(":").map(function (part) { return number(part, NaN); });
      return parts.length && parts.every(function (part) { return isFinite(part); }) ? parts : null;
    }
    var n = number(raw, NaN);
    return isFinite(n) ? n : null;
  }

  function keys(raw) {
    var out = [];
    String(raw || "").split(";").forEach(function (entry) {
      entry = entry.trim();
      if (!entry) return;
      var first = entry.indexOf(",");
      if (first === -1) return;
      var rest = entry.slice(first + 1);
      var second = rest.indexOf(",");
      var tick = number(entry.slice(0, first), NaN);
      var val = value(second === -1 ? rest : rest.slice(0, second));
      if (isFinite(tick) && val !== null) out.push({ tick: tick, value: val });
    });
    return out;
  }

  function slug(valueText) {
    return String(valueText || "preset").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "preset";
  }

  function groupFor(path, name) {
    var hay = (path.join(" ") + " " + name).toLowerCase();
    if (/zoom|push|pull/.test(hay)) return "zoom";
    if (/slide|transition|wipe|pan|whip/.test(hay)) return "slide";
    if (/fade|opacity|flash/.test(hay)) return "fade";
    if (/shake|impact|bounce|punch|glitch|flicker|spin/.test(hay)) return "impact";
    return "pack";
  }

  function previewFor(group) {
    if (group === "zoom") return "zoom-in";
    if (group === "slide") return "slide-left";
    if (group === "fade") return "fade-in";
    if (group === "impact") return "shake";
    return "pack";
  }

  function parseParam(node) {
    if (!node) return null;
    var direct = node.type === "VideoComponentParam" || node.type === "PointComponentParam";
    return {
      index: 0,
      kind: node.type,
      name: text(node.block, "Name"),
      parameterId: number(text(node.block, "ParameterID"), -1),
      controlType: number(text(node.block, "ParameterControlType"), -1),
      timeVarying: text(node.block, "IsTimeVarying") === "true",
      current: value(text(node.block, "CurrentValue")),
      keys: keys(text(node.block, "Keyframes")),
      direct: direct
    };
  }

  function parseComponent(map, presetNode) {
    var component = map[ref(presetNode.block, "Component")];
    if (!component) return null;
    var paramRefs = refs(textBlock(component.block, "Params"), "Param");
    var params = [];
    var direct = true;
    for (var i = 0; i < paramRefs.length; i++) {
      var p = parseParam(map[paramRefs[i]]);
      if (!p) continue;
      p.index = i;
      if (!p.direct) direct = false;
      params.push(p);
    }
    var matchName = text(component.block, "MatchName") || text(presetNode.block, "FilterMatchName");
    return {
      matchName: matchName,
      displayName: text(component.block, "DisplayName"),
      intrinsic: text(component.block, "Intrinsic") === "true",
      type: number(text(presetNode.block, "Type"), 1),
      anchorIn: number(text(presetNode.block, "AnchorInPoint"), 0),
      anchorOut: number(text(presetNode.block, "AnchorOutPoint"), 0),
      speed: number(text(presetNode.block, "Speed"), 1),
      params: params,
      direct: direct,
      thirdParty: matchName.indexOf("AE.Mettle") === 0
    };
  }

  function textBlock(block, tag) {
    var m = new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + tag + ">", "i").exec(block || "");
    return m ? m[1] : "";
  }

  function treeName(node) {
    return text(textBlock(node && node.block, "TreeItemBase"), "Name");
  }

  function parse(xml) {
    var map = objectMap(xml);
    var rootMatch = /<RootBin\b[^>]*\bObjectRef="(\d+)"/i.exec(String(xml || ""));
    var rootId = rootMatch ? rootMatch[1] : "2";
    var catalog = [];
    var seen = {};

    function walk(id, path) {
      if (seen[id]) return;
      seen[id] = true;
      var node = map[id];
      if (!node) return;
      if (node.type === "BinTreeItem") {
        var folder = treeName(node);
        var next = path.slice();
        if (folder && folder !== "Root" && folder !== "SUFLO SMOOTH EDITING PACK") next.push(folder);
        var itemRefs = refs(textBlock(node.block, "Items"), "Item");
        for (var i = 0; i < itemRefs.length; i++) walk(itemRefs[i], next);
        return;
      }
      if (node.type !== "TreeItem") return;
      var item = map[ref(textBlock(node.block, "TreeItemBase"), "Data")];
      if (!item || item.type !== "FilterPresetItem") return;
      var presetRefs = refs(textBlock(item.block, "FilterPresets"), "FilterPreset");
      var components = [];
      var direct = true;
      var thirdParty = false;
      for (var p = 0; p < presetRefs.length; p++) {
        var presetNode = map[presetRefs[p]];
        if (!presetNode) continue;
        var component = parseComponent(map, presetNode);
        if (!component) continue;
        if (!component.direct) direct = false;
        if (component.thirdParty) thirdParty = true;
        components.push(component);
      }
      var name = treeName(node) || "Suflo Preset";
      var uid = text(node.block, "MZ.EffectPresets.PresetUID");
      var group = groupFor(path, name);
      catalog.push({
        id: "pack-" + (uid || (slug(path.join("-") + "-" + name) + "-" + catalog.length)),
        name: name,
        group: group,
        preview: previewFor(group),
        folder: path.join(" › ") || "Suflo Smooth",
        desc: path.length ? path[path.length - 1] : "Suflo Smooth",
        source: "pack",
        direct: direct && components.length > 0,
        thirdParty: thirdParty,
        components: components
      });
    }

    walk(rootId, []);
    return {
      presets: catalog,
      total: catalog.length,
      direct: catalog.filter(function (p) { return p.direct; }).length,
      fallback: catalog.filter(function (p) { return !p.direct; }).length
    };
  }

  return { parse: parse, parseValue: value, parseKeys: keys };
})();
