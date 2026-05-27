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
  DFW_CITIES,
} from "@/lib/constants";
import type { AIListingAnalysis } from "@/types/ai";
import { dataUrlToBlob, resizeImage } from "@/lib/image";
import { formatCondition } from "@/lib/utils";
import { ensurePublicUserRow } from "@/lib/ensure-profile";
import { isSellerSuspended } from "@/lib/strikes";
import { SuspensionScreen } from "@/components/suspension-screen";
import {
  AlertCircle,
  ArrowLeft,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

interface ProcessedPhoto {
  // Always a fully-formed data URL (`data:image/<mime>;base64,...`) so it can
  // be dropped straight into an <img src>.
  dataUrl: string;
  mimeType: string;
  // True when the bg-removal API returned a transparent PNG; false when we
  // fell back to the original JPEG (API down, rate-limited, etc.).
  bgRemoved: boolean;
}

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

const MAX_REANALYZE_PHOTOS = 7;

function SellPageInner() {
  const router = useRouter();
  const supabase = createClient();
  const pendingRef = useRef<boolean>(false);
  const reanalyzeInputRef = useRef<HTMLInputElement>(null);

  const [suspensionLoading, setSuspensionLoading] = useState(true);
  const [suspension, setSuspension] = useState<{
    suspension_ends_at: string | null;
    suspended_permanently: boolean;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (alive) setSuspensionLoading(false);
        return;
      }
      const { data } = await supabase
        .from("users")
        .select("suspension_ends_at, suspended_permanently")
        .eq("id", user.id)
        .single();
      if (alive) {
        setSuspension(
          (data as {
            suspension_ends_at: string | null;
            suspended_permanently: boolean;
          } | null) ?? null,
        );
        setSuspensionLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  const [step, setStep] = useState<Step>("photos");
  const [photos, setPhotos] = useState<File[]>([]);
  // Mirrors `photos` 1:1 — populated during the "processing" step so the
  // review page can show what's actually going to be uploaded.
  const [processedPhotos, setProcessedPhotos] = useState<ProcessedPhoto[]>([]);
  const [analysis, setAnalysis] = useState<AIListingAnalysis | null>(null);
  const [processingIdx, setProcessingIdx] = useState(0);
  const [error, setError] = useState("");
  const [showConditionInfo, setShowConditionInfo] = useState(false);

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

  const analyzePhotos = async (list: File[]) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    const fallbackStep: Step = analysis ? "review" : "photos";
    setStep("processing");
    setProcessingIdx(0);
    setError("");

    try {
      const base64Images = await Promise.all(
        list.map((p) => resizeImage(p, 1024, 0.85)),
      );
      console.log(
        "[sell] analyze payload — images:",
        base64Images.length,
        "total KB:",
        Math.round(
          base64Images.reduce((s, u) => s + u.length, 0) * 0.75 / 1024,
        ),
      );

      // Run analyze + bg-removal in parallel so the review screen has
      // bg-removed previews ready by the time we transition to it.
      const [res, processed] = await Promise.all([
        fetch("/api/analyze-listing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images: base64Images }),
        }),
        Promise.all(
          base64Images.map(async (originalDataUrl): Promise<ProcessedPhoto> => {
            try {
              const bgRes = await fetch("/api/remove-background", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  imageBase64: originalDataUrl,
                  mimeType: "image/jpeg",
                }),
              });
              if (bgRes.ok) {
                const bg = await bgRes.json();
                if (bg.bgRemoved && bg.imageBase64) {
                  return {
                    dataUrl: `data:${bg.mimeType};base64,${bg.imageBase64}`,
                    mimeType: bg.mimeType,
                    bgRemoved: true,
                  };
                }
              }
            } catch {
              // fall through to original
            }
            return {
              dataUrl: originalDataUrl,
              mimeType: "image/jpeg",
              bgRemoved: false,
            };
          }),
        ),
      ]);

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Analysis failed. Try clearer photos.");
        setStep(fallbackStep);
        return;
      }

      setAnalysis(data as AIListingAnalysis);
      setProcessedPhotos(processed);
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
      setStep(fallbackStep);
    } finally {
      pendingRef.current = false;
    }
  };

  const handleAnalyze = () => analyzePhotos(photos);

  const removeProcessedPhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
    setProcessedPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleReanalyzePhotos = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const incoming = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (incoming.length === 0) return;
    const remaining = MAX_REANALYZE_PHOTOS - photos.length;
    if (remaining <= 0) return;
    const added = incoming.slice(0, Math.min(2, remaining));
    const combined = [...photos, ...added];
    setPhotos(combined);
    analyzePhotos(combined);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await ensurePublicUserRow(supabase, user);
    }

    const folder = user?.id ?? "anonymous";
    const photoUrls: string[] = [];

    for (let i = 0; i < photos.length; i++) {
      try {
        // Prefer the already-bg-removed copy we built during analyze. If for
        // any reason that's missing (older code path, race), fall back to
        // resizing the original on the fly.
        const processed = processedPhotos[i];
        let uploadBlob: Blob;
        let ext: "png" | "jpg";
        if (processed) {
          uploadBlob = await base64ToBlob(
            processed.dataUrl.replace(/^data:[^;]+;base64,/, ""),
            processed.mimeType,
          );
          ext = processed.bgRemoved ? "png" : "jpg";
        } else {
          const dataUrl = await resizeImage(photos[i], 1024, 0.85);
          uploadBlob = await dataUrlToBlob(dataUrl);
          ext = "jpg";
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
        retail_price: analysis?.retailPrice
          ? Math.round(analysis.retailPrice * 100)
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

  if (
    !suspensionLoading &&
    suspension &&
    isSellerSuspended(suspension)
  ) {
    return (
      <SuspensionScreen
        suspensionEndsAt={suspension.suspension_ends_at}
        permanent={!!suspension.suspended_permanently}
      />
    );
  }

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
              {processedPhotos.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Your Photos</Label>
                  <p className="text-xs text-muted-foreground">
                    Photos show with backgrounds removed. If anything looks
                    cut off, tap ✕ and the &ldquo;Retake photos&rdquo; button
                    at the bottom to swap in a new shot.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {processedPhotos.map((p, i) => (
                      <div
                        key={i}
                        className="relative aspect-square rounded-lg overflow-hidden border"
                        style={{ backgroundColor: "#f5f4f0" }}
                      >
                        <img
                          src={p.dataUrl}
                          alt={`Photo ${i + 1}`}
                          className="w-full h-full"
                          style={{ objectFit: "contain" }}
                        />
                        {i === 0 && (
                          <span className="absolute top-1 left-1 bg-orange text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                            Cover
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeProcessedPhoto(i)}
                          aria-label={`Remove photo ${i + 1}`}
                          className="absolute top-1 right-1 bg-black/65 text-white rounded-full p-1 hover:bg-black/85"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                <Label>Condition</Label>
                <div className="flex items-center gap-3 bg-white rounded-xl border border-orange/20 p-4">
                  <div className="w-10 h-10 rounded-full bg-orange/10 flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="w-5 h-5 text-orange" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-heading text-lg font-bold text-navy">
                      {condition ? formatCondition(condition) : "—"}
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowConditionInfo((s) => !s)}
                      className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5"
                      aria-expanded={showConditionInfo}
                      aria-label="About AI-verified condition"
                    >
                      AI-verified condition
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {showConditionInfo && (
                  <p className="text-xs text-muted-foreground bg-gray-100 rounded-lg p-3 leading-relaxed">
                    Our AI analyzes your photos to determine the condition
                    grade for buyer trust.
                  </p>
                )}
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

              {analysis?.suggestedPrice != null && (
                <div className="bg-orange/5 border border-orange/20 rounded-xl p-4 space-y-1 mb-2">
                  <p className="font-heading text-2xl font-bold text-orange">
                    AI Suggests ${analysis.suggestedPrice}
                  </p>
                  {analysis.priceRange && (
                    <p className="text-sm text-muted-foreground">
                      Market range: ${analysis.priceRange.min}–$
                      {analysis.priceRange.max} in DFW
                    </p>
                  )}
                  {photos.length < MAX_REANALYZE_PHOTOS && (
                    <button
                      type="button"
                      onClick={() => reanalyzeInputRef.current?.click()}
                      className="flex items-center gap-1.5 text-xs text-orange underline underline-offset-2 pt-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Offer seem low? Add more photos for a better analysis
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-1.5 mt-2">
                <Label>Your Price</Label>
                <div className="relative">
                  <span
                    className="absolute left-4 top-1/2 text-3xl font-semibold text-navy pointer-events-none leading-none"
                    style={{ transform: "translateY(-50%)" }}
                  >
                    $
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0"
                    className="input-large text-3xl font-semibold tabular-nums text-left"
                    // input-large sets `padding: 0 16px` via globals.css —
                    // beats Tailwind's pl-12 due to source order. Force the
                    // padding inline so the typed value clears the $ glyph.
                    style={{ paddingLeft: "44px", paddingRight: "16px" }}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </div>
              </div>

              <input
                ref={reanalyzeInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleReanalyzePhotos}
                style={{
                  position: "absolute",
                  width: 1,
                  height: 1,
                  padding: 0,
                  margin: -1,
                  overflow: "hidden",
                  clip: "rect(0, 0, 0, 0)",
                  opacity: 0,
                }}
                aria-hidden="true"
                tabIndex={-1}
              />

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
                disabled={
                  submitting || !title || !sport || !price || !condition
                }
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
                  setProcessedPhotos([]);
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

import { AuthGate } from "@/components/auth-gate";

export default function SellPage() {
  return (
    <AuthGate reason="Sign in to list your gear and start earning.">
      <SellPageInner />
    </AuthGate>
  );
}
