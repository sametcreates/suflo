/*
 * A licensed Premiere .prfpset bundle into a Suflo-branded customer file.
 *
 * Usage:
 *   node tools/prepare-prfpset.js <source.prfpset> <target.prfpset>
 */
"use strict";

var fs = require("fs"), path = require("path");
var source = process.argv[2] ? path.resolve(process.argv[2]) : "";
var target = process.argv[3] ? path.resolve(process.argv[3]) : "";

function fail(message) { console.error("HATA: " + message); process.exit(1); }
if (!source || !target || !fs.existsSync(source)) fail("Kaynak .prfpset bulunamadi.");
if (!/\.prfpset$/i.test(source) || !/\.prfpset$/i.test(target)) fail("Kaynak ve hedef .prfpset olmali.");

var xml = fs.readFileSync(source, "utf8");
if (!/^<\?xml[^>]*>\s*<PremiereData\b/.test(xml)) fail("Dosya gecerli bir Premiere preset paketi degil.");

var presetCount = (xml.match(/<TreeItem\s+ObjectID=/g) || []).length;
if (presetCount < 1) fail("Paketin icinde ayri preset bulunamadi.");

xml = xml
  .replace(/\[EDITING LAIR\]\s*MALICE SMOOTH EDITING PACK/gi, "SUFLO SMOOTH EDITING PACK")
  .replace(/\bMalice\b/gi, "SUFLO")
  .replace(/\bEditing Lair\b/gi, "SUFLO");

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, xml, "utf8");
console.log("Suflo preset paketi hazir: " + presetCount + " preset -> " + target);
