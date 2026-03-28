// ============================================================
// InteractIQ API — Vercel Serverless Function
// File: api/analyse.js
// ============================================================

const Anthropic = require("@anthropic-ai/sdk");

// ── Interaction mapping (server-side copy, no ES module imports) ──
const INTERACTION_MAP = {
  concept: {
    low: { primary: "Flashcard / Flip card", alternative: "True/False + Justification" },
    medium: { primary: "Multiple Choice Question (MCQ)", alternative: "Hotspot (click to reveal)" },
    high: { primary: "Hotspot (click to reveal)", alternative: "Case Study + Reflection" }
  },
  process: {
    low: { primary: "Sequence / Ordering", alternative: "Fill in the Blank" },
    medium: { primary: "Guided Walkthrough / Simulation", alternative: "Sequence / Ordering" },
    high: { primary: "Simulation / Guided walkthrough", alternative: "Scenario + Decision Branch" }
  },
  decision: {
    low: { primary: "True/False + Justification", alternative: "Multiple Choice Question (MCQ)" },
    medium: { primary: "Scenario + Decision Branch", alternative: "Case Study + Reflection" },
    high: { primary: "Case Study + Reflection", alternative: "Scenario + Decision Branch" }
  },
  comparison: {
    low: { primary: "Drag and Drop (matching)", alternative: "True/False + Justification" },
    medium: { primary: "Hotspot (click to reveal)", alternative: "Drag and Drop (matching)" },
    high: { primary: "Case Study + Reflection", alternative: "Hotspot (click to reveal)" }
  },
  principle: {
    low: { primary: "Multiple Choice Question (MCQ)", alternative: "Flashcard / Flip card" },
    medium: { primary: "Scenario + Decision Branch", alternative: "Multiple Choice Question (MCQ)" },
    high: { primary: "Case Study + Reflection", alternative: "Scenario + Decision Branch" }
  },
  troubleshooting: {
    low: { primary: "Sequence / Ordering", alternative: "Multiple Choice Question (MCQ)" },
    medium: { primary: "Scenario + Decision Branch", alternative: "Guided Walkthrough / Simulation" },
    high: { primary: "Simulation / Guided walkthrough", alternative: "Case Study + Reflection" }
  },
  compliance: {
    low: { primary: "Multiple Choice Question (MCQ)", alternative: "True/False + Justification" },
    medium: { primary: "Scenario + Decision Branch", alternative: "Multiple Choice Question (MCQ)" },
    high: { primary: "Simulation / Guided walkthrough", alternative: "Scenario + Decision Branch" }
  },
  soft_skill: {
    low: { primary: "True/False + Justification", alternative: "Flashcard / Flip card" },
    medium: { primary: "Scenario + Decision Branch", alternative: "Case Study + Reflection" },
    high: { primary: "Case Study + Reflection", alternative: "Simulation / Guided walkthrough" }
  }
};

function getMappedInteraction(contentType, complexity) {
  const type = (contentType || "concept").toLowerCase().replace(/\s+/g, "_");
  const comp = (complexity || "medium").toLowerCase();
  const typeKey = INTERACTION_MAP[type] ? type : "concept";
  const compKey = ["low", "medium", "high"].includes(comp) ? comp : "medium";
  let mapped = { ...INTERACTION_MAP[typeKey][compKey] };

  // Hard constraints
  if (typeKey === "compliance") {
    const allowed = ["Multiple Choice Question (MCQ)", "Scenario + Decision Branch", "Simulation / Guided walkthrough"];
    if (!allowed.includes(mapped.primary)) {
      mapped.primary = "Scenario + Decision Branch";
      mapped.alternative = "Multiple Choice Question (MCQ)";
    }
  }
  if (typeKey === "soft_skill") {
    const softAllowed = ["Scenario + Decision Branch", "Case Study + Reflection", "Simulation / Guided walkthrough", "True/False + Justification"];
    if (!softAllowed.includes(mapped.primary)) mapped.primary = "Scenario + Decision Branch";
  }
  if (typeKey === "process" && mapped.primary === "Flashcard / Flip card") {
    mapped.primary = "Sequence / Ordering";
    mapped.alternative = "Guided Walkthrough / Simulation";
  }
  if (comp === "low") {
    const overComplex = ["Case Study + Reflection", "Simulation / Guided walkthrough"];
    if (overComplex.includes(mapped.primary)) {
      mapped.primary = INTERACTION_MAP[typeKey].low.primary;
      mapped.alternative = INTERACTION_MAP[typeKey].low.alternative;
    }
  }
  return mapped;
}

// ── Prompt 1: Classification ──
function buildClassificationPrompt(text) {
  return `You are an expert eLearning instructional design classifier.

Analyse the following learning content and classify it precisely.

CONTENT:
"""
${text}
"""

Return ONLY valid JSON. No explanation, no markdown, no preamble, no trailing text.

{
  "primary_type": "<exactly one of: concept | process | decision | comparison | principle | troubleshooting | compliance | soft_skill>",
  "secondary_type": "<same list or null>",
  "confidence": <number between 0.0 and 1.0>,
  "complexity": "<exactly one of: low | medium | high>",
  "word_count": <integer>,
  "bloom_level": "<exactly one of: remember | understand | apply | analyse | evaluate | create>",
  "contains_steps": <true or false>,
  "contains_scenario": <true or false>,
  "contains_comparison": <true or false>,
  "key_signals": ["<2-3 short phrases from content that drove classification>"]
}`;
}

// ── Prompt 2: Recommendation ──
function buildRecommendationPrompt(text, classification, primaryInteraction, alternativeInteraction) {
  return `You are an expert eLearning instructional designer with 15 years of experience.

Given this learning content and its classification, write a precise recommendation.

CONTENT: """${text}"""

CLASSIFICATION:
- Content type: ${classification.primary_type}${classification.secondary_type ? ` (also contains: ${classification.secondary_type})` : ""}
- Complexity: ${classification.complexity}
- Bloom's level: ${classification.bloom_level}
- Contains steps: ${classification.contains_steps}
- Contains scenario: ${classification.contains_scenario}

RULE ENGINE DECISION:
- Primary interaction: ${primaryInteraction}
- Alternative interaction: ${alternativeInteraction}

Write your recommendation following these STRICT rules:
1. why_this_works: EXACTLY 40-60 words. MUST reference the specific content type and the learning need it serves. NO generic phrases like "this is engaging" or "learners will enjoy".
2. why_not_alternative: EXACTLY 25-40 words. Explain specifically why ${alternativeInteraction} is second-best for THIS content. Be concrete.
3. starter_example: EXACTLY 50-80 words. Must include: an action verb, a simulated content fragment drawn from the actual content above, and the expected learner response or action.
4. author_tip: ONE practical sentence (max 20 words) for building this interaction in any eLearning authoring tool.
5. Do NOT mention the word "AI" anywhere in your response.
6. Do NOT use phrases like "this content", "the content", "this material".

Return ONLY valid JSON. No markdown, no preamble:

{
  "why_this_works": "...",
  "why_not_alternative": "...",
  "starter_example": "...",
  "author_tip": "..."
}`;
}

// ── Input validation (server-side) ──
function validateInput(text) {
  if (!text || typeof text !== "string") return { valid: false, error: "No content provided." };
  const trimmed = text.trim();
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount < 15) return { valid: false, error: "Content too short. Please provide at least 15 words." };
  if (wordCount > 400) return { valid: false, error: `Content too long (${wordCount} words). Please keep under 400 words.` };
  const codePatterns = /(\{|\}|=>|const |var |function |SELECT |FROM )/g;
  if ((trimmed.match(codePatterns) || []).length > 4) return { valid: false, error: "This looks like code, not learning content. Please paste a learning concept or scenario." };
  return { valid: true };
}

// ── Safe JSON parse ──
function safeParseJSON(text) {
  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    // Try to extract JSON object from text
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { return null; }
    }
    return null;
  }
}

// ── Main handler ──
module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { content } = req.body || {};

  // Validate input
  const validation = validateInput(content);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  // Initialize Anthropic client
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    // ── CALL 1: Classification ──
    const classifyResponse = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: buildClassificationPrompt(content) }]
    });

    const classificationRaw = classifyResponse.content[0]?.text || "";
    const classification = safeParseJSON(classificationRaw);

    if (!classification) {
      return res.status(500).json({ error: "Classification failed. Please try again." });
    }

    // Sanitise classification values
    const validTypes = ["concept", "process", "decision", "comparison", "principle", "troubleshooting", "compliance", "soft_skill"];
    const validComplexity = ["low", "medium", "high"];
    if (!validTypes.includes(classification.primary_type)) classification.primary_type = "concept";
    if (!validComplexity.includes(classification.complexity)) classification.complexity = "medium";

    // ── RULE ENGINE: Map to interaction ──
    const mapped = getMappedInteraction(classification.primary_type, classification.complexity);

    // Confidence gate — if low confidence, note it
    const confidence = parseFloat(classification.confidence) || 0.7;
    let confidenceLabel, confidenceColor;
    if (confidence >= 0.85) { confidenceLabel = "Strong recommendation"; confidenceColor = "#2D9B5A"; }
    else if (confidence >= 0.70) { confidenceLabel = "Good fit"; confidenceColor = "#E8872A"; }
    else if (confidence >= 0.60) { confidenceLabel = "Review alternatives"; confidenceColor = "#E8872A"; }
    else { confidenceLabel = "Mixed signals"; confidenceColor = "#E63946"; }

    // ── CALL 2: Recommendation ──
    const recommendResponse = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 600,
      messages: [{ role: "user", content: buildRecommendationPrompt(content, classification, mapped.primary, mapped.alternative) }]
    });

    const recommendationRaw = recommendResponse.content[0]?.text || "";
    const recommendation = safeParseJSON(recommendationRaw);

    if (!recommendation) {
      return res.status(500).json({ error: "Recommendation generation failed. Please try again." });
    }

    // ── Compose final response ──
    const TYPE_LABELS = {
      concept: "Concept", process: "Process", decision: "Decision / Judgment",
      comparison: "Comparison", principle: "Principle / Rule",
      troubleshooting: "Troubleshooting", compliance: "Compliance", soft_skill: "Soft Skill"
    };

    const BLOOMS_LABELS = {
      remember: "Remember", understand: "Understand", apply: "Apply",
      analyse: "Analyse", evaluate: "Evaluate", create: "Create"
    };

    const BLOOMS_COLORS = {
      remember: "#68788e", understand: "#4A5D79", apply: "#1D3557",
      analyse: "#E8872A", evaluate: "#E63946", create: "#2D9B5A"
    };

    return res.status(200).json({
      classification: {
        primaryType: classification.primary_type,
        primaryTypeLabel: TYPE_LABELS[classification.primary_type] || classification.primary_type,
        secondaryType: classification.secondary_type,
        secondaryTypeLabel: classification.secondary_type ? TYPE_LABELS[classification.secondary_type] : null,
        complexity: classification.complexity,
        bloomLevel: classification.bloom_level || "understand",
        bloomLabel: BLOOMS_LABELS[classification.bloom_level] || "Understand",
        bloomColor: BLOOMS_COLORS[classification.bloom_level] || "#4A5D79",
        wordCount: classification.word_count || content.trim().split(/\s+/).length,
        confidence: confidence,
        confidenceLabel,
        confidenceColor,
        keySignals: classification.key_signals || []
      },
      recommendation: {
        primaryInteraction: mapped.primary,
        alternativeInteraction: mapped.alternative,
        whyThisWorks: recommendation.why_this_works,
        whyNotAlternative: recommendation.why_not_alternative,
        starterExample: recommendation.starter_example,
        authorTip: recommendation.author_tip
      }
    });

  } catch (err) {
    console.error("InteractIQ API error:", err);
    if (err.status === 401) return res.status(500).json({ error: "API key invalid. Please check your Anthropic API key." });
    if (err.status === 429) return res.status(500).json({ error: "Rate limit reached. Please wait a moment and try again." });
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
};
