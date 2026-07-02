import { NextResponse } from "next/server";

const VISION_PROMPT = `You are analyzing a high-resolution satellite image of a Melbourne property to estimate roof size for window and gutter cleaning quotes.

There is a RED PIN/MARKER on the image showing the exact property to measure. Focus ONLY on the roof of that specific property.

Steps:
1. Find the red pin — that marks the exact house to measure
2. Look at the main roof of that house (ignore garage, shed, carport, neighbouring houses)
3. Use surrounding features to calibrate scale — a standard car is ~4.5m long, a standard driveway is ~3m wide, a standard suburban block is ~15-20m wide
4. Estimate width and depth of the main roof footprint in metres
5. Calculate m² = width x depth

Typical Melbourne single storey house: 10-15m wide, 12-18m deep = 120-270m²
Typical Melbourne double storey house: 8-13m wide, 10-15m deep = 80-195m²

Return ONLY this JSON:
{
  "roof_m2": 165,
  "roof_width_m": 13,
  "roof_depth_m": 13,
  "roof_description": "Estimated 13m x 13m — average size, hip roof, clear image",
  "roof_complexity": "simple|moderate|complex",
  "confidence": "high|medium|low",
  "confidence_reason": "Red pin clearly visible, roof outline distinct, calibrated against driveway width"
}

Rules:
- roof_m2: integer estimate of main house footprint only — NOT land size, NOT including garage
- confidence high: red pin visible, roof outline clear, can calibrate against driveway/cars
- confidence medium: roof visible but partially obscured by trees or shadows
- confidence low: image unclear, heavy tree cover, or cannot identify the pinned property
- roof_complexity: simple = rectangle/square, moderate = L-shape or one extension, complex = many angles
- Return ONLY the JSON. No markdown. No explanation.`;

export async function POST(request) {
  try {
    const { address } = await request.json();
    if (!address?.trim()) {
      return NextResponse.json({ error: "Address required" }, { status: 400 });
    }

    const googleKey = process.env.GOOGLE_MAPS_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!googleKey || !anthropicKey) {
      return NextResponse.json({ roof_m2: 160, roof_description: "160m² default — API keys not configured", confidence: "low" });
    }

    // Step 1: Geocode the address to get lat/lng
    const geocodeRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${googleKey}`);
    const geocodeData = await geocodeRes.json();

    if (!geocodeData.results?.length) {
      return NextResponse.json({ roof_m2: 160, roof_description: "160m² default — address not found", confidence: "low" });
    }

    const { lat, lng } = geocodeData.results[0].geometry.location;

    // Step 2: Get satellite image
    // zoom=20 is the closest zoom available — gives ~0.15m per pixel, enough to clearly see roof
    // Adding a marker so Claude knows exactly which property to measure
    // scale=2 doubles the resolution (1280x1280 effective) for much clearer imagery
    const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=20&size=640x640&scale=2&maptype=satellite&markers=color:red%7C${lat},${lng}&key=${googleKey}`;
    const imageRes = await fetch(mapUrl);

    if (!imageRes.ok) {
      return NextResponse.json({ roof_m2: 160, roof_description: "160m² default — satellite image unavailable", confidence: "low" });
    }

    const imageBuffer = await imageRes.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString("base64");
    const contentType = imageRes.headers.get("content-type") || "image/png";

    // Step 3: Send satellite image to Claude vision
    const visionRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        system: VISION_PROMPT,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: contentType, data: base64Image }
            },
            {
              type: "text",
              text: `This is a satellite image of ${address} in Melbourne. Estimate the roof size of the main house only.`
            }
          ]
        }]
      })
    });

    const visionData = await visionRes.json();
    if (visionData.error) {
      return NextResponse.json({ roof_m2: 160, roof_description: "160m² default — vision failed", confidence: "low" });
    }

    const visionText = (visionData.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    let roofData = null;
    const m1 = visionText.match(/\{[\s\S]*\}/);
    if (m1) { try { roofData = JSON.parse(m1[0]); } catch {} }
    if (!roofData) {
      const stripped = visionText.replace(/```json|```/g, "").trim();
      const m2 = stripped.match(/\{[\s\S]*\}/);
      if (m2) { try { roofData = JSON.parse(m2[0]); } catch {} }
    }

    return NextResponse.json(roofData || { roof_m2: 160, roof_description: "160m² default — parse failed", confidence: "low" });

  } catch (err) {
    return NextResponse.json({ roof_m2: 160, roof_description: "160m² default — " + err.message, confidence: "low" });
  }
}
