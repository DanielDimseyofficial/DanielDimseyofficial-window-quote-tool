"use client";
import { useState } from "react";

const STOREYS = ["Single storey", "Double storey"];
const TYPES = ["House", "Unit / apartment", "Townhouse"];
const BEDROOMS = ["1", "2", "3", "4", "5", "6+"];
const WINDOW_TYPES = [
  ["standard", "Standard"],
  ["half_colonial", "Half colonial"],
  ["front_colonial", "Front colonial only"],
  ["colonial_6", "Colonial 6-pane"],
  ["colonial_8", "Colonial 8-pane"],
  ["colonial_10", "Colonial 10-pane"],
  ["colonial_10plus", "Colonial 10+ pane"],
];

const ls = { fontSize: 12, color: "var(--text-muted)", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" };

function Pill({ value, current, onClick, small }) {
  const active = current === value;
  return (
    <button onClick={() => onClick(value)} style={{
      padding: small ? "5px 12px" : "7px 16px",
      fontSize: small ? 12 : 13,
      borderRadius: 20, cursor: "pointer",
      background: active ? "var(--text-primary)" : "var(--surface-1)",
      color: active ? "var(--bg)" : "var(--text-secondary)",
      border: `0.5px solid ${active ? "var(--text-primary)" : "var(--border)"}`,
      fontWeight: active ? 500 : 400,
    }}>{value}</button>
  );
}

function PriceCol({ label, price, margin, isFloor, isCash }) {
  const color = isFloor ? "var(--text-muted)" : isCash ? "var(--text-secondary)" : "var(--text-primary)";
  const mc = isFloor ? "var(--text-warning)" : isCash ? "var(--text-secondary)" : "#2a9d56";
  return (
    <div style={{ flex: 1, textAlign: "center", padding: "10px 4px", background: "var(--surface-2)", borderRadius: "var(--radius)" }}>
      <p style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 4px" }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 600, color, margin: 0, lineHeight: 1 }}>${price}</p>
      <p style={{ fontSize: 11, color: mc, margin: "3px 0 0", fontWeight: 500 }}>{margin}%</p>
    </div>
  );
}

function ServiceBlock({ label, data, highlight }) {
  if (!data) return null;
  return (
    <div style={{ padding: "14px 16px", borderRadius: "var(--radius)", background: highlight ? "var(--bg-warning)" : "var(--surface-1)", border: `0.5px solid ${highlight ? "var(--border-warning)" : "var(--border)"}`, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: highlight ? "var(--text-warning)" : "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", margin: 0 }}>{label}</p>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{data.time}</p>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <PriceCol label="Open with" price={data.open} margin={data.open_margin} />
        <PriceCol label="Cash price" price={data.cash} margin={data.cash_margin} isCash />
        <PriceCol label="Floor (15%)" price={data.floor} margin={data.floor_margin} isFloor />
      </div>
      {(data.colonial_surcharge > 0 || data.pool_surcharge > 0 || data.saving > 0) && (
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 0", fontStyle: "italic" }}>
          {[
            data.colonial_surcharge > 0 ? `Colonial +$${data.colonial_surcharge}` : null,
            data.pool_surcharge > 0 ? `Pool fencing +$${data.pool_surcharge}` : null,
            data.saving > 0 ? `Saves customer $${data.saving}` : null,
          ].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

export default function App() {
  const [storeys, setStoreys] = useState("Single storey");
  const [propType, setPropType] = useState("House");
  const [bedrooms, setBedrooms] = useState("3");
  const [windowType, setWindowType] = useState("standard");
  const [poolPanes, setPoolPanes] = useState("");
  const [activeTab, setActiveTab] = useState("windows");
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bedrooms, storeys, propType, windowType, poolPanes: poolPanes ? parseInt(poolPanes) : 0 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setQuote(data);
      setActiveTab("windows");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 500, margin: "0 auto", padding: "24px 16px 80px", fontFamily: "var(--font-sans)", background: "var(--surface-1)", minHeight: "100vh" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>Swift Clean</p>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: "3px 0 0", color: "var(--text-primary)" }}>Quote Tool</h1>
      </div>

      <div style={{ background: "var(--surface-2)", border: "0.5px solid var(--border)", borderRadius: 14, padding: "1.25rem", display: "flex", flexDirection: "column", gap: 18 }}>

        <div>
          <label style={ls}>Storeys</label>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
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
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {BEDROOMS.map(b => <Pill key={b} value={b} current={bedrooms} onClick={setBedrooms} small />)}
          </div>
        </div>

        <div>
          <label style={ls}>Window type</label>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {WINDOW_TYPES.map(([val, lbl]) => (
              <button key={val} onClick={() => setWindowType(val)} style={{ padding: "5px 12px", fontSize: 12, borderRadius: 20, cursor: "pointer", background: windowType === val ? "var(--text-primary)" : "var(--surface-1)", color: windowType === val ? "var(--bg)" : "var(--text-secondary)", border: `0.5px solid ${windowType === val ? "var(--text-primary)" : "var(--border)"}`, fontWeight: windowType === val ? 500 : 400 }}>{lbl}</button>
            ))}
          </div>
        </div>

        <div>
          <label style={ls}>Glass pool fencing <span style={{ fontWeight: 400, textTransform: "none" }}>($10 per pane)</span></label>
          <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
            <input type="number" value={poolPanes} onChange={e => setPoolPanes(e.target.value)} placeholder="Number of panes (0 if none)" style={{ flex: 1, padding: "10px 12px", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", background: "var(--bg)", color: "var(--text-primary)", fontSize: 14, outline: "none" }} />
            {poolPanes > 0 && <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", flexShrink: 0 }}>+${parseInt(poolPanes) * 10}</span>}
          </div>
        </div>

        <button onClick={generate} disabled={loading} style={{ width: "100%", padding: "12px 0", fontSize: 15, fontWeight: 600, background: "var(--text-primary)", color: "var(--bg)", border: "none", borderRadius: "var(--radius)", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading
            ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><i className="ti ti-loader-2" style={{ fontSize: 16, animation: "spin 1s linear infinite" }} />Calculating...</span>
            : "Get quote →"
          }
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 16, padding: "12px 16px", background: "var(--bg-danger)", border: "0.5px solid var(--border-danger)", borderRadius: "var(--radius)", color: "var(--text-danger)", fontSize: 14 }}>
          {error}
        </div>
      )}

      {quote && (
        <div style={{ marginTop: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{quote.property_label}</p>
            {quote.window_type_label !== "Standard" && (
              <p style={{ fontSize: 13, color: "var(--text-warning)", margin: "2px 0 0", fontWeight: 500 }}>{quote.window_type_label}</p>
            )}
          </div>

          <div style={{ display: "flex", gap: 4, marginBottom: 12, background: "var(--surface-1)", padding: 4, borderRadius: "var(--radius)", border: "0.5px solid var(--border)" }}>
            {[["windows","🪟 Windows"],["outside","☀️ Outside only"],["gutters","🍂 Gutters"],["combo","📦 Combo −10%"]].map(([id, lbl]) => (
              <button key={id} onClick={() => setActiveTab(id)} style={{ flex: 1, padding: "7px 4px", fontSize: 11, cursor: "pointer", borderRadius: "var(--radius)", background: activeTab === id ? "var(--text-primary)" : "transparent", color: activeTab === id ? "var(--bg)" : "var(--text-muted)", border: "none", fontWeight: activeTab === id ? 500 : 400 }}>{lbl}</button>
            ))}
          </div>

          {activeTab === "windows" && <ServiceBlock label="Windows — full clean" data={quote.windows} highlight={quote.window_type_label !== "Standard"} />}
          {activeTab === "outside" && <ServiceBlock label="Outside only" data={quote.outside} highlight={false} />}
          {activeTab === "gutters" && <ServiceBlock label="Gutter cleaning" data={quote.gutters} highlight={false} />}
          {activeTab === "combo" && <ServiceBlock label="Windows + gutters — 10% off" data={quote.combo} highlight={false} />}
        </div>
      )}
    </div>
  );
}
