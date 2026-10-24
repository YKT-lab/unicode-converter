"use strict";

// Build-time only: the browser consumes generated JSON, never UCD source files.
// Pin one published release so category, Script, CCC and normalization agree.
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const {execFile} = require("child_process");
const {promisify} = require("util");
const run = promisify(execFile);
const VERSION = "18.0.0";
const BASE = "https://www.unicode.org/Public/" + VERSION + "/ucd/";
const FILES = ["ReadMe.txt", "UnicodeData.txt", "Scripts.txt", "ScriptExtensions.txt",
  "PropertyValueAliases.txt", "DerivedNormalizationProps.txt", "NormalizationTest.txt"];
const ROOT = path.resolve(__dirname, "..");
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const CATEGORIES = new Set(["Mn", "Mc", "Me"]);

function range(raw) {
  const points = raw.trim().split("..").map(value => parseInt(value, 16));
  if (points.length === 1) points.push(points[0]);
  if (points.some(value => !Number.isInteger(value)) || points[0] > points[1] || points[1] > 0x10FFFF)
    throw Error("Invalid UCD range: " + raw);
  return points;
}
function propertyRows(text) {
  return text.split(/\r?\n/).map(line => line.split("#")[0].trim()).filter(Boolean)
    .map(line => line.split(";").map(field => field.trim()));
}
function rangeLookup(rows) {
  const ranges = rows.map(([raw, value]) => [...range(raw), value]).sort((a,b) => a[0] - b[0]);
  return point => {
    let low = 0, high = ranges.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1, item = ranges[mid];
      if (point < item[0]) high = mid - 1;
      else if (point > item[1]) low = mid + 1;
      else return item[2];
    }
    return null;
  };
}
function build(source) {
  if (!source["ReadMe.txt"].toLowerCase().includes("version " + VERSION) ||
      !/contains final data files/i.test(source["ReadMe.txt"]) || /(?:draft|beta)/i.test(source["ReadMe.txt"]))
    throw Error("Expected the final published Unicode " + VERSION + " release");
  for (const name of FILES.filter(name => !["ReadMe.txt", "UnicodeData.txt"].includes(name))) {
    if (!source[name].includes(name.replace(/\.txt$/, "-") + VERSION + ".txt"))
      throw Error("Unexpected UCD version in " + name);
  }
  const aliases = new Map();
  for (const row of propertyRows(source["PropertyValueAliases.txt"])) {
    if (row[0] === "sc") for (const alias of row.slice(1)) aliases.set(alias, {code:row[1], name:row[2]});
  }
  const scriptAt = rangeLookup(propertyRows(source["Scripts.txt"]));
  const extensionsAt = rangeLookup(propertyRows(source["ScriptExtensions.txt"]));
  const excluded = new Set();
  for (const [raw, property] of propertyRows(source["DerivedNormalizationProps.txt"])) {
    if (property !== "Full_Composition_Exclusion") continue;
    const [first,last] = range(raw);
    for (let cp=first; cp<=last; cp++) excluded.add(cp);
  }
  const marks = [], decompositions = [], combining_classes = [], compositions = [];
  let priorPoint = -1;
  for (const line of source["UnicodeData.txt"].trim().split(/\r?\n/)) {
    const fields = line.split(";");
    if (fields.length !== 15) throw Error("Malformed UnicodeData row");
    const cp = parseInt(fields[0], 16), ccc = Number(fields[3]);
    if (!Number.isInteger(cp) || cp <= priorPoint || !Number.isInteger(ccc) || ccc < 0 || ccc > 255)
      throw Error("Invalid UnicodeData ordering or CCC");
    priorPoint = cp;
    if (ccc) combining_classes.push([cp,ccc]);
    if (fields[5]) {
      const parts = fields[5].split(" "), compatibility = parts[0].startsWith("<") ? 1 : 0;
      if (compatibility) parts.shift();
      const sequence = parts.map(value => parseInt(value,16));
      decompositions.push([cp,compatibility,...sequence]);
      if (!compatibility && sequence.length === 2 && !excluded.has(cp)) compositions.push([...sequence,cp]);
    }
    if (!CATEGORIES.has(fields[2])) continue;
    if (/^<.*(?:First|Last)>$/.test(fields[1])) throw Error("Mark range requires expansion");
    const script = aliases.get(scriptAt(cp) || "Unknown");
    if (!script) throw Error("Unknown Script for " + fields[0]);
    const extensions = (extensionsAt(cp) || script.code).split(/\s+/);
    if (extensions.some(code => !aliases.has(code))) throw Error("Unknown Script_Extensions alias");
    marks.push({codepoint:cp, name:fields[1], script:script.name, script_code:script.code,
      script_extensions:extensions, category:fields[2], combining_class:ccc});
  }
  const sources = FILES.map(file => ({file, url:BASE+file, sha256:sha256(source[file])}));
  const metadata = {schema_version:1, unicode_version:VERSION, unicode_status:"final",
    sources, license:{name:"Unicode License V3", url:"https://www.unicode.org/license.txt",
      notice_file:"docs/licenses/Unicode-LICENSE.txt"}};
  const category_counts = Object.fromEntries([...CATEGORIES].map(category => [category, marks.filter(mark => mark.category === category).length]));
  return {
    catalogue:{...metadata,count:marks.length,category_counts,marks},
    normalization:{...metadata,decompositions,combining_classes,compositions}
  };
}

async function main() {
  let check=false, cacheDir=path.join(os.tmpdir(),"unicode-converter-ucd",VERSION), offline=false;
  for (const arg of process.argv.slice(2)) {
    if (arg === "--check") check=true;
    else if (arg === "--offline") offline=true;
    else if (arg.startsWith("--cache-dir=")) cacheDir=path.resolve(arg.slice(12));
    else throw Error("Unknown argument " + arg);
  }
  fs.mkdirSync(cacheDir,{recursive:true});
  const source = {};
  await Promise.all([...FILES,"LICENSE.txt"].map(async name => {
    const target=path.join(cacheDir,name), url=name === "LICENSE.txt" ? "https://www.unicode.org/license.txt" : BASE+name;
    if (!fs.existsSync(target)) {
      if (offline) throw Error("Missing cached UCD source " + target);
      const temporary=target+".tmp";
      // curl respects the managed runtime's inherited HTTPS proxy and CA trust.
      await run("curl",["--fail","--location","--silent","--show-error","--max-time","60","--retry","2",url,"--output",temporary]);
      fs.renameSync(temporary,target);
    }
    source[name]=fs.readFileSync(target,"utf8");
  }));
  const {catalogue,normalization}=build(source);
  const outputs = [["data/combining-marks.json",JSON.stringify(catalogue)+"\n"],
    ["data/combining-normalization.json",JSON.stringify(normalization)+"\n"],
    ["docs/licenses/Unicode-LICENSE.txt",source["LICENSE.txt"]]];
  for (const [relative,content] of outputs) {
    const target=path.join(ROOT,relative);
    if (check) {
      if (!fs.existsSync(target) || fs.readFileSync(target,"utf8") !== content) throw Error("Generated file differs: " + relative);
    } else {
      fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.writeFileSync(target,content);
    }
  }
  console.log((check ? "Verified" : "Generated") + " Unicode " + VERSION + ": " + catalogue.count + " marks " + JSON.stringify(catalogue.category_counts));
}
if (require.main === module) main().catch(error => {console.error(error.message);process.exitCode=1;});
module.exports={build, VERSION, FILES};
