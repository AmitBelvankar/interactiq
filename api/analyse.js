// ============================================================
// InteractIQ API — Vercel Serverless Function
// File: api/analyse.js
// v1.1 — Cognitive complexity scoring fix
// ============================================================

const Anthropic = require("@anthropic-ai/sdk");

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

// ── Pre-compute cognitive complexity signals ──
function computeCognitiveSignals(text) {
  return {
    branchCount: (text.match(/\bif\b|\belse if\b|\bwhether\b|\balternatively\b|\botherwise\b/gi) || []).length,
    consequenceCount: (text.match(/\bmust\b|\bshould\b|\brequired\b|\bapologise\b|\bapologize\b|\bcompensate\b|\brefund\b|\breplace\b|\bdocument\b|\bpenalt|\bescalat|\bdisciplin|\bliab/gi) || []).length,
    stakeholderCount: (text.match(/\bcustomer\b|\bmanager\b|\bclient\b|\bteam\b|\bemployee\b|\blearner\b|\buser\b|\bstudent\b|\bpatient\b|\bpartner\b/gi) || []).length,
    judgmentCount: (text.match(/\bassess\b|\bevaluate\b|\bdetermine\b|\bdecide\b|\bconsider\b|\bjudge\b|\bprioritis|\bprioritiz/gi) || []).length,
    interpersonalCount: (text.match(/\bfeel\b|\bempath|\bsensitiv|\brespect\b|\bpatiently\b|\bfoolish\b|\bdignit|\bcomfort\b|\bembarras/gi) || []).length,
    wordCount: text.trim().split(/\s+/).length
  };
}

// ── Deterministic complexity override ──
function applyComplexityOverride(llmComplexity, signals) {
  const { branchCount, consequenceCount, judgmentCount, interpersonalCount, wordCount } = signals;
  const isDefinitelyHigh = (
    branchCount >= 3 ||
    (branchCount >= 2 && consequenceCount >= 3) ||
    (judgmentCount >= 2 && consequenceCount >= 3) ||
    (interpersonalCount >= 2 && branchCount >= 2)
  );
  const isDefinitelyLow = (
    wordCount < 25 && branchCount === 0 && consequenceCount === 0 && judgmentCount === 0
  );
  if (isDefinitelyHigh && llmComplexity !== "high") return "high";
  if (isDefinitelyLow && llmComplexity === "high") return "low";
  return llmComplexity;
}

function getMappedInteraction(contentType, complexity) {
  const type = (contentType || "concept").toLowerCase().replace(/\s+/g, "_");
  const comp = (complexity || "medium").toLowerCase();
  const typeKey = INTERACTION_MAP[type] ? type : "concept";
  const compKey = ["low", "medium", "high"].includes(comp) ? comp : "medium";
  let mapped = { ...INTERACTION_MAP[typeKey][compKey] };
  if (typeKey === "compliance") {
    const allowed = ["Multiple Choice Question (MCQ)", "Scenario + Decision Branch", "Simulation / Guided walkthrough"];
    if (!allowed.includes(mapped.primary)) { mapped.primary = "Scenario + Decision Branch"; mapped.alternative = "Multiple Choice Question (MCQ)"; }
  }
  if (typeKey === "soft_skill") {
    const softAllowed = ["Scenario + Decision Branch", "Case Study + Reflection", "Simulation / Guided walkthrough", "True/False + Justification"];
    if (!softAllowed.includes(mapped.primary)) mapped.primary = "Scenario + Decision Branch";
  }
  if (typeKey === "process" && mapped.primary === "Flashcard / Flip card") {
    mapped.primary = "Sequence / Ordering"; mapped.alternative = "Guided Walkthrough / Simulation";
  }
  if (comp === "low") {
    const overComplex = ["Case Study + Reflection", "Simulation / Guided walkthrough"];
    if (overComplex.includes(mapped.primary)) { mapped.primary = INTERACTION_MAP[typeKey].low.primary; mapped.alternative = INTERACTION_MAP[typeKey].low.alternative; }
  }
  return mapped;
}

// ── Prompt 1: Classification with cognitive signals ──
function buildClassificationPrompt(text, signals) {
  const { branchCount, consequenceCount, judgmentCount, interpersonalCount, stakeholderCount } = signals;
  const hints = [];
  if (branchCount >= 3) hints.push(`- ${branchCount} conditional branches (if/whether/else) → strong HIGH complexity signal`);
  else if (branchCount === 2) hints.push(`- 2 conditional branches → medium-HIGH signal`);
  else if (branchCount === 1) hints.push(`- 1 conditional branch detected`);
  if (consequenceCount >= 3) hints.push(`- ${consequenceCount} consequence words (must/apologise/refund/document) → HIGH signal`);
  else if (consequenceCount > 0) hints.push(`- ${consequenceCount} consequence word(s) detected`);
  if (judgmentCount >= 2) hints.push(`- ${judgmentCount} judgment verbs (assess/evaluate/determine) → HIGH signal`);
  if (interpersonalCount >= 2) hints.push(`- ${interpersonalCount} interpersonal/emotional signals → HIGH signal`);
  if (stakeholderCount >= 2) hints.push(`- ${stakeholderCount} stakeholders mentioned`);
  if (hints.length === 0) hints.push(`- No strong complexity signals — assess from content structure`);

  return `You are an expert eLearning instructional design classifier.

Analyse the following learning content and classify it precisely.

CONTENT:
"""
${text}
"""

PRE-COMPUTED COGNITIVE SIGNALS (use these to inform your complexity rating):
${hints.join("\n")}

IMPORTANT: Assess COGNITIVE complexity, not surface complexity.
Do NOT judge complexity by vocabulary difficulty or sentence length alone.
Judge by: branching depth, judgment required, consequence weight, context-dependency.

COMPLEXITY DEFINITIONS:
- LOW: Single concept or fact. Linear flow. No judgment needed. Learner just recalls or recognises.
- MEDIUM: 2-3 related concepts. Some steps. Basic application. Mild conditional logic.
- HIGH: Judgment required. Multiple competing branches. Consequences of wrong choice are significant. Context-dependent decisions. Multiple stakeholders affected. No single right answer without reading context.

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

function safeParseJSON(text) {
  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch { return null; } }
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { content } = req.body || {};
  const validation = validateInput(content);
  if (!validation.valid) return res.status(400).json({ error: validation.error });

  // Pre-compute cognitive signals before any API call
  const signals = computeCognitiveSignals(content);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    // CALL 1: Classification with cognitive signals injected into prompt
    const classifyResponse = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: buildClassificationPrompt(content, signals) }]
    });

    const classification = safeParseJSON(classifyResponse.content[0]?.text || "");
    if (!classification) return res.status(500).json({ error: "Classification failed. Please try again." });

    const validTypes = ["concept", "process", "decision", "comparison", "principle", "troubleshooting", "compliance", "soft_skill"];
    const validComplexity = ["low", "medium", "high"];
    if (!validTypes.includes(classification.primary_type)) classification.primary_type = "concept";
    if (!validComplexity.includes(classification.complexity)) classification.complexity = "medium";

    // Apply deterministic complexity override — catches cognitive complexity the LLM misses
    const originalComplexity = classification.complexity;
    classification.complexity = applyComplexityOverride(classification.complexity, signals);
    if (classification.complexity !== originalComplexity) {
      if (!classification.key_signals) classification.key_signals = [];
      classification.key_signals.push(`Complexity corrected ${originalComplexity}→${classification.complexity}: ${signals.branchCount} branches, ${signals.consequenceCount} consequence signals`);
    }

    const mapped = getMappedInteraction(classification.primary_type, classification.complexity);

    const confidence = parseFloat(classification.confidence) || 0.7;
    let confidenceLabel, confidenceColor;
    if (confidence >= 0.85) { confidenceLabel = "Strong recommendation"; confidenceColor = "#2D9B5A"; }
    else if (confidence >= 0.70) { confidenceLabel = "Good fit"; confidenceColor = "#E8872A"; }
    else if (confidence >= 0.60) { confidenceLabel = "Review alternatives"; confidenceColor = "#E8872A"; }
    else { confidenceLabel = "Mixed signals"; confidenceColor = "#E63946"; }

    // CALL 2: Recommendation
    const recommendResponse = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 600,
      messages: [{ role: "user", content: buildRecommendationPrompt(content, classification, mapped.primary, mapped.alternative) }]
    });

    const recommendation = safeParseJSON(recommendResponse.content[0]?.text || "");
    if (!recommendation) return res.status(500).json({ error: "Recommendation generation failed. Please try again." });

    const TYPE_LABELS = { concept: "Concept", process: "Process", decision: "Decision / Judgment", comparison: "Comparison", principle: "Principle / Rule", troubleshooting: "Troubleshooting", compliance: "Compliance", soft_skill: "Soft Skill" };
    const BLOOMS_LABELS = { remember: "Remember", understand: "Understand", apply: "Apply", analyse: "Analyse", evaluate: "Evaluate", create: "Create" };
    const BLOOMS_COLORS = { remember: "#68788e", understand: "#4A5D79", apply: "#1D3557", analyse: "#E8872A", evaluate: "#E63946", create: "#2D9B5A" };

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
        confidence, confidenceLabel, confidenceColor,
        keySignals: classification.key_signals || [],
        cognitiveSignals: {
          branches: signals.branchCount,
          consequences: signals.consequenceCount,
          judgmentVerbs: signals.judgmentCount,
          interpersonal: signals.interpersonalCount
        }
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
