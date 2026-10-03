// Works both via Flask (http://127.0.0.1:5000) and by opening index.html directly
const API = location.protocol === "file:" ? "http://127.0.0.1:5000" : "";
const $ = id => document.getElementById(id);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const SAMPLE = "Artificial intelligence is the simulation of human intelligence by machines, especially computer systems. " +
  "Deep learning relies on neural networks that have many layers to learn complicated patterns in speech, pictures and text. " +
  "My favourite food is biryani, and I usually cook it on weekends with my family. " +
  "Burning coal, oil and gas releases greenhouse gases that trap heat and make the planet warmer.";

let defaultThreshold = 0.75;
let lastResult = null;
let activeFilter = "all";

/* ---------- helpers ---------- */
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const levelOf = p => p >= 50 ? "high" : p >= 20 ? "mid" : "low";

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ---------- theme ---------- */
$("themeBtn").addEventListener("click", () => {
  const root = document.documentElement;
  const isDark = root.getAttribute("data-theme") === "dark" ||
    (!root.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
  const next = isDark ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try { localStorage.setItem("theme", next); } catch (e) {}
});

/* ---------- status / sensitivity ---------- */
fetch(API + "/api/status").then(r => r.json()).then(s => {
  defaultThreshold = s.default_threshold;
  $("mode").textContent = (s.mode === "embeddings" ? "Embeddings (MiniLM)" : "TF-IDF fallback") +
    " · " + s.corpus_sentences + " sentences";
  setThreshold(defaultThreshold);
}).catch(() => { $("mode").textContent = "Server offline – run python app.py"; $("mode").classList.add("offline"); });

function setThreshold(v) {
  v = Math.min(0.95, Math.max(0.2, v));
  $("threshold").value = v;
  $("thVal").textContent = Number(v).toFixed(2);
  $$(".preset").forEach(b => {
    const target = defaultThreshold + parseFloat(b.dataset.delta);
    b.classList.toggle("active", Math.abs(target - v) < 0.006);
  });
}
$("threshold").addEventListener("input", e => setThreshold(parseFloat(e.target.value)));
$$(".preset").forEach(b => b.addEventListener("click",
  () => setThreshold(defaultThreshold + parseFloat(b.dataset.delta))));

/* ---------- editor ---------- */
function updateCount() {
  const t = $("text").value.trim();
  $("wc").textContent = t ? t.split(/\s+/).length : 0;
  $("cc").textContent = $("text").value.length;
}
$("text").addEventListener("input", () => { updateCount(); $("fileName").textContent = ""; });
$("sample").addEventListener("click", () => { switchTab("paste"); $("text").value = SAMPLE; updateCount(); $("fileName").textContent = ""; });
$("clear").addEventListener("click", () => {
  $("text").value = ""; $("reference").value = ""; $("file").value = ""; $("fileName").textContent = "";
  $("error").textContent = ""; $("results").classList.add("hidden"); updateCount();
});

function switchTab(name) {
  $$("[data-tab]").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  $("panel-paste").classList.toggle("hidden", name !== "paste");
  $("panel-upload").classList.toggle("hidden", name !== "upload");
}
$$("[data-tab]").forEach(t => t.addEventListener("click", () => switchTab(t.dataset.tab)));

function loadFile(f) {
  if (!f) return;
  if (!/\.txt$/i.test(f.name) && !(f.type || "").startsWith("text/")) {
    $("error").textContent = "Please upload a plain .txt file."; return;
  }
  const rd = new FileReader();
  rd.onload = () => {
    $("text").value = rd.result; updateCount(); switchTab("paste");
    $("fileName").textContent = "📄 " + f.name; $("error").textContent = ""; toast("File loaded");
  };
  rd.readAsText(f);
}
$("file").addEventListener("change", e => loadFile(e.target.files[0]));
const drop = $("drop");
["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => loadFile(e.dataTransfer.files[0]));
drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("file").click(); } });

/* ---------- history ---------- */
function getHistory() { try { return JSON.parse(localStorage.getItem("history") || "[]"); } catch (e) { return []; } }
function saveHistory(list) { try { localStorage.setItem("history", JSON.stringify(list)); } catch (e) {} }
function pushHistory(text, percent) {
  const list = getHistory().filter(h => h.text !== text);
  list.unshift({text, percent, time: Date.now()});
  saveHistory(list.slice(0, 5)); renderHistory();
}
function renderHistory() {
  const list = getHistory();
  $("history").innerHTML = list.length ? list.map((h, i) => `
    <li data-i="${i}" title="Click to load this text">
      <span class="h-score ${levelOf(h.percent)}">${h.percent}%</span>
      <span class="h-text">${esc(h.text.slice(0, 90))}</span>
    </li>`).join("") : `<li class="empty">No checks yet</li>`;
}
$("history").addEventListener("click", e => {
  const li = e.target.closest("li[data-i]"); if (!li) return;
  const item = getHistory()[li.dataset.i]; if (!item) return;
  switchTab("paste"); $("text").value = item.text; updateCount(); $("text").focus(); toast("Loaded from history");
});
$("clearHistory").addEventListener("click", () => { saveHistory([]); renderHistory(); });

/* ---------- run check ---------- */
async function runCheck() {
  $("error").textContent = "";
  if (!$("text").value.trim()) { $("error").textContent = "Please paste some text or upload a file first."; $("text").focus(); return; }
  const btn = $("check");
  btn.disabled = true; btn.classList.add("loading"); $("btnText").textContent = "Analysing…";
  $("results").classList.add("hidden"); $("skeleton").classList.remove("hidden");
  try {
    const res = await fetch(API + "/api/check", {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({text: $("text").value, reference: $("reference").value,
                            threshold: parseFloat($("threshold").value)})
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    lastResult = data;
    render(data);
    pushHistory($("text").value.trim(), data.overall_percent);
  } catch (e) {
    $("error").textContent = e.message === "Failed to fetch" ? "Cannot reach the server. Is app.py running?" : e.message;
  }
  $("skeleton").classList.add("hidden");
  btn.disabled = false; btn.classList.remove("loading"); $("btnText").textContent = "Check plagiarism";
}
$("check").addEventListener("click", runCheck);
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !$("check").disabled) { e.preventDefault(); runCheck(); }
});

/* ---------- render results ---------- */
function animateNumber(el, to) {
  const start = performance.now(), dur = 700;
  (function tick(now) {
    const p = Math.min(1, (now - start) / dur);
    el.textContent = (to * (1 - Math.pow(1 - p, 3))).toFixed(to % 1 ? 1 : 0) + "%";
    if (p < 1) requestAnimationFrame(tick); else el.textContent = to + "%";
  })(start);
}

function render(d) {
  const lvl = levelOf(d.overall_percent);
  $("results").classList.remove("hidden");
  const g = $("percent").parentElement;
  g.className = "gauge " + lvl;
  g.style.setProperty("--pct", d.overall_percent);
  animateNumber($("percent"), d.overall_percent);
  $("verdict").textContent = d.verdict;
  const tag = $("verdictTag");
  tag.className = "tag " + lvl;
  tag.textContent = lvl === "high" ? "High risk" : lvl === "mid" ? "Review needed" : "Looks good";
  $("stats").textContent = `${d.flagged_count} of ${d.sentence_count} sentences flagged · threshold ${d.threshold.toFixed(2)} · ${d.mode === "embeddings" ? "embeddings" : "TF-IDF"} mode`;

  const copied = d.results.filter(r => r.level === "copied").length;
  const para = d.results.filter(r => r.level === "paraphrased").length;
  $("sTotal").textContent = d.sentence_count;
  $("sCopied").textContent = copied;
  $("sPara").textContent = para;
  $("sOrig").textContent = d.sentence_count - copied - para;
  $("mCount").textContent = copied + para;

  activeFilter = "all";
  $$(".fchip").forEach(c => c.classList.toggle("active", c.dataset.filter === "all"));
  switchResultTab("text");
  renderBody();
  $("results").scrollIntoView({behavior: "smooth", block: "start"});
}

function renderBody() {
  const d = lastResult; if (!d) return;
  $("highlighted").innerHTML = d.results.map((r, i) => {
    const dim = activeFilter !== "all" && r.level !== activeFilter ? " dim" : "";
    const tip = r.level === "original" ? `Original · ${(r.score * 100).toFixed(0)}% similar`
                                       : `${r.level} · ${(r.score * 100).toFixed(0)}% similar — click for source`;
    return `<span class="${r.level}${dim}" data-i="${i}" title="${tip}">${esc(r.sentence)}</span>`;
  }).join(" ");

  const flagged = d.results.map((r, i) => ({r, i})).filter(x => x.r.level !== "original" &&
                  (activeFilter === "all" || x.r.level === activeFilter));
  $("matches").innerHTML = flagged.length ? flagged.map(({r, i}) => `
    <div class="match ${r.level}" id="match-${i}">
      <p><span class="lbl">Your text</span>${esc(r.sentence)}</p>
      <p><span class="lbl">Matched</span>${esc(r.matched)}</p>
      <div class="bar"><i style="width:${Math.min(100, r.score * 100).toFixed(0)}%"></i></div>
      <div class="meta"><span class="chip">📄 ${esc(r.source)}</span><span class="chip">${(r.score * 100).toFixed(1)}% similar</span><span class="chip">${r.level}</span></div>
    </div>`).join("") :
    `<div class="empty-state"><b>🎉</b>No ${activeFilter === "all" ? "" : activeFilter + " "}matches found.</div>`;
}

$("highlighted").addEventListener("click", e => {
  const sp = e.target.closest("span[data-i]"); if (!sp || sp.classList.contains("original")) return;
  switchResultTab("matches");
  activeFilter = "all"; $$(".fchip").forEach(c => c.classList.toggle("active", c.dataset.filter === "all"));
  renderBody();
  const card = $("match-" + sp.dataset.i);
  if (card) { card.scrollIntoView({behavior: "smooth", block: "center"}); card.classList.add("flash"); setTimeout(() => card.classList.remove("flash"), 1400); }
});

function switchResultTab(name) {
  $$("[data-rtab]").forEach(t => t.classList.toggle("active", t.dataset.rtab === name));
  $("rp-text").classList.toggle("hidden", name !== "text");
  $("rp-matches").classList.toggle("hidden", name !== "matches");
}
$$("[data-rtab]").forEach(t => t.addEventListener("click", () => switchResultTab(t.dataset.rtab)));
$$(".fchip").forEach(c => c.addEventListener("click", () => {
  activeFilter = c.dataset.filter;
  $$(".fchip").forEach(x => x.classList.toggle("active", x === c));
  renderBody();
}));

/* ---------- report ---------- */
function buildReport() {
  const d = lastResult; if (!d) return "";
  const lines = [
    "AI PLAGIARISM REPORT", "====================",
    `Similarity: ${d.overall_percent}%  (${d.verdict})`,
    `Sentences: ${d.sentence_count}   Flagged: ${d.flagged_count}   Threshold: ${d.threshold.toFixed(2)}   Mode: ${d.mode}`,
    ""
  ];
  d.results.filter(r => r.level !== "original").forEach((r, n) => {
    lines.push(`${n + 1}. [${r.level.toUpperCase()} ${(r.score * 100).toFixed(1)}%]`,
               `   Your text : ${r.sentence}`, `   Matched   : ${r.matched}`, `   Source    : ${r.source}`, "");
  });
  if (d.flagged_count === 0) lines.push("No matching sentences found.");
  return lines.join("\n");
}
$("copyReport").addEventListener("click", async () => {
  if (!lastResult) return;
  try { await navigator.clipboard.writeText(buildReport()); toast("Report copied to clipboard"); }
  catch (e) { toast("Copy failed – use Download instead"); }
});
$("downloadReport").addEventListener("click", () => {
  if (!lastResult) return;
  const url = URL.createObjectURL(new Blob([buildReport()], {type: "text/plain"}));
  const a = document.createElement("a");
  a.href = url; a.download = "plagiarism-report.txt"; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url); toast("Report downloaded");
});

renderHistory();
updateCount();
