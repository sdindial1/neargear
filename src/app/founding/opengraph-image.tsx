import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "NearGear Founding Family — Zero Fees Forever";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background:
            "linear-gradient(135deg, #ff6b35 0%, #ff8c5a 50%, #ff6b35 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#ffffff",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 900,
            height: 900,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 70%)",
            top: -150,
          }}
        />

        <div
          style={{
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <span>⭐</span>
          <span>Founding Family</span>
          <span>⭐</span>
        </div>

        <div
          style={{
            fontSize: 110,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            lineHeight: 1,
            textAlign: "center",
          }}
        >
          Zero Fees
          <br />
          Forever
        </div>

        <div
          style={{
            fontSize: 32,
            marginTop: 36,
            fontWeight: 600,
            opacity: 0.95,
          }}
        >
          Only 15 DFW Families
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 50,
            fontSize: 26,
            fontWeight: 700,
            display: "flex",
          }}
        >
          <span style={{ color: "#0d2438" }}>Near</span>
          <span style={{ color: "#ffffff" }}>Gear</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
