import { NextResponse } from "next/server";

// ─── PRICE TABLES ────────────────────────────────────────────────────────────

const WINDOWS = {
  single: {
    "1": { open: 280, time: "1.5–2 hrs", cost: 160 },
    "2": { open: 280, time: "1.5–2 hrs", cost: 160 },
    "3": { open: 370, time: "3–3.5 hrs", cost: 230 },
    "4": { open: 400, time: "3.5–4 hrs", cost: 248 },
    "5": { open: 430, time: "4–4.5 hrs", cost: 265 },
    "6+": { open: 460, time: "4.5–5 hrs", cost: 283 },
    "unit": { open: 280, time: "1.5–2 hrs", cost: 160 },
    "townhouse": { open: 450, time: "2–2.5 hrs", cost: 195 },
  },
  double: {
    "1": { open: 520, time: "3.5–4 hrs", cost: 320 },
    "2": { open: 520, time: "3.5–4 hrs", cost: 320 },
    "3": { open: 520, time: "4–5 hrs", cost: 340 },
    "4": { open: 580, time: "5–6 hrs", cost: 375 },
    "5": { open: 640, time: "6–7 hrs", cost: 410 },
    "6+": { open: 700, time: "7–8 hrs", cost: 445 },
    "townhouse": { open: 450, time: "2–2.5 hrs", cost: 270 },
  }
};

const GUTTERS = {
  single: {
    "1": { open: 250, time: "1–1.5 hrs", cost: 125 },
    "2": { open: 250, time: "1–1.5 hrs", cost: 125 },
    "3": { open: 340, time: "1.5–2 hrs", cost: 160 },
    "4": { open: 370, time: "2–2.5 hrs", cost: 178 },
    "5": { open: 410, time: "2.5–3 hrs", cost: 195 },
    "6+": { open: 410, time: "2.5–3 hrs", cost: 195 },
    "unit": { open: 250, time: "1–1.5 hrs", cost: 125 },
    "townhouse": { open: 445, time: "2–2.5 hrs", cost: 230 },
  },
  double: {
    "1": { open: 465, time: "2.5–3 hrs", cost: 270 },
    "2": { open: 465, time: "2.5–3 hrs", cost: 270 },
    "3": { open: 465, time: "2.5–3 hrs", cost: 270 },
    "4": { open: 510, time: "3–3.5 hrs", cost: 300 },
    "5": { open: 560, time: "3.5–4 hrs", cost: 330 },
    "6+": { open: 560, time: "3.5–4 hrs", cost: 330 },
    "townhouse": { open: 445, time: "2–2.5 hrs", cost: 230 },
  }
};

const COLONIAL = {
  standard: 0, half_colonial: 75, front_colonial: 50,
  colonial_6: 125, colonial_8: 200, colonial_10: 250, colonial_10plus: 300,
};

const WINDOW_LABELS = {
  standard: "Standard", half_colonial: "Half colonial",
  front_colonial: "Front colonial only", colonial_6: "Colonial 6-pane",
  colonial_8: "Colonial 8-pane", colonial_10: "Colonial 10-pane",
  colonial_10plus: "Colonial 10+ pane",
};

function margin(price, cost) {
  return Math.round(((price - cost) / price) * 100);
}

function cashPrice(open) {
  // Round down to nearest $10, then subtract $10-30 for a clean cash discount
  const base = Math.floor(open / 10) * 10;
  return base - (open % 10 === 0 ? 30 : 20);
}

function floorPrice(cost) {
  // 15% margin floor, rounded to nearest $5
  return Math.ceil(cost / 0.85 / 5) * 5;
}

export async function POST(request) {
  try {
    const { bedrooms, storeys, propType, windowType, poolPanes } = await request.json();

    const isDouble = storeys === "Double storey";
    const tier = isDouble ? "double" : "single";
    const key = propType === "Unit / apartment" ? "unit" : propType === "Townhouse" ? "townhouse" : String(bedrooms);

    const win = WINDOWS[tier][key] || WINDOWS[tier]["3"];
    const gut = GUTTERS[tier][key] || GUTTERS[tier]["3"];
    const colonial = COLONIAL[windowType] || 0;
    const pool = Math.round((parseInt(poolPanes) || 0) * 10);

    // Windows
    const wOpen = win.open + colonial + pool;
    const wCash = cashPrice(wOpen);
    const wFloor = Math.max(220, floorPrice(win.cost + colonial + pool));
    const wCost = win.cost + colonial + pool;

    // Outside only — 65% + $75 flat for double
    const outsideFlat = isDouble ? 75 : 0;
    const oOpen = Math.round(win.open * 0.65) + outsideFlat + colonial;
    const oCash = cashPrice(oOpen);
    const oFloor = Math.max(220, Math.round(win.floor * 0.65) + outsideFlat);
    const oCost = Math.round(win.cost * 0.65) + outsideFlat;

    // Gutters
    const gOpen = gut.open + pool;
    const gCash = cashPrice(gOpen);
    const gFloor = Math.max(190, floorPrice(gut.cost));
    const gCost = gut.cost;

    // Combo — 10% off
    const cOpen = Math.round((wOpen + gOpen) * 0.90 / 10) * 10;
    const cCash = cashPrice(cOpen);
    const cFloor = Math.max(350, Math.round((wFloor + gFloor) * 0.90 / 5) * 5);
    const cCost = wCost + gCost;
    const cSaving = (wOpen + gOpen) - cOpen;

    return NextResponse.json({
      windows: {
        open: wOpen, cash: wCash, floor: wFloor,
        open_margin: margin(wOpen, wCost),
        cash_margin: margin(wCash, wCost),
        floor_margin: margin(wFloor, wCost),
        time: win.time,
        colonial_surcharge: colonial,
        pool_surcharge: pool,
      },
      outside: {
        open: oOpen, cash: oCash, floor: oFloor,
        open_margin: margin(oOpen, oCost),
        cash_margin: margin(oCash, oCost),
        floor_margin: margin(oFloor, oCost),
        time: win.time,
      },
      gutters: {
        open: gOpen, cash: gCash, floor: gFloor,
        open_margin: margin(gOpen, gCost),
        cash_margin: margin(gCash, gCost),
        floor_margin: margin(gFloor, gCost),
        time: gut.time,
        pool_surcharge: pool,
      },
      combo: {
        open: cOpen, cash: cCash, floor: cFloor,
        open_margin: margin(cOpen, cCost),
        cash_margin: margin(cCash, cCost),
        floor_margin: margin(cFloor, cCost),
        saving: cSaving,
        time: win.time,
      },
      window_type_label: WINDOW_LABELS[windowType] || "Standard",
      is_double: isDouble,
      property_label: `${bedrooms}BR ${storeys} ${propType}`,
    });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
