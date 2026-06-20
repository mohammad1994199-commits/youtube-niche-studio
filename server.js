import express from "express";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const YT_KEY = process.env.YOUTUBE_API_KEY;
const MODEL = "claude-sonnet-4-6";

// ---------------------------------------------------------------------------
// YouTube discovery — pulls real metadata (titles, channels, view counts) for
// a niche keyword. This is used downstream only to extract GENERAL patterns,
// never to copy a specific title, channel, or character.
// ---------------------------------------------------------------------------
app.post("/api/youtube/discover", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "query is required" });
    if (!YT_KEY) return res.status(500).json({ error: "YOUTUBE_API_KEY is not set on the server" });

    const searchUrl =
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=15` +
      `&order=viewCount&safeSearch=strict&q=${encodeURIComponent(query + " kids")}&key=${YT_KEY}`;

    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    if (searchData.error) throw new Error(searchData.error.message);

    const ids = (searchData.items || []).map((i) => i.id.videoId).filter(Boolean);
    if (ids.length === 0) return res.json({ videos: [] });

    const statsUrl =
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails` +
      `&id=${ids.join(",")}&key=${YT_KEY}`;
    const statsRes = await fetch(statsUrl);
    const statsData = await statsRes.json();
    if (statsData.error) throw new Error(statsData.error.message);

    const videos = (statsData.items || [])
      .map((v) => ({
        title: v.snippet.title,
        channel: v.snippet.channelTitle,
        publishedAt: v.snippet.publishedAt,
        viewCount: Number(v.statistics?.viewCount || 0),
        duration: v.contentDetails?.duration || "",
        description: (v.snippet.description || "").slice(0, 200),
      }))
      .sort((a, b) => b.viewCount - a.viewCount);

    res.json({ videos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// Generic Claude call helper
// ---------------------------------------------------------------------------
async function callClaude(system, user, maxTokens = 1200) {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n\n");
}

// ---- Agent 1: Trend Scout (reads the YouTube data, extracts patterns only) ----
app.post("/api/agent/trend", async (req, res) => {
  try {
    const { niche, videos } = req.body;
    const summary = (videos || [])
      .slice(0, 12)
      .map((v) => `- "${v.title}" by ${v.channel} (${v.viewCount.toLocaleString()} views)`)
      .join("\n");

    const system =
      "You are a Trend Scout Agent. You're given real YouTube metadata (titles, channels, view " +
      "counts) for a children's content niche. Extract GENERAL structural patterns only — pacing, " +
      "themes, episode style, what drives views. Never suggest copying a specific title, channel " +
      "name, or character. Output a pattern summary only.";
    const user =
      `Niche: ${niche}\n\nTop videos found:\n${summary}\n\n` +
      "Summarize the patterns behind what's working here in under 200 words. Patterns only — no " +
      "specific titles to copy.";

    const trendBrief = await callClaude(system, user);
    res.json({ trendBrief });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Agent 2: Concept Architect ----
app.post("/api/agent/concept", async (req, res) => {
  try {
    const { niche, trendBrief } = req.body;
    const system =
      "You are a Concept Architect Agent. Invent wholly original children's content concepts. " +
      "Never reuse or closely imitate existing character names, titles, or distinctive IP elements.";
    const user =
      `Niche: ${niche}\n\nTrend brief:\n${trendBrief}\n\n` +
      "In under 200 words, invent an original concept: character names & personalities, setting, " +
      "premise, tone. Must be clearly distinct from existing media.";
    const concept = await callClaude(system, user);
    res.json({ concept });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Agent 3: Episode Writer ----
app.post("/api/agent/script", async (req, res) => {
  try {
    const { concept, topic } = req.body;
    const system =
      "You are an Episode Writer Agent. Write fully original material — no copied lyrics, " +
      "dialogue, or parody of existing songs/shows.";
    const user =
      `Concept:\n${concept}\n\nWrite a short original scene (under 300 words) about: ${topic}. ` +
      "Include scene direction and dialogue.";
    const script = await callClaude(system, user, 1500);
    res.json({ script });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Agent 4: Visual Designer ----
app.post("/api/agent/visual", async (req, res) => {
  try {
    const { concept } = req.body;
    const system =
      "You are a Visual Design Agent. Write original art-style descriptions and image-generation " +
      "prompts. Designs must be clearly distinct from existing copyrighted character designs.";
    const user =
      `Concept:\n${concept}\n\nIn under 200 words, describe the visual style and give an ` +
      "image-generation prompt for each main character and the key setting.";
    const visual = await callClaude(system, user);
    res.json({ visual });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Agent 5: Originality & Safety QA ----
app.post("/api/agent/qa", async (req, res) => {
  try {
    const { concept, script, visual } = req.body;
    const system =
      "You are an Originality & Safety QA Agent. Review for (1) resemblance risk to existing " +
      "copyrighted/trademarked characters or shows, (2) age-appropriateness and healthy pacing. " +
      'Respond ONLY with JSON: {"originality_risk":"low|medium|high","safety_notes":"...",' +
      '"approved":true|false,"required_changes":["..."]}';
    const user = `CONCEPT:\n${concept}\n\nSCRIPT:\n${script}\n\nVISUAL BRIEF:\n${visual}`;
    const raw = await callClaude(system, user, 800);
    let parsed = null;
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      // leave parsed as null; frontend falls back to raw text
    }
    res.json({ raw, parsed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Original Content Studio running on http://localhost:${PORT}`));
