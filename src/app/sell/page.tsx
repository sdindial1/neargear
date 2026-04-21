"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import { PhotoUpload } from "@/components/photo-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SPORTS,
  SPORT_CATEGORIES,
  CONDITIONS,
  DFW_CITIES,
} from "@/lib/constants";
import type { AIListingAnalysis } from "@/types/ai";
import { dataUrlToBlob, resizeImage } from "@/lib/image";
import { formatCondition } from "@/lib/utils";
import {
  AlertCircle,
  ArrowLeft,
  DollarSign,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload,
} from "lucide-react";

type Step = "photos" | "processing" | "review";

const PROCESSING_STEPS = [
  "Reading your photos…",
  "Identifying the item…",
  "Grading condition…",
  "Checking DFW market prices…",
  "Writing your description…",
];

async function base64ToBlob(
  imageBase64: string,
  mimeType: string,
): Promise<Blob> {
  const res = await fetch(`data:${mimeType};base64,${imageBase64}`);
  return res.blob();
}

export default function SellPage() {
  const router = useRouter();
  const supabase = createClient();
  const pendingRef = useRef<boolean>(false);

  const [step, setStep] = useState<Step>("photos");
  const [photos, setPhotos] = useState<File[]>([]);
  const [analysis, setAnalysis] = useState<AIListingAnalysis | null>(null);
  const [processingIdx, setProcessingIdx] = useState(0);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [sport, setSport] = useState("");
  const [category, setCategory] = useState("");
  const [condition, setCondition] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const categories = sport ? SPORT_CATEGORIES[sport] || [] : [];

  useEffect(() => {
    if (step !== "processing") return;
    const interval = setInterval(() => {
      setProcessingIdx((i) => (i + 1) % PROCESSING_STEPS.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [step]);

  const handleAnalyze = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setStep("processing");
    setProcessingIdx(0);
    setError("");

    try {
      const base64Images = await Promise.all(
        photos.map((p) => resizeImage(p, 1024, 0.85)),
      );
      console.log(
        "[sell] analyze payload — images:",
        base64Images.length,
        "total KB:",
        Math.round(
          base64Images.reduce((s, u) => s + u.length, 0) * 0.75 / 1024,
        ),
      );

      const res = await fetch("/api/analyze-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: base64Images }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Analysis failed. Try clearer photos.");
        setStep("photos");
        return;
      }

      setAnalysis(data as AIListingAnalysis);
      setTitle(data.item || "");
      setSport(data.sport || "");
      setCategory(data.category || "");
      setCondition(data.condition || "");
      setAgeMin(data.ageMin != null ? String(data.ageMin) : "");
      setAgeMax(data.ageMax != null ? String(data.ageMax) : "");
      setPrice(
        data.suggestedPrice != null ? String(data.suggestedPrice) : "",
      );
      setDescription(data.description || "");
      setStep("review");
    } catch {
      setError("Something went wrong. Please try again.");
      setStep("photos");
    } finally {
      pendingRef.current = false;
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const folder = user?.id ?? "anonymous";
    const photoUrls: string[] = [];

    for (const photo of photos) {
      try {
        const dataUrl = await resizeImage(photo, 1024, 0.85);
        let uploadBlob: Blob = await dataUrlToBlob(dataUrl);
        let ext = "jpg";

        const bgRes = await fetch("/api/remove-background", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: dataUrl, mimeType: "image/jpeg" }),
        });
        if (bgRes.ok) {
          const bg = await bgRes.json();
          if (bg.bgRemoved && bg.imageBase64) {
            uploadBlob = await base64ToBlob(bg.imageBase64, bg.mimeType);
            ext = "png";
          }
        }

        const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { data: upData, error: upErr } = await supabase.storage
          .from("listings")
          .upload(fileName, uploadBlob, { contentType: uploadBlob.type });

        if (upErr) {
          console.error("Upload error:", upErr);
          continue;
        }
        const { data: urlData } = supabase.storage
          .from("listings")
          .getPublicUrl(upData.path);
        photoUrls.push(urlData.publicUrl);
      } catch (err) {
        console.error("Photo processing failed:", err);
      }
    }

    const priceInCents = Math.round(parseFloat(price || "0") * 100);
    const ageMinNum = ageMin ? parseInt(ageMin, 10) : null;
    const ageMaxNum = ageMax ? parseInt(ageMax, 10) : null;
    const ageRangeText =
      ageMinNum != null && ageMaxNum != null
        ? `${ageMinNum}-${ageMaxNum}`
        : analysis?.ageRange || null;

    const { data: listing, error: insertError } = await supabase
      .from("listings")
      .insert({
        seller_id: user?.id ?? null,
        title,
        sport,
        category,
        condition,
        price: priceInCents,
        description,
        photo_urls: photoUrls,
        status: "active",
        ai_suggested_price: analysis
          ? Math.round(analysis.suggestedPrice * 100)
          : null,
        ai_condition_grade: analysis?.condition || null,
        ai_identified_item: analysis?.item || null,
        ai_age_range: ageRangeText,
        ai_size: analysis?.size || null,
        ai_brand: analysis?.brand || null,
        ai_confidence: analysis?.confidence || null,
        city: city || null,
        age_min: ageMinNum,
        age_max: ageMaxNum,
      })
      .select("id")
      .single();

    if (insertError || !listing) {
      setError(
        insertError?.message ||
          "Could not save listing. You may need to sign in first.",
      );
      setSubmitting(false);
      return;
    }

    router.push(`/listings/${listing.id}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />

      <main className="page-with-nav flex-1">
        {step === "photos" && (
          <div className="max-w-lg mx-auto w-full px-4 py-6">
            <h1 className="font-heading text-2xl font-bold text-navy mb-1">
              Sell Your Gear
            </h1>
            <p className="text-sm text-muted-foreground mb-6">
              Take 2-5 photos. AI does the rest.
            </p>

            <PhotoUpload photos={photos} onPhotosChange={setPhotos} />

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl p-3 mt-4">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {error}
              </div>
            )}

            <Button
              onClick={handleAnalyze}
              disabled={photos.length < 2}
              className="btn-large btn-primary mt-6"
            >
              <Sparkles className="w-5 h-5" />
              {photos.length === 0
                ? "Add 2 photos to continue"
                : photos.length === 1
                  ? "Add 1 more photo"
                  : "Analyze My Item"}
            </Button>
            {photos.length > 0 && photos.length < 5 && (
              <p className="text-center text-xs text-muted-foreground mt-2">
                Add more photos for a better offer
              </p>
            )}
          </div>
        )}

        {step === "processing" && (
          <div className="fixed inset-0 z-[60] bg-navy flex flex-col items-center justify-center px-6 text-center">
            <div className="relative w-44 h-44 mb-10">
              <div className="absolute inset-0 rounded-full bg-orange/20 animate-ping" />
              <div className="absolute inset-5 rounded-full bg-orange/25 animate-pulse" />
              <div className="absolute inset-10 rounded-full ace-blob" />
            </div>

            <h2 className="font-heading text-2xl md:text-3xl font-bold text-white mb-3">
              Analyzing your item
            </h2>

            <p
              key={processingIdx}
              className="text-base text-white/85 max-w-xs min-h-[3rem] message-fade"
            >
              {PROCESSING_STEPS[processingIdx]}
            </p>

            <div className="mt-8 w-56 shimmer-bar" />
          </div>
        )}

        {step === "review" && (
          <div className="max-w-lg mx-auto w-full px-4 py-6">
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={() => setStep("photos")}
                className="p-2 rounded-full hover:bg-gray-100"
                aria-label="Back"
              >
                <ArrowLeft className="w-5 h-5 text-navy" />
              </button>
              <div>
                <h1 className="font-heading text-xl font-bold text-navy">
                  Review Listing
                </h1>
                <p className="text-xs text-muted-foreground">
                  All fields are editable
                </p>
              </div>
            </div>

            {analysis && (
              <div className="space-y-2 mb-6">
                {analysis.confidence >= 0.7 && (
                  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-xl p-3">
                    <Sparkles className="w-4 h-4" />
                    AI is {Math.round(analysis.confidence * 100)}% confident
                  </div>
                )}
                {analysis.photoQualityScore < 0.7 && (
                  <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-xl p-3">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    {analysis.photoQualityNotes ||
                      "Your photos could be better — consider retaking in better lighting."}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input
                  className="input-large"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Sport</Label>
                  <Select value={sport} onValueChange={(v) => setSport(v ?? "")}>
                    <SelectTrigger className="min-h-[44px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SPORTS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select
                    value={category}
                    onValueChange={(v) => setCategory(v ?? "")}
                  >
                    <SelectTrigger className="min-h-[44px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label>Condition</Label>
                  {analysis?.condition && (
                    <span className="text-xs text-orange font-medium">
                      AI: {formatCondition(analysis.condition)}
                    </span>
                  )}
                </div>
                <Select
                  value={condition}
                  onValueChange={(v) => setCondition(v ?? "")}
                >
                  <SelectTrigger className="min-h-[44px] bg-white">
                    <SelectValue>
                      {(v: string) => (v ? formatCondition(v) : "")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {formatCondition(c.value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Age min</Label>
                  <Input
                    type="number"
                    min="0"
                    className="min-h-[44px]"
                    value={ageMin}
                    onChange={(e) => setAgeMin(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Age max</Label>
                  <Input
                    type="number"
                    min="0"
                    className="min-h-[44px]"
                    value={ageMax}
                    onChange={(e) => setAgeMax(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Your price ($)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-navy" />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input-large pl-10 text-xl font-bold"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </div>
                {analysis?.priceRange && (
                  <p className="text-xs text-orange mt-1">
                    AI suggests ${analysis.priceRange.min}–$
                    {analysis.priceRange.max} based on DFW market
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="text-base"
                />
              </div>

              <div className="space-y-1.5">
                <Label>City</Label>
                <Select value={city} onValueChange={(v) => setCity(v ?? "")}>
                  <SelectTrigger className="min-h-[44px]">
                    <SelectValue placeholder="Pick your city" />
                  </SelectTrigger>
                  <SelectContent>
                    {DFW_CITIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 rounded-xl p-3">
                  {error}
                </div>
              )}

              <Button
                onClick={handleSubmit}
                disabled={submitting || !title || !sport || !price}
                className="btn-large btn-primary"
              >
                {submitting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Upload className="w-5 h-5" />
                )}
                Post Listing
              </Button>

              <button
                type="button"
                onClick={() => {
                  setStep("photos");
                  setAnalysis(null);
                }}
                className="w-full text-center text-sm text-muted-foreground hover:text-navy py-2 flex items-center justify-center gap-1"
              >
                <RefreshCw className="w-4 h-4" /> Retake photos
              </button>
            </div>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
