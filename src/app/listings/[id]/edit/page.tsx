"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import { AuthGate } from "@/components/auth-gate";
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
  CONDITIONS,
  SPORTS,
  SPORT_CATEGORIES,
} from "@/lib/constants";
import { sanitizeText, LIMITS } from "@/lib/sanitize";
import { dataUrlToBlob, resizeImage } from "@/lib/image";
import { MAX_PHOTOS, validatePhotos } from "@/lib/photo-upload";
import {
  ChevronLeft,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
  AlertTriangle,
} from "lucide-react";
import type { Listing } from "@/types/database";


function ListingEditInner({ id }: { id: string }) {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [listing, setListing] = useState<Listing | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [sport, setSport] = useState("");
  const [category, setCategory] = useState("");
  const [condition, setCondition] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error: loadError } = await supabase
        .from("listings")
        .select("*")
        .eq("id", id)
        .single();

      if (loadError || !data) {
        setError("Listing not found.");
        setLoading(false);
        return;
      }

      const l = data as Listing;
      if (l.seller_id !== user.id) {
        setError("You don't own this listing.");
        setLoading(false);
        return;
      }

      setListing(l);
      setPhotoUrls(l.photo_urls || []);
      setTitle(l.title || "");
      setSport(l.sport || "");
      setCategory(l.category || "");
      setCondition(l.condition || "");
      setPrice(l.price ? (l.price / 100).toFixed(2) : "");
      setDescription(l.description || "");
      setLoading(false);
    }
    load();
  }, [id]);

  const categories = sport ? SPORT_CATEGORIES[sport] || [] : [];

  const handleAddPhoto = () => {
    if (photoUrls.length >= MAX_PHOTOS) {
      toast.error(`Max ${MAX_PHOTOS} photos`);
      return;
    }
    fileInputRef.current?.click();
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !listing) return;

    const { valid, errors } = validatePhotos(files, photoUrls.length);
    for (const err of errors) toast.error(err, { duration: 4000 });
    if (e.target) e.target.value = "";
    if (!valid.length) return;

    setUploading(true);
    const newUrls: string[] = [];

    for (const file of valid) {
      try {
        const dataUrl = await resizeImage(file, 1024, 0.85);
        const blob = await dataUrlToBlob(dataUrl);
        const fileName = `${listing.seller_id}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}.jpg`;
        const { data: upData, error: upErr } = await supabase.storage
          .from("listings")
          .upload(fileName, blob, { contentType: "image/jpeg" });
        if (upErr) {
          console.error("Upload error:", upErr);
          continue;
        }
        const { data: urlData } = supabase.storage
          .from("listings")
          .getPublicUrl(upData.path);
        newUrls.push(urlData.publicUrl);
      } catch (err) {
        console.error("Resize/upload failed:", err);
      }
    }

    if (newUrls.length) {
      setPhotoUrls((prev) => [...prev, ...newUrls]);
      toast.success(`Added ${newUrls.length} photo${newUrls.length > 1 ? "s" : ""}`);
    }
    setUploading(false);
  };

  const removePhoto = (idx: number) => {
    setPhotoUrls((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const safeTitle = sanitizeText(title, LIMITS.LISTING_TITLE);
    const safeDesc = sanitizeText(description, LIMITS.LISTING_DESCRIPTION);

    if (!safeTitle) {
      setError("Title is required.");
      return;
    }
    if (photoUrls.length < 2) {
      setError("Listings need at least 2 photos.");
      return;
    }
    const priceNum = parseFloat(price);
    if (!priceNum || priceNum <= 0) {
      setError("Enter a valid price.");
      return;
    }

    setSaving(true);

    const { error: updateError } = await supabase
      .from("listings")
      .update({
        title: safeTitle,
        sport,
        category,
        condition,
        price: Math.round(priceNum * 100),
        description: safeDesc,
        photo_urls: photoUrls,
      })
      .eq("id", id);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    toast.success("Listing updated");
    router.push(`/listings/${id}`);
    router.refresh();
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    const { error: deleteError } = await supabase
      .from("listings")
      .update({ status: "removed" })
      .eq("id", id);

    if (deleteError) {
      toast.error(deleteError.message);
      setDeleting(false);
      return;
    }
    toast.success("Listing deleted");
    router.push("/profile");
    router.refresh();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <main className="page-with-nav flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-orange" />
        </main>
        <BottomNav />
      </div>
    );
  }

  if (error && !listing) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <main className="page-with-nav flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <AlertTriangle className="w-12 h-12 mx-auto text-orange mb-3" />
            <p className="text-navy font-semibold">{error}</p>
            <Link
              href="/profile"
              className="text-sm text-orange mt-3 inline-block"
            >
              Back to profile
            </Link>
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="page-with-nav flex-1">
        <div className="max-w-md mx-auto w-full px-4 py-6">
          <Link
            href={`/listings/${id}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4"
          >
            <ChevronLeft className="w-4 h-4" /> Back to listing
          </Link>

          <h1 className="font-heading text-2xl font-bold text-navy mb-6">
            Edit Listing
          </h1>

          <form
            onSubmit={handleSave}
            className="space-y-5 bg-white rounded-2xl p-5 shadow-sm"
          >
            {/* Photos */}
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <Label>Photos</Label>
                <span
                  className={`text-xs font-semibold tabular-nums ${
                    photoUrls.length >= MAX_PHOTOS
                      ? "text-orange"
                      : photoUrls.length >= 8
                        ? "text-orange"
                        : "text-muted-foreground"
                  }`}
                >
                  {photoUrls.length >= MAX_PHOTOS
                    ? "Max photos reached"
                    : `${photoUrls.length} / ${MAX_PHOTOS} photos`}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {photoUrls.map((url, i) => (
                  <div
                    key={`${url}-${i}`}
                    className="relative aspect-square rounded-xl overflow-hidden bg-gray-100"
                  >
                    <Image
                      src={url}
                      alt={`Photo ${i + 1}`}
                      fill
                      sizes="(max-width: 768px) 33vw, 200px"
                      className="object-cover"
                      unoptimized
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute top-1 right-1 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white"
                      aria-label="Remove photo"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    {i === 0 && (
                      <span className="absolute bottom-1 left-1 text-[10px] font-semibold bg-orange text-white px-1.5 py-0.5 rounded">
                        COVER
                      </span>
                    )}
                  </div>
                ))}
                {photoUrls.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    onClick={handleAddPhoto}
                    disabled={uploading}
                    className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-muted-foreground hover:border-orange hover:text-orange transition-colors disabled:opacity-60"
                  >
                    {uploading ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <Plus className="w-6 h-6" />
                    )}
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={handlePhotoChange}
              />
              <p className="text-xs text-muted-foreground">
                The first photo is the cover. Tap × to remove.
              </p>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                className="input-large"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={LIMITS.LISTING_TITLE}
                required
              />
            </div>

            {/* Sport / Category */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Sport</Label>
                <Select
                  value={sport}
                  onValueChange={(v) => {
                    setSport(v ?? "");
                    setCategory("");
                  }}
                >
                  <SelectTrigger className="min-h-[52px]">
                    <SelectValue placeholder="Sport" />
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
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={category}
                  onValueChange={(v) => setCategory(v ?? "")}
                  disabled={!sport}
                >
                  <SelectTrigger className="min-h-[52px]">
                    <SelectValue placeholder="Category" />
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

            {/* Condition */}
            <div className="space-y-2">
              <Label>Condition</Label>
              <Select
                value={condition}
                onValueChange={(v) => setCondition(v ?? "")}
              >
                <SelectTrigger className="min-h-[52px]">
                  <SelectValue placeholder="Condition" />
                </SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Price */}
            <div className="space-y-2">
              <Label htmlFor="price">Price</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-3xl font-bold text-navy tabular-nums">
                  $
                </span>
                <Input
                  id="price"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="1"
                  className="input-large !text-3xl !font-bold tabular-nums pl-10"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={LIMITS.LISTING_DESCRIPTION}
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="btn-large btn-primary"
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Save className="w-5 h-5" />
              )}
              Save Changes
            </Button>
          </form>

          {/* Danger zone */}
          <div className="mt-6 bg-white rounded-2xl p-5 shadow-sm border border-red-100">
            <h2 className="font-heading text-sm font-bold text-red-600 mb-2">
              Danger Zone
            </h2>
            <p className="text-xs text-muted-foreground mb-3">
              Deleting hides this listing from buyers. Active requests may be
              affected.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={handleDelete}
              disabled={deleting}
              className="w-full min-h-[48px] border-red-300 text-red-600 hover:bg-red-50"
            >
              {deleting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Trash2 className="w-5 h-5" />
              )}
              {confirmDelete ? "Tap again to confirm delete" : "Delete Listing"}
            </Button>
          </div>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}

export default function ListingEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AuthGate reason="Sign in to edit your listing.">
      <ListingEditInner id={id} />
    </AuthGate>
  );
}
