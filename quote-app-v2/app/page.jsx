"use client";
import { useState, useRef, useEffect, useCallback } from "react";

const STOREYS = ["Single storey", "Double storey"];
const TYPES = ["House", "Unit / apartment", "Townhouse"];
const BEDROOMS = ["1", "2", "3", "4", "5", "6+"];
const STATUS_LABELS = { lead: "Lead", quoted: "Quoted", booked: "Booked", completed: "Completed", lost: "Lost" };
const STATUS_COLORS = { lead: "#6b7280", quoted: "#9a6b00", booked: "#1d4ed8", completed: "#2a9d56", lost: "#b3261e" };

const WINDOW_TYPES = [
  ["standard", "Standard"],
  ["half_colonial", "Half colonial"],
  ["front_colonial", "Front colonial only"],
  ["colonial_6", "Colonial 6-pane"],
  ["colonial_8", "Colonial 8-pane"],
  ["colonial_10", "Colonial 10-pane"],
  ["colonial_10plus", "Colonial 10+ pane"],
];

const FEATURES = [
  ["large_sliding_doors", "Large sliding doors / alfresco"],
  ["large_living_glass", "Large open plan living glass"],
  ["pool_windows", "Pool-facing windows"],
  ["pool_fencing", "Glass pool fencing"],
  ["difficult_access", "Difficult access"],
  ["high_window_count", "High window count"],
];

const ls = { fontSize: 12, color: "var(--text-muted)", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" };
const sl = { fontSize: 12, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 6px" };

function Pill({ value, current, onClick }) {
  return (
    <button onClick={() => onClick(value)} style={{ padding: "6px 14px", fontSize: 13, borderRadius: 20, cursor: "pointer", background: current === value ? "var(--text-primary)" : "var(--surface-1)", color: current === value ? "var(--bg)" : "var(--text-secondary)", border: `0.5px solid ${current === value ? "var(--text-primary)" : "var(--border)"}`, fontWeight: current === value ? 500 : 400 }}>
      {value}
    </button>
  );
}

function PriceBlock({ label, opening, fallback, floor, openingMargin, fallbackMargin, floorMargin, cost, time, includes, highlight, costBreakdown }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  return (
    <div style={{ padding: "14px 16px", borderRadius: "var(--radius)", background: highlight ? "var(--bg-warning)" : "var(--surface-1)", border: `0.5px solid ${highlight ? "var(--border-warning)" : "var(--border)"}`, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: highlight ? "var(--text-warning)" : "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", margin: 0 }}>{label}</p>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{time}</p>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {[
          { label: "Open with", price: opening, margin: openingMargin, color: "var(--text-primary)", mc: "#2a9d56" },
          { label: "If hesitant", price: fallback, margin: fallbackMargin, color: "var(--text-secondary)", mc: "var(--text-secondary)" },
          { label: "Floor (15%)", price: floor, margin: floorMargin, color: "var(--text-muted)", mc: "var(--text-warning)" },
        ].map(t => (
          <div key={t.label} style={{ flex: 1, textAlign: "center", padding: "8px 4px", background: "var(--surface-2)", borderRadius: "var(--radius)" }}>
            <p style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em", margin: "0 0 3px" }}>{t.label}</p>
            <p style={{ fontSize: 20, fontWeight: 500, color: t.color, margin: 0, lineHeight: 1 }}>${t.price}</p>
            {t.margin != null && <p style={{ fontSize: 11, color: t.mc, margin: "3px 0 0", fontWeight: 500 }}>{t.margin}%</p>}
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 6px", fontStyle: "italic" }}>{includes}</p>
      {costBreakdown && (
        <>
          <button onClick={() => setShowBreakdown(!showBreakdown)} style={{ fontSize: 11, color: "var(--text-muted)", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
            {showBreakdown ? "▲ Hide" : "▼ Show"} cost breakdown · total cost ${cost}
          </button>
          {showBreakdown && (
            <div style={{ marginTop: 8, padding: "8px 10px", background: "var(--surface-2)", borderRadius: "var(--radius)", fontSize: 12, color: "var(--text-secondary)" }}>
              <p style={{ margin: "0 0 3px" }}>Labour: ${costBreakdown.labour} ({costBreakdown.labour / 35}hrs × $35)</p>
              <p style={{ margin: "0 0 3px" }}>Drive time: ${costBreakdown.drive_time} (1hr × $35)</p>
              <p style={{ margin: "0 0 3px" }}>CAC: ${costBreakdown.cac}</p>
              {costBreakdown.travel_total > 0 && <p style={{ margin: "0 0 3px" }}>Travel: ${costBreakdown.travel_total.toFixed(0)} (${costBreakdown.travel_km_charge}/km + ${costBreakdown.travel_time_fee} time fee)</p>}
              {costBreakdown.danger_premium > 0 && <p style={{ margin: "0 0 3px" }}>Double storey premium: ${costBreakdown.danger_premium}</p>}
              {costBreakdown.pitch_surcharge > 0 && <p style={{ margin: "0 0 3px" }}>Pitch surcharge: ${costBreakdown.pitch_surcharge}</p>}
              {costBreakdown.metal_extra_time && <p style={{ margin: "0 0 3px" }}>Metal roof: +{costBreakdown.metal_extra_time}</p>}
              <p style={{ margin: "6px 0 0", fontWeight: 500, color: "var(--text-primary)", borderTop: "0.5px solid var(--border)", paddingTop: 6 }}>Total cost: ${costBreakdown.total_cost}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function colonialCfg(s) {
  return ({
    confirmed: { bg: "var(--bg-warning)", color: "var(--text-warning)", label: "Colonial confirmed" },
    uncertain: { bg: "var(--bg-warning)", color: "var(--text-warning)", label: "Colonial uncertain — verify" },
    none: { bg: "var(--surface-1)", color: "var(--text-muted)", label: "No colonial detected" },
  }[s] || { bg: "var(--surface-1)", color: "var(--text-muted)", label: "—" });
}

function QuoteScreen({ address, setAddress, bedrooms, setBedrooms, storeys, setStoreys, propType, setPropType, extraNotes, setExtraNotes, windowType, setWindowType, roofM2, setRoofM2, features, setFeatures, roofType, setRoofType, pitch, setPitch, loading, generateQuote, saveQuoteAsJob, saveMsg, quote, activeTab, setActiveTab, error, resultRef }) {
  return (
    <div style={{ padding: "0 0 80px" }}>
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>Melbourne window & gutter cleaning</p>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: "4px 0 0", color: "var(--text-primary)" }}>Property Quoting Tool</h1>
      </div>

      <div style={{ background: "var(--surface-2)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1.25rem", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={ls}>Property address</label>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <input type="text" value={address} onChange={e => setAddress(e.target.value)} onKeyDown={e => e.key === "Enter" && generateQuote()} placeholder="e.g. 42 Elm Street, Hawthorn VIC 3122" style={{ flex: 1, fontSize: 15 }} />
            <button onClick={() => address && window.open(`https://www.google.com/maps/search/${encodeURIComponent(address)}`, "_blank")} style={{ padding: "0 14px", background: "var(--surface-1)", color: "var(--text-primary)", border: "0.5px solid var(--border)", flexShrink: 0, width: 44 }}>
              <i className="ti ti-map-2" style={{ fontSize: 16 }} />
            </button>
          </div>
        </div>

        <div>
          <label style={ls}>Storeys</label>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {STOREYS.map(s => <Pill key={s} value={s} current={storeys} onClick={setStoreys} />)}
          </div>
        </div>

        <div>
          <label style={ls}>Property type</label>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {TYPES.map(t => <Pill key={t} value={t} current={propType} onClick={setPropType} />)}
          </div>
        </div>

        <div>
          <label style={ls}>Bedrooms</label>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {BEDROOMS.map(b => <Pill key={b} value={b} current={bedrooms} onClick={setBedrooms} />)}
          </div>
        </div>

        <div>
          <label style={ls}>Window type</label>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {WINDOW_TYPES.map(([val, lbl]) => (
              <button key={val} onClick={() => setWindowType(val)} style={{ padding: "6px 14px", fontSize: 13, borderRadius: 20, cursor: "pointer", background: windowType === val ? "var(--text-primary)" : "var(--surface-1)", color: windowType === val ? "var(--bg)" : "var(--text-secondary)", border: `0.5px solid ${windowType === val ? "var(--text-primary)" : "var(--border)"}`, fontWeight: windowType === val ? 500 : 400 }}>{lbl}</button>
            ))}
          </div>
        </div>

        <div>
          <label style={ls}>Roof type</label>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {[["tile","🔴 Tile"],["metal","⬛ Metal"]].map(([val, lbl]) => (
              <button key={val} onClick={() => setRoofType(val)} style={{ padding: "6px 18px", fontSize: 13, borderRadius: 20, cursor: "pointer", background: roofType === val ? "var(--text-primary)" : "var(--surface-1)", color: roofType === val ? "var(--bg)" : "var(--text-secondary)", border: `0.5px solid ${roofType === val ? "var(--text-primary)" : "var(--border)"}`, fontWeight: roofType === val ? 500 : 400 }}>{lbl}</button>
            ))}
            {roofType === "metal" && <span style={{ fontSize: 12, color: "var(--text-warning)", alignSelf: "center" }}>+45 min added</span>}
          </div>
        </div>

        <div>
          <label style={ls}>Roof pitch</label>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {[["flat","Flat/low"],["standard","Standard"],["steep","Steep +$65"],["very_steep","Very steep +$100"]].map(([val, lbl]) => (
              <button key={val} onClick={() => setPitch(val)} style={{ padding: "6px 14px", fontSize: 13, borderRadius: 20, cursor: "pointer", background: pitch === val ? "var(--text-primary)" : "var(--surface-1)", color: pitch === val ? "var(--bg)" : "var(--text-secondary)", border: `0.5px solid ${pitch === val ? "var(--text-primary)" : "var(--border)"}`, fontWeight: pitch === val ? 500 : 400 }}>{lbl}</button>
            ))}
          </div>
          {pitch === "flat" && roofType === "metal" && <p style={{ fontSize: 12, color: "#2a9d56", margin: "4px 0 0" }}>Flat metal roof — no pitch surcharge applies</p>}
        </div>

        <div>
          <label style={ls}>Property features <span style={{ fontWeight: 400, textTransform: "none" }}>(tick all that apply)</span></label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {FEATURES.map(([key, label]) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14, color: "var(--text-secondary)" }}>
                <input type="checkbox" checked={!!features[key]} onChange={e => setFeatures(f => ({ ...f, [key]: e.target.checked }))}
                  style={{ width: 16, height: 16, cursor: "pointer" }} />
                {label}
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>+${key === "pool_fencing" ? "30" : key === "pool_windows" ? "25" : "30"}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label style={ls}>Roof size (m²) <span style={{ fontWeight: 400, textTransform: "none" }}>— measure on Google Earth</span></label>
          <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
            <input type="number" value={roofM2} onChange={e => setRoofM2(e.target.value)} placeholder="e.g. 165 — leave blank to auto-estimate" style={{ flex: 1 }} />
            <button onClick={() => window.open(`https://earth.google.com/web/search/${encodeURIComponent(address)}`, "_blank")} title="Open in Google Earth" style={{ padding: "0 14px", background: "var(--surface-1)", color: "var(--text-primary)", border: "0.5px solid var(--border)", flexShrink: 0, width: 44, height: 42 }}>🌍</button>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>Google Earth → polygon tool → trace roof → read m² → type here</p>
        </div>

        <div>
          <label style={ls}>Customer notes <span style={{ fontWeight: 400, textTransform: "none" }}>(optional)</span></label>
          <textarea value={extraNotes} onChange={e => setExtraNotes(e.target.value)} placeholder="Anything the customer mentioned..." rows={2} style={{ marginTop: 6, resize: "vertical" }} />
        </div>

        <button onClick={generateQuote} disabled={!address.trim() || loading} style={{ width: "100%", padding: "11px 0", fontSize: 14, fontWeight: 500, opacity: address.trim() && !loading ? 1 : 0.5, cursor: address.trim() && !loading ? "pointer" : "not-allowed", background: "var(--text-primary)", color: "var(--bg)", border: "none" }}>
          {loading
            ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><i className="ti ti-loader-2" style={{ fontSize: 16, animation: "spin 1s linear infinite" }} />Researching property...</span>
            : <span><i className="ti ti-search" style={{ fontSize: 15, marginRight: 6 }} />Generate quote ↗</span>
          }
        </button>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "-8px 0 0", textAlign: "center" }}>realestate.com.au · domain.com.au · Google Maps</p>
      </div>

      {error && <div style={{ marginTop: 16, padding: "12px 16px", background: "var(--bg-danger)", border: "0.5px solid var(--border-danger)", borderRadius: "var(--radius)", color: "var(--text-danger)", fontSize: 14 }}><i className="ti ti-alert-circle" style={{ marginRight: 6 }} />{error}</div>}

      {quote && (
        <div ref={resultRef} style={{ marginTop: 20 }}>
          <div style={{ background: "var(--surface-2)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1.25rem", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>{quote.property}</p>
                <p style={{ fontSize: 16, fontWeight: 500, margin: "2px 0 8px", color: "var(--text-primary)" }}>{quote.address}</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 20, background: "var(--surface-1)", color: "var(--text-secondary)", border: "0.5px solid var(--border)" }}>{quote.window_type_label || "Standard windows"}</span>
                  {quote.estimated_hours && <span style={{ fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 20, background: "var(--surface-1)", color: "var(--text-secondary)", border: "0.5px solid var(--border)" }}>~{quote.estimated_hours} hrs</span>}
                  {storeys === "Double storey" && <span style={{ fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 20, background: "var(--bg-warning)", color: "var(--text-warning)", border: "0.5px solid var(--border-warning)" }}>+$150 danger premium</span>}
                </div>
              </div>
              <button onClick={saveQuoteAsJob} style={{ fontSize: 12, padding: "6px 12px", background: "var(--surface-1)", color: "var(--text-primary)", border: "0.5px solid var(--border)", marginLeft: 8, flexShrink: 0 }}>
                {saveMsg || "Save job"}
              </button>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", paddingTop: 12, borderTop: "0.5px solid var(--border)" }}>
              {[
                { label: "Distance", value: quote.distance_km && quote.drive_time ? `${quote.distance_km} · ${quote.drive_time}` : "—", warn: quote.distance_flag === "long" || quote.distance_flag === "very long" },
                { label: "Roof size", value: quote.roof_m2 ? `${quote.roof_m2}m²` : "estimated" },
                { label: "Est. time", value: quote.estimated_hours ? `${quote.estimated_hours} hrs` : "—" },
              ].map(s => (
                <div key={s.label} style={{ minWidth: 80 }}>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 2px" }}>{s.label}</p>
                  <p style={{ fontSize: 13, color: s.warn ? "var(--text-warning)" : "var(--text-primary)", fontWeight: 500, margin: 0 }}>{s.value}{s.warn ? " ⚠️" : ""}</p>
                </div>
              ))}
            </div>

            {quote.roof_description && (
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 0", fontStyle: "italic" }}>📐 {quote.roof_description}</p>
            )}
            {quote.travel_surcharge > 0 && (
              <p style={{ fontSize: 13, color: "var(--text-warning)", margin: "8px 0 0", fontWeight: 500 }}>
                <i className="ti ti-car" style={{ marginRight: 4 }} />Suggested travel surcharge: +${quote.travel_surcharge}
              </p>
            )}

            {quote.sale_history && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "0.5px solid var(--border)" }}>
                <p style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 4px" }}>Sale history</p>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 4px" }}>{quote.sale_history}</p>
                {quote.wealth_signal && <p style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500, margin: 0 }}><i className="ti ti-bulb" style={{ marginRight: 4, color: "var(--text-warning)" }} />{quote.wealth_signal}</p>}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 4, marginBottom: 12, background: "var(--surface-1)", padding: 4, borderRadius: "var(--radius)", border: "0.5px solid var(--border)" }}>
            {[["windows","🪟 Windows"],["outside","☀️ Outside only"],["gutters","🍂 Gutters"],["combo","📦 Combo −10%"]].map(([id, lbl]) => (
              <button key={id} onClick={() => setActiveTab(id)} style={{ flex: 1, padding: "7px 4px", fontSize: 11, cursor: "pointer", borderRadius: "var(--radius)", background: activeTab === id ? "var(--text-primary)" : "transparent", color: activeTab === id ? "var(--bg)" : "var(--text-muted)", border: "none", fontWeight: activeTab === id ? 500 : 400 }}>{lbl}</button>
            ))}
          </div>

          {activeTab === "windows" && quote.windows && (
            <>
              {quote.learned_time && (
                <div style={{ padding: "10px 14px", background: "var(--bg-warning)", border: "0.5px solid var(--border-warning)", borderRadius: "var(--radius)", marginBottom: 10 }}>
                  <p style={{ fontSize: 13, color: "var(--text-warning)", margin: 0, fontWeight: 500 }}>📊 {quote.learned_time.note} — adjusted to {quote.learned_time.hours} hrs</p>
                </div>
              )}
              <PriceBlock label={quote.window_type_label || "Windows"} opening={quote.windows.opening} fallback={quote.windows.fallback} floor={quote.windows.floor} openingMargin={quote.windows.opening_margin} fallbackMargin={quote.windows.fallback_margin} floorMargin={quote.windows.floor_margin} cost={quote.windows.cost} time={quote.windows.time} includes={quote.windows.includes} highlight={quote.window_type !== "standard"} costBreakdown={quote.cost_breakdown} />
            </>
          )}

          {activeTab === "outside" && quote.outside_only && (
            <PriceBlock label="Outside only" opening={quote.outside_only.opening} fallback={quote.outside_only.fallback} floor={quote.outside_only.floor} openingMargin={quote.outside_only.opening_margin} fallbackMargin={quote.outside_only.fallback_margin} floorMargin={quote.outside_only.floor_margin} cost={quote.outside_only.cost} time={quote.outside_only.time} includes={quote.outside_only.includes} highlight={false} />
          )}

          {activeTab === "gutters" && quote.gutters && (
            <PriceBlock label="Gutter cleaning" opening={quote.gutters.opening} fallback={quote.gutters.fallback} floor={quote.gutters.floor} openingMargin={quote.gutters.opening_margin} fallbackMargin={quote.gutters.fallback_margin} floorMargin={quote.gutters.floor_margin} cost={quote.gutters.cost} time={quote.gutters.time} includes={quote.gutters.includes} highlight={false} />
          )}

          {activeTab === "combo" && quote.combo && (
            <PriceBlock label="Windows + gutters — 10% off" opening={quote.combo.standard_opening} fallback={quote.combo.standard_fallback} floor={quote.combo.standard_floor} openingMargin={quote.combo.standard_opening_margin} fallbackMargin={quote.combo.standard_fallback_margin} floorMargin={quote.combo.standard_floor_margin} cost={quote.combo.cost} time="combined" includes={`10% combo discount — saves customer $${quote.combo.saving}`} highlight={false} />
          )}

          {(quote.observations?.length > 0 || quote.verify?.length > 0) && (
            <div style={{ background: "var(--surface-2)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1.25rem", marginTop: 12 }}>
              {quote.observations?.length > 0 && (
                <>
                  <p style={sl}>Observations</p>
                  <ul style={{ margin: "0 0 12px", padding: 0, listStyle: "none" }}>
                    {quote.observations.map((o, i) => <li key={i} style={{ fontSize: 14, color: "var(--text-secondary)", padding: "4px 0", borderBottom: "0.5px solid var(--border)", display: "flex", gap: 8 }}><span style={{ color: "var(--text-muted)" }}>—</span>{o}</li>)}
                  </ul>
                </>
              )}
              {quote.verify?.length > 0 && (
                <>
                  <p style={{ ...sl, color: "var(--text-warning)" }}>Verify with customer</p>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                    {quote.verify.map((v, i) => <li key={i} style={{ fontSize: 14, color: "var(--text-secondary)", padding: "4px 0", borderBottom: "0.5px solid var(--border)", display: "flex", gap: 8 }}><span style={{ color: "var(--text-warning)" }}>!</span>{v}</li>)}
                  </ul>
                </>
              )}
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "12px 0 0" }}>Sources: {quote.sources}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HistoryScreen({ jobs, openUpdate, deleteJob }) {
  return (
    <div style={{ padding: "0 0 80px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 500, margin: "0 0 20px", color: "var(--text-primary)" }}>Job History</h1>
      {jobs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
          <p style={{ fontSize: 32, margin: "0 0 8px" }}>📋</p>
          <p style={{ margin: 0 }}>No jobs yet. Generate a quote and save it.</p>
        </div>
      ) : jobs.map(job => (
        <div key={job.id} style={{ background: "var(--surface-2)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1rem", marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: STATUS_COLORS[job.status] + "22", color: STATUS_COLORS[job.status] }}>{STATUS_LABELS[job.status] || job.status}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{new Date(job.createdAt).toLocaleDateString("en-AU")}</span>
              </div>
              <p style={{ fontSize: 15, fontWeight: 500, margin: "0 0 4px", color: "var(--text-primary)" }}>{job.address}</p>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
                {job.bedrooms}BR {job.storeys?.toLowerCase()}
                {job.quote?.roof_m2 ? ` · ${job.quote.roof_m2}m²` : ""}
                {job.windowType && job.windowType !== "standard" ? ` · ${job.quote?.window_type_label || job.windowType}` : ""}
                {job.quotedPrice ? ` · quoted $${job.quotedPrice}` : ""}
                {job.finalPrice ? ` · charged $${job.finalPrice}` : ""}
                {job.actualHours ? ` · ${job.actualHours}hrs actual` : ""}
              </p>
              {job.jobNotes && <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "6px 0 0", fontStyle: "italic" }}>{job.jobNotes}</p>}
            </div>
            <div style={{ display: "flex", gap: 6, marginLeft: 8 }}>
              <button onClick={() => openUpdate(job)} style={{ fontSize: 12, padding: "6px 10px", background: "var(--surface-1)", color: "var(--text-primary)", border: "0.5px solid var(--border)" }}>Update</button>
              <button onClick={() => deleteJob(job.id)} style={{ fontSize: 12, padding: "6px 10px", background: "var(--bg-danger)", color: "var(--text-danger)", border: "0.5px solid var(--border-danger)" }}>✕</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function UpdateScreen({ selectedJob, setSelectedJob, saveUpdate, setScreen }) {
  if (!selectedJob) return null;
  const set = (k, v) => setSelectedJob(j => ({ ...j, [k]: v }));
  const hours = parseFloat(selectedJob.actualHours);
  const price = parseFloat(selectedJob.finalPrice);
  const showProfit = selectedJob.actualHours && selectedJob.finalPrice && !isNaN(hours) && !isNaN(price);
  const totalHours = hours + 1; // includes drive time
  const cost = totalHours * 35 + 80 + 20 + (selectedJob.storeys === "Double storey" ? 150 : 0);
  const profit = price - cost;
  const margin = Math.round((profit / price) * 100);

  return (
    <div style={{ padding: "0 0 80px" }}>
      <button onClick={() => setScreen("history")} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 14, cursor: "pointer", padding: "0 0 16px", display: "flex", alignItems: "center", gap: 4 }}>
        <i className="ti ti-arrow-left" />Back
      </button>
      <h1 style={{ fontSize: 20, fontWeight: 500, margin: "0 0 4px", color: "var(--text-primary)" }}>Update Job</h1>
      <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 20px" }}>{selectedJob.address}</p>

      <div style={{ background: "var(--surface-2)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1.25rem", display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={ls}>Status</label>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <button key={k} onClick={() => set("status", k)} style={{ padding: "6px 14px", fontSize: 13, borderRadius: 20, cursor: "pointer", background: selectedJob.status === k ? STATUS_COLORS[k] : "var(--surface-1)", color: selectedJob.status === k ? "#fff" : "var(--text-secondary)", border: `0.5px solid ${selectedJob.status === k ? STATUS_COLORS[k] : "var(--border)"}`, fontWeight: selectedJob.status === k ? 500 : 400 }}>{v}</button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={ls}>Quoted price ($)</label>
            <input type="number" value={selectedJob.quotedPrice || ""} onChange={e => set("quotedPrice", e.target.value)} placeholder="390" style={{ marginTop: 6 }} />
          </div>
          <div>
            <label style={ls}>Final price charged ($)</label>
            <input type="number" value={selectedJob.finalPrice || ""} onChange={e => set("finalPrice", e.target.value)} placeholder="365" style={{ marginTop: 6 }} />
          </div>
          <div>
            <label style={ls}>Estimated hours</label>
            <input type="text" value={selectedJob.estimatedHours || ""} onChange={e => set("estimatedHours", e.target.value)} placeholder="3.5–4" style={{ marginTop: 6 }} />
          </div>
          <div>
            <label style={ls}>Actual hours taken</label>
            <input type="number" step="0.25" value={selectedJob.actualHours || ""} onChange={e => set("actualHours", e.target.value)} placeholder="3.5" style={{ marginTop: 6 }} />
          </div>
          <div>
            <label style={ls}>Roof size (m²)</label>
            <input type="number" value={selectedJob.actualRoofM2 || selectedJob.quote?.roof_m2 || ""} onChange={e => set("actualRoofM2", e.target.value)} placeholder="165" style={{ marginTop: 6 }} />
          </div>
          <div>
            <label style={ls}>Billable hourly rate</label>
            <p style={{ fontSize: 18, fontWeight: 500, color: "var(--text-primary)", margin: "10px 0 0" }}>
              {selectedJob.finalPrice && selectedJob.actualHours
                ? `$${Math.round(parseFloat(selectedJob.finalPrice) / parseFloat(selectedJob.actualHours))}/hr`
                : "—"}
            </p>
          </div>
        </div>

        <div>
          <label style={ls}>Customer name</label>
          <input type="text" value={selectedJob.customerName || ""} onChange={e => set("customerName", e.target.value)} placeholder="Sarah Johnson" style={{ marginTop: 6 }} />
        </div>
        <div>
          <label style={ls}>Customer phone</label>
          <input type="tel" value={selectedJob.customerPhone || ""} onChange={e => set("customerPhone", e.target.value)} placeholder="0412 345 678" style={{ marginTop: 6 }} />
        </div>
        <div>
          <label style={ls}>Job notes</label>
          <textarea value={selectedJob.jobNotes || ""} onChange={e => set("jobNotes", e.target.value)} placeholder="e.g. Colonial windows at front, took longer than expected, customer wants quarterly..." rows={3} style={{ marginTop: 6, resize: "vertical" }} />
        </div>

        {showProfit && (
          <div style={{ padding: "12px 14px", background: "var(--surface-1)", borderRadius: "var(--radius)", border: "0.5px solid var(--border)" }}>
            <p style={{ ...sl, margin: "0 0 8px" }}>Profit snapshot</p>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 2px" }}>Labour (incl. 1hr drive): ${Math.round(totalHours * 35)}</p>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 2px" }}>CAC: $80</p>
            {selectedJob.storeys === "Double storey" && <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 2px" }}>Double storey premium: $150</p>}
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 2px" }}>Total cost: ${cost.toFixed(0)}</p>
            <p style={{ fontSize: 15, color: margin >= 20 ? "#2a9d56" : "var(--text-warning)", fontWeight: 500, margin: "6px 0 0", borderTop: "0.5px solid var(--border)", paddingTop: 6 }}>
              Profit: ${profit.toFixed(0)} ({margin}% margin) · ${Math.round(price / hours)}/hr billable
            </p>
          </div>
        )}

        <button onClick={saveUpdate} style={{ width: "100%", padding: "11px 0", fontSize: 14, fontWeight: 500, background: "var(--text-primary)", color: "var(--bg)", border: "none" }}>Save update</button>
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("quote");
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [address, setAddress] = useState("");
  const [bedrooms, setBedrooms] = useState("3");
  const [storeys, setStoreys] = useState("Single storey");
  const [propType, setPropType] = useState("House");
  const [extraNotes, setExtraNotes] = useState("");
  const [windowType, setWindowType] = useState("standard");
  const [roofM2, setRoofM2] = useState("");
  const [features, setFeatures] = useState({});
  const [roofType, setRoofType] = useState("tile");
  const [pitch, setPitch] = useState("standard");
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("windows");
  const [saveMsg, setSaveMsg] = useState("");
  const resultRef = useRef(null);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      if (res.ok) setJobs(await res.json());
    } catch {}
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const generateQuote = async () => {
    if (!address.trim()) return;
    setLoading(true);
    setError(null);
    setQuote(null);
    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, bedrooms, storeys, propType, extraNotes, windowType, roofM2: roofM2 ? parseInt(roofM2) : null, features, roofType, pitch }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setQuote(data);
      setActiveTab("windows");
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveQuoteAsJob = async () => {
    if (!quote) return;
    const job = {
      id: Date.now().toString(),
      status: "quoted",
      address, bedrooms, storeys, propType, extraNotes, windowType, features, roofType, pitch, quote,
      quotedPrice: quote.windows?.opening,
      estimatedHours: quote.estimated_hours,
      suburb: address.split(",").slice(-2, -1)[0]?.trim() || "",
      createdAt: new Date().toISOString(),
    };
    const res = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(job) });
    if (res.ok) {
      setJobs(await res.json());
      setSaveMsg("Saved ✓");
      setTimeout(() => setSaveMsg(""), 2000);
    }
  };

  const openUpdate = (job) => { setSelectedJob({ ...job }); setScreen("update"); };

  const saveUpdate = async () => {
    const res = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(selectedJob) });
    if (res.ok) { setJobs(await res.json()); setScreen("history"); }
  };

  const deleteJob = async (id) => {
    if (!confirm("Delete this job?")) return;
    const res = await fetch("/api/jobs", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (res.ok) setJobs(await res.json());
  };

  const pendingLeads = jobs.filter(j => j.status === "lead" || j.status === "quoted").length;

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px", fontFamily: "var(--font-sans)", background: "var(--surface-1)", minHeight: "100vh" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input, textarea { padding: 10px 12px; border: 0.5px solid var(--border); border-radius: var(--radius); background: var(--bg); color: var(--text-primary); outline: none; font-family: var(--font-sans); font-size: 14px; width: 100%; box-sizing: border-box; }
        input:focus, textarea:focus { border-color: var(--text-primary); }
        button { font-family: var(--font-sans); border-radius: var(--radius); cursor: pointer; }
      `}</style>

      {screen === "quote" && (
        <QuoteScreen
          address={address} setAddress={setAddress}
          bedrooms={bedrooms} setBedrooms={setBedrooms}
          storeys={storeys} setStoreys={setStoreys}
          propType={propType} setPropType={setPropType}
          extraNotes={extraNotes} setExtraNotes={setExtraNotes}
          windowType={windowType} setWindowType={setWindowType}
          roofM2={roofM2} setRoofM2={setRoofM2}
          features={features} setFeatures={setFeatures}
          roofType={roofType} setRoofType={setRoofType}
          pitch={pitch} setPitch={setPitch}
          loading={loading} generateQuote={generateQuote}
          saveQuoteAsJob={saveQuoteAsJob} saveMsg={saveMsg}
          quote={quote} activeTab={activeTab} setActiveTab={setActiveTab}
          error={error} resultRef={resultRef}
        />
      )}
      {screen === "history" && <HistoryScreen jobs={jobs} openUpdate={openUpdate} deleteJob={deleteJob} />}
      {screen === "update" && <UpdateScreen selectedJob={selectedJob} setSelectedJob={setSelectedJob} saveUpdate={saveUpdate} setScreen={setScreen} />}

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "var(--bg)", borderTop: "0.5px solid var(--border)", display: "flex", justifyContent: "center" }}>
        <div style={{ display: "flex", width: "100%", maxWidth: 600 }}>
          {[
            { id: "quote", icon: "ti-home", label: "Quote" },
            { id: "history", icon: "ti-history", label: `History${pendingLeads > 0 ? ` (${pendingLeads})` : ""}` },
          ].map(nav => (
            <button key={nav.id} onClick={() => setScreen(nav.id)} style={{ flex: 1, padding: "12px 8px", background: "none", border: "none", color: screen === nav.id ? "var(--text-primary)" : "var(--text-muted)", fontWeight: screen === nav.id ? 500 : 400, fontSize: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <i className={`ti ${nav.icon}`} style={{ fontSize: 20 }} />
              {nav.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
