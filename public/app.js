const nicheInput = document.getElementById("niche");
const topicInput = document.getElementById("topic");
const discoverBtn = document.getElementById("discoverBtn");
const discoverStatus = document.getElementById("discoverStatus");
const videoResults = document.getElementById("videoResults");
const pipelineCard = document.getElementById("pipelineCard");
const runBtn = document.getElementById("runBtn");
const stagesEl = document.getElementById("stages");

let discoveredVideos = [];

const STAGES = [
  { id: "trend", label: "Trend Scout", blurb: "Reading the niche for patterns, not properties" },
  { id: "concept", label: "Concept Architect", blurb: "Inventing original characters, world, premise" },
  { id: "script", label: "Episode Writer", blurb: "Drafting an original scene from the concept" },
  { id: "visual", label: "Visual Designer", blurb: "Writing original art-direction prompts" },
  { id: "qa", label: "Originality & Safety QA", blurb: "Flagging resemblance risk and pacing issues" },
];

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

discoverBtn.addEventListener("click", async () => {
  const niche = nicheInput.value.trim();
  if (!niche) return;

  discoverBtn.disabled = true;
  discoverStatus.textContent = "Searching YouTube...";
  videoResults.innerHTML = "";
  pipelineCard.hidden = true;
  stagesEl.innerHTML = "";

  try {
    const { videos } = await postJSON("/api/youtube/discover", { query: niche });
    discoveredVideos = videos || [];

    if (discoveredVideos.length === 0) {
      discoverStatus.textContent = "No videos found — try a different keyword.";
    } else {
      discoverStatus.textContent = `Found ${discoveredVideos.length} videos in this niche.`;
      videoResults.innerHTML = discoveredVideos
        .slice(0, 8)
        .map(
          (v) => `
          <div class="video-item">
            <div class="title">${escapeHTML(v.title)}</div>
            <div class="meta">${escapeHTML(v.channel)} · ${v.viewCount.toLocaleString()} views</div>
          </div>`
        )
        .join("");
      pipelineCard.hidden = false;
    }
  } catch (e) {
    discoverStatus.textContent = `Error: ${e.message}`;
  } finally {
    discoverBtn.disabled = false;
  }
});

runBtn.addEventListener("click", async () => {
  const niche = nicheInput.value.trim();
  const topic = topicInput.value.trim();
  if (!niche || !topic) return;

  runBtn.disabled = true;
  stagesEl.innerHTML = "";
  const ctx = {};

  for (const stage of STAGES) {
    renderStage(stage.id, "running");
    try {
      let result;
      if (stage.id === "trend") {
        result = await postJSON("/api/agent/trend", { niche, videos: discoveredVideos });
        ctx.trend = result.trendBrief;
        renderStage(stage.id, "done", result.trendBrief);
      } else if (stage.id === "concept") {
        result = await postJSON("/api/agent/concept", { niche, trendBrief: ctx.trend });
        ctx.concept = result.concept;
        renderStage(stage.id, "done", result.concept);
      } else if (stage.id === "script") {
        result = await postJSON("/api/agent/script", { concept: ctx.concept, topic });
        ctx.script = result.script;
        renderStage(stage.id, "done", result.script);
      } else if (stage.id === "visual") {
        result = await postJSON("/api/agent/visual", { concept: ctx.concept });
        ctx.visual = result.visual;
        renderStage(stage.id, "done", result.visual);
      } else if (stage.id === "qa") {
        result = await postJSON("/api/agent/qa", {
          concept: ctx.concept,
          script: ctx.script,
          visual: ctx.visual,
        });
        renderStage(stage.id, "done", result.raw, result.parsed);
      }
    } catch (e) {
      renderStage(stage.id, "error", e.message);
      break;
    }
  }

  runBtn.disabled = false;
});

function renderStage(id, status, content, parsed) {
  const meta = STAGES.find((s) => s.id === id);
  let el = document.getElementById(`stage-${id}`);

  if (!el) {
    el = document.createElement("div");
    el.className = "stage";
    el.id = `stage-${id}`;
    el.innerHTML = `
      <div class="stage-dot" id="dot-${id}"></div>
      <div class="stage-head" id="head-${id}">
        <div>
          <div class="label">${meta.label}</div>
          <div class="blurb">${meta.blurb}</div>
        </div>
      </div>
      <div class="stage-body" id="body-${id}" hidden></div>
    `;
    stagesEl.appendChild(el);
    document
      .getElementById(`head-${id}`)
      .addEventListener("click", () => {
        const body = document.getElementById(`body-${id}`);
        body.hidden = !body.hidden;
      });
  }

  document.getElementById(`dot-${id}`).className = `stage-dot ${status}`;

  if (content !== undefined) {
    const body = document.getElementById(`body-${id}`);
    body.hidden = false;

    if (id === "qa" && parsed) {
      const badgeClass = parsed.approved ? "approved" : "flagged";
      const badgeText = parsed.approved ? "Approved" : "Needs revision";
      body.innerHTML = `
        <div class="badge ${badgeClass}">${badgeText} · risk: ${escapeHTML(parsed.originality_risk || "n/a")}</div>
        <p>${escapeHTML(parsed.safety_notes || "")}</p>
        ${
          parsed.required_changes && parsed.required_changes.length
            ? `<ul>${parsed.required_changes.map((c) => `<li>${escapeHTML(c)}</li>`).join("")}</ul>`
            : ""
        }
      `;
    } else {
      body.textContent = content;
    }
  }
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
