import React, { useState } from "react";
import "./App.css";

const EXAMPLE_CONTENT = [
  {
    label: "Process example",
    text: "To submit an expense report, log in to the company portal and click 'New Expense'. Enter the date, amount, and category for each item. Attach a photo of each receipt. Add a brief description explaining the business purpose. Submit for manager approval. You will receive an email confirmation once approved or if changes are required."
  },
  {
    label: "Decision example",
    text: "When a customer escalates a complaint, you must first assess whether the issue is a product defect, a service failure, or a misunderstanding. If it is a defect, log it and offer a replacement or refund. If it is a service failure, apologise directly and offer compensation. If it is a misunderstanding, walk the customer through the correct process patiently. In all cases, document the interaction before closing the ticket."
  },
  {
    label: "Compliance example",
    text: "All employees must complete mandatory data privacy training before accessing customer records. Sharing customer data with third parties without written consent is a violation of GDPR and will result in immediate disciplinary action. Customer data must only be stored on approved company systems. Any suspected data breach must be reported to the Data Protection Officer within 24 hours."
  }
];

const COMPLEXITY_COLORS = { low: "#2D9B5A", medium: "#E8872A", high: "#E63946" };
const COMPLEXITY_BG = { low: "#EAF7EF", medium: "#FEF3E8", high: "#FDEBED" };

// ── Loading Skeleton Component ──
function ResultSkeleton() {
  return (
    <div className="results">
      <div className="card skeleton-card">
        <div className="skeleton-header">
          <div className="skel skel-label" />
          <div className="skel skel-btn" />
        </div>
        <div className="skeleton-badges">
          {[100, 110, 90, 105, 140].map((w, i) => (
            <div key={i} className="skel skel-badge" style={{ width: w }} />
          ))}
        </div>
        <div className="skel skel-signals" />
      </div>
      <div className="card skeleton-card">
        <div className="skel skel-rec-header" />
        <div className="skeleton-body">
          <div className="skel skel-line" style={{ width: "45%" }} />
          <div className="skel skel-line" />
          <div className="skel skel-line" style={{ width: "85%" }} />
          <div className="skel skel-line" style={{ width: "70%" }} />
          <div className="skel skel-divider" />
          <div className="skel skel-line" style={{ width: "40%" }} />
          <div className="skel skel-line" />
          <div className="skel skel-line" style={{ width: "65%" }} />
          <div className="skel skel-divider" />
          <div className="skel skel-example" />
        </div>
      </div>
      <div className="card skeleton-card">
        <div className="skeleton-body">
          <div className="skel skel-line" style={{ width: "55%" }} />
          <div className="skel skel-line" style={{ width: "80%" }} />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [content, setContent] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showExample, setShowExample] = useState(false);
  const [copied, setCopied] = useState(false);

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const isOverLimit = wordCount > 400;
  const isUnderMin = wordCount > 0 && wordCount < 15;

  async function handleAnalyse() {
    if (!content.trim() || isOverLimit || isUnderMin) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setResult(data);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleExample(ex) {
    setContent(ex.text);
    setResult(null);
    setError(null);
    setShowExample(false);
  }

  function handleCopy() {
    if (!result) return;
    const text = `InteractIQ Analysis

Content Type: ${result.classification.primaryTypeLabel}
Complexity: ${result.classification.complexity}
Bloom's Level: ${result.classification.bloomLabel}
Confidence: ${Math.round(result.classification.confidence * 100)}%

Recommended Interaction: ${result.recommendation.primaryInteraction}
Why this works: ${result.recommendation.whyThisWorks}
Why not ${result.recommendation.alternativeInteraction}: ${result.recommendation.whyNotAlternative}

Example:
${result.recommendation.starterExample}

Author tip: ${result.recommendation.authorTip}

Alternative: ${result.recommendation.alternativeInteraction}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleReset() {
    setContent("");
    setResult(null);
    setError(null);
  }

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <div className="logo-mark">
              <span className="logo-h">H</span>
            </div>
            <div className="logo-text">
              <span className="logo-product">InteractIQ</span>
              <span className="logo-tagline">by Harbinger</span>
            </div>
          </div>
          <div className="header-badge">AI-Powered eLearning Design</div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="hero">
        <h1 className="hero-title">
          What interaction should<br />
          <span className="hero-accent">your content become?</span>
        </h1>
        <p className="hero-sub">
          Paste any learning content - a concept, process, or scenario —
          and get an intelligent, rule-grounded interaction recommendation.
        </p>
      </section>

      {/* ── Main Input ── */}
      <main className="main">
        <div className="card input-card">
          <div className="card-header">
            <span className="card-label">Your learning content</span>
            <button className="example-btn" onClick={() => setShowExample(!showExample)}>
              {showExample ? "Hide examples" : "Try an example"}
            </button>
          </div>

          {showExample && (
            <div className="examples-panel">
              {EXAMPLE_CONTENT.map((ex, i) => (
                <button key={i} className="example-chip" onClick={() => handleExample(ex)}>
                  {ex.label}
                </button>
              ))}
            </div>
          )}

          <textarea
            className={`textarea ${isOverLimit ? "textarea-error" : isUnderMin ? "textarea-warn" : ""}`}
            value={content}
            onChange={e => { setContent(e.target.value); setResult(null); setError(null); }}
            placeholder="Paste a learning concept, process description, or scenario here...&#10;&#10;Example: 'To submit an expense report, log in to the portal and click New Expense...'"
            rows={5}
          />

          <div className="input-footer">
            <span className={`word-count ${isOverLimit ? "wc-error" : isUnderMin ? "wc-warn" : wordCount > 0 ? "wc-ok" : ""}`}>
              {wordCount > 0 ? `${wordCount} words ${isOverLimit ? "- too long (max 400)" : isUnderMin ? "- too short (min 15)" : ""}` : "Min 15 words · Max 400 words"}
            </span>
            <div className="input-actions">
              {content && <button className="reset-btn" onClick={handleReset}>Clear</button>}
              <button
                className={`analyse-btn ${loading ? "loading" : ""}`}
                onClick={handleAnalyse}
                disabled={loading || !content.trim() || isOverLimit || isUnderMin}
              >
                {loading ? (
                  <span className="btn-loading">
                    <span className="spinner" />
                    Analysing...
                  </span>
                ) : "Analyse →"}
              </button>
            </div>
          </div>

          {/* ── Error box with Retry button ── */}
          {error && (
            <div className="error-box">
              <span className="error-icon">⚠</span>
              <span className="error-msg">{error}</span>
              <button className="retry-btn" onClick={handleAnalyse}>
                Retry →
              </button>
            </div>
          )}
        </div>

        {/* ── Loading Skeleton ── */}
        {loading && <ResultSkeleton />}

        {/* ── Results ── */}
        {result && !loading && (
          <div className="results">
            {/* Classification summary */}
            <div className="card classification-card">
              <div className="card-header">
                <span className="card-label">Content analysis</span>
                <button className="copy-btn" onClick={handleCopy}>
                  {copied ? "✓ Copied!" : "Copy result"}
                </button>
              </div>
              <div className="badges-row">
                <div className="badge badge-type">
                  <span className="badge-key">Type</span>
                  <span className="badge-val">{result.classification.primaryTypeLabel}</span>
                </div>
                {result.classification.secondaryTypeLabel && (
                  <div className="badge badge-secondary">
                    <span className="badge-key">Also</span>
                    <span className="badge-val">{result.classification.secondaryTypeLabel}</span>
                  </div>
                )}
                <div className="badge" style={{ background: COMPLEXITY_BG[result.classification.complexity] }}>
                  <span className="badge-key">Complexity</span>
                  <span className="badge-val" style={{ color: COMPLEXITY_COLORS[result.classification.complexity] }}>
                    {result.classification.complexity.charAt(0).toUpperCase() + result.classification.complexity.slice(1)}
                  </span>
                </div>
                <div className="badge" style={{ background: result.classification.bloomColor + "18" }}>
                  <span className="badge-key">Bloom's</span>
                  <span className="badge-val" style={{ color: result.classification.bloomColor }}>
                    {result.classification.bloomLabel}
                  </span>
                </div>
                <div className="badge" style={{ background: result.classification.confidenceColor + "18" }}>
                  <span className="badge-key">Confidence</span>
                  <span className="badge-val" style={{ color: result.classification.confidenceColor }}>
                    {Math.round(result.classification.confidence * 100)}% - {result.classification.confidenceLabel}
                  </span>
                </div>
              </div>

              {result.classification.keySignals?.length > 0 && (
                <div className="signals">
                  <span className="signals-label">Key signals detected:</span>
                  {result.classification.keySignals.map((s, i) => (
                    <span key={i} className="signal-tag">"{s}"</span>
                  ))}
                </div>
              )}
            </div>

            {/* Primary recommendation */}
            <div className="card recommendation-card">
              <div className="rec-header">
                <div className="rec-badge">✓ Recommended</div>
                <h2 className="rec-interaction">{result.recommendation.primaryInteraction}</h2>
              </div>

              <div className="rec-section">
                <div className="rec-section-label">Why this works</div>
                <p className="rec-text">{result.recommendation.whyThisWorks}</p>
              </div>

              <div className="rec-divider" />

              <div className="rec-section">
                <div className="rec-section-label">
                  Why not <span className="alt-name">{result.recommendation.alternativeInteraction}</span>
                </div>
                <p className="rec-text">{result.recommendation.whyNotAlternative}</p>
              </div>

              <div className="rec-divider" />

              <div className="rec-section example-section">
                <div className="rec-section-label">Starter example</div>
                <div className="example-box">
                  <p className="example-text">{result.recommendation.starterExample}</p>
                </div>
              </div>

              <div className="tip-bar">
                <span className="tip-icon">💡</span>
                <span className="tip-text"><strong>Author tip:</strong> {result.recommendation.authorTip}</span>
              </div>
            </div>

            {/* Alternative */}
            <div className="card alternative-card">
              <div className="alt-header">
                <div className="alt-badge">Alternative</div>
                <span className="alt-interaction">{result.recommendation.alternativeInteraction}</span>
              </div>
              <p className="alt-note">Consider this if you want to vary interaction types across your course, or if your platform has limited support for the primary recommendation.</p>
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="footer">
        <p>InteractIQ · Harbinger Group · AI-native eLearning tools</p>
        <p className="footer-note">Recommendations are rule-grounded and AI-explained - not purely AI-generated.</p>
      </footer>
    </div>
  );
}
