import { NextRequest } from "next/server";

type Body = {
  imageBase64?: string;
  mimeType?: string;
  image?: string;
};

function stripDataUrl(input: string): { data: string; mimeType: string } {
  const match = input.match(/^data:(image\/\w+);base64,(.+)$/);
  if (match) return { data: match[2], mimeType: match[1] };
  return { data: input, mimeType: "image/png" };
}

function respond(imageBase64: string, mimeType: string, bgRemoved: boolean) {
  return Response.json(
    { imageBase64, mimeType, bgRemoved },
    { headers: { "X-BG-Removed": String(bgRemoved) } }
  );
}

export async function POST(request: NextRequest) {
  const body: Body = await request.json();

  const raw = body.imageBase64 ?? body.image;
  if (!raw) {
    return Response.json({ error: "imageBase64 is required" }, { status: 400 });
  }

  const { data: inputData, mimeType: detectedMime } = stripDataUrl(raw);
  const inputMime = body.mimeType || detectedMime;

  const apiKey = process.env.REMOVEBG_API_KEY;

  if (!apiKey) {
    return respond(inputData, inputMime, false);
  }

  try {
    const buffer = Buffer.from(inputData, "base64");
    const blob = new Blob([new Uint8Array(buffer)], { type: inputMime });

    const formData = new FormData();
    formData.append("image_file", blob, "image.png");
    formData.append("size", "auto");
    formData.append("bg_color", "ffffff");

    const response = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": apiKey },
      body: formData,
    });

    if (!response.ok) {
      console.error("remove.bg error:", await response.text());
      return respond(inputData, inputMime, false);
    }

    const resultBuffer = await response.arrayBuffer();
    const base64Result = Buffer.from(resultBuffer).toString("base64");
    return respond(base64Result, "image/png", true);
  } catch (err) {
    console.error("Background removal error:", err);
    return respond(inputData, inputMime, false);
  }
}
