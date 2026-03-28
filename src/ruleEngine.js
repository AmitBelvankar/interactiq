// ============================================================
// InteractIQ Rule Engine
// Core IP: deterministic mapping + guardrails
// ============================================================

// ── 2D Mapping Table: contentType × complexity → interaction ──
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

// ── Bloom's Verb Dictionary ──
const BLOOMS_VERBS = {
  remember: ["define", "list", "recall", "recognise", "identify", "name", "state", "memorise"],
  understand: ["explain", "describe", "summarise", "interpret", "classify", "compare", "paraphrase"],
  apply: ["use", "demonstrate", "solve", "execute", "implement", "perform", "apply", "complete"],
  analyse: ["differentiate", "organise", "attribute", "examine", "break down", "distinguish", "investigate"],
  evaluate: ["judge", "justify", "critique", "assess", "recommend", "prioritise", "defend", "evaluate"],
  create: ["design", "construct", "develop", "formulate", "produce", "compose", "build", "create"]
};

// ── GUARDRAIL LAYER 1: Input Validation ──
export function validateInput(text) {
  const wordCount = text.trim().split(/\s+/).length;

  if (!text || text.trim().length < 10) {
    return { valid: false, error: "Please enter some learning content to analyse." };
  }
  if (wordCount < 15) {
    return { valid: false, error: "Content too short to analyse. Please provide at least one full sentence or concept (minimum 15 words)." };
  }
  if (wordCount > 400) {
    return { valid: false, error: `Content too long (${wordCount} words). For best results, paste a single concept, process, or scenario under 400 words. Consider breaking longer content into smaller units.` };
  }

  // Check for non-learning content (code blocks, JSON, etc.)
  const codePatterns = /(\{|\}|\[|\]|=>|const |var |function |SELECT |FROM |import |export )/g;
  const codeMatches = (text.match(codePatterns) || []).length;
  if (codeMatches > 4) {
    return { valid: false, error: "This appears to be code or structured data. Please paste the learning content description instead." };
  }

  return { valid: true, wordCount };
}

// ── GUARDRAIL LAYER 2: Complexity Scoring ──
export function scoreComplexity(text) {
  const words = text.trim().split(/\s+/);
  const wordCount = words.length;

  // Average sentence length
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgSentenceLength = wordCount / Math.max(sentences.length, 1);

  // Technical vocabulary density (words > 8 chars)
  const longWords = words.filter(w => w.replace(/[^a-zA-Z]/g, "").length > 8).length;
  const techDensity = longWords / wordCount;

  // Concept density (conjunctions and connectors signal complexity)
  const complexConnectors = ["however", "therefore", "furthermore", "alternatively", "conversely", "whereas", "consequently", "nevertheless", "subsequently"];
  const connectorCount = complexConnectors.filter(c => text.toLowerCase().includes(c)).length;

  // Score calculation
  let score = 0;
  if (avgSentenceLength > 20) score += 30;
  else if (avgSentenceLength > 15) score += 15;

  if (techDensity > 0.25) score += 35;
  else if (techDensity > 0.15) score += 20;

  if (wordCount > 150) score += 20;
  else if (wordCount > 80) score += 10;

  score += Math.min(connectorCount * 5, 15);

  if (score >= 55) return "high";
  if (score >= 25) return "medium";
  return "low";
}

// ── GUARDRAIL LAYER 3: Bloom's Level Detection ──
export function detectBlooms(text) {
  const lowerText = text.toLowerCase();
  const detected = {};

  for (const [level, verbs] of Object.entries(BLOOMS_VERBS)) {
    const matches = verbs.filter(v => lowerText.includes(v));
    if (matches.length > 0) detected[level] = matches.length;
  }

  if (Object.keys(detected).length === 0) return "understand"; // default

  // Return highest detected level
  const levelOrder = ["create", "evaluate", "analyse", "apply", "understand", "remember"];
  for (const level of levelOrder) {
    if (detected[level]) return level;
  }
  return "understand";
}

// ── GUARDRAIL LAYER 4: Hard Constraint Rules ──
function applyHardConstraints(contentType, complexity, mapped) {
  // Compliance content must include MCQ or Scenario
  if (contentType === "compliance") {
    const allowed = ["Multiple Choice Question (MCQ)", "Scenario + Decision Branch", "Simulation / Guided walkthrough"];
    if (!allowed.includes(mapped.primary)) {
      mapped.primary = "Scenario + Decision Branch";
      mapped.alternative = "Multiple Choice Question (MCQ)";
    }
  }

  // Soft skill must include Scenario
  if (contentType === "soft_skill") {
    const allowed = ["Scenario + Decision Branch", "Case Study + Reflection", "Simulation / Guided walkthrough", "True/False + Justification"];
    if (!allowed.includes(mapped.primary)) {
      mapped.primary = "Scenario + Decision Branch";
    }
  }

  // Process content cannot be Flashcard only
  if (contentType === "process" && mapped.primary === "Flashcard / Flip card") {
    mapped.primary = "Sequence / Ordering";
    mapped.alternative = "Guided Walkthrough / Simulation";
  }

  // No over-engineering simple content
  if (complexity === "low") {
    const complex = ["Case Study + Reflection", "Simulation / Guided walkthrough"];
    if (complex.includes(mapped.primary)) {
      mapped.primary = INTERACTION_MAP[contentType].low.primary;
      mapped.alternative = INTERACTION_MAP[contentType].low.alternative;
    }
  }

  return mapped;
}

// ── MAIN: Get Mapped Interaction ──
export function getMappedInteraction(contentType, complexity) {
  const type = contentType?.toLowerCase().replace(" ", "_") || "concept";
  const comp = complexity?.toLowerCase() || "medium";

  const typeKey = INTERACTION_MAP[type] ? type : "concept";
  const compKey = ["low", "medium", "high"].includes(comp) ? comp : "medium";

  let mapped = { ...INTERACTION_MAP[typeKey][compKey] };
  mapped = applyHardConstraints(typeKey, compKey, mapped);

  return mapped;
}

// ── GUARDRAIL LAYER 5: Confidence Gate ──
export function evaluateConfidence(confidence) {
  const score = parseFloat(confidence) || 0;
  if (score >= 0.85) return { label: "Strong recommendation", color: "#2D9B5A" };
  if (score >= 0.70) return { label: "Good fit — consider context", color: "#E8872A" };
  if (score >= 0.60) return { label: "Reasonable — review alternatives", color: "#E8872A" };
  return { label: "Mixed signals — see both options", color: "#E63946" };
}

// ── VALID CONTENT TYPES ──
export const VALID_TYPES = [
  "concept", "process", "decision", "comparison",
  "principle", "troubleshooting", "compliance", "soft_skill"
];

export const TYPE_LABELS = {
  concept: "Concept",
  process: "Process",
  decision: "Decision / Judgment",
  comparison: "Comparison",
  principle: "Principle / Rule",
  troubleshooting: "Troubleshooting",
  compliance: "Compliance",
  soft_skill: "Soft Skill"
};

export const BLOOMS_LABELS = {
  remember: "Remember",
  understand: "Understand",
  apply: "Apply",
  analyse: "Analyse",
  evaluate: "Evaluate",
  create: "Create"
};

export const BLOOMS_COLORS = {
  remember: "#68788e",
  understand: "#4A5D79",
  apply: "#1D3557",
  analyse: "#E8872A",
  evaluate: "#E63946",
  create: "#2D9B5A"
};
