import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "NearGear — Buy & Sell Youth Sports Gear in DFW";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #071520 0%, #0d2438 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 700,
            height: 700,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(255,107,53,0.28) 0%, rgba(255,107,53,0) 70%)",
            top: 60,
          }}
        />

        <div
          style={{
            fontSize: 140,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            display: "flex",
            lineHeight: 1,
          }}
        >
          <span style={{ color: "#ffffff" }}>Near</span>
          <span style={{ color: "#ff6b35" }}>Gear</span>
        </div>

        <div
          style={{
            fontSize: 38,
            color: "#a8c4d8",
            marginTop: 28,
            fontWeight: 500,
          }}
        >
          Buy & Sell Youth Sports Gear · DFW
        </div>

        <div
          style={{
            fontSize: 24,
            color: "#ff8c5a",
            marginTop: 44,
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
        >
          Free to list. Only pay when you sell.
        </div>
      </div>
    ),
    { ...size },
  );
}
