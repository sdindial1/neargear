"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { calculateDeposit } from "@/lib/fees";
import {
  getAllZonesByCombinedDistance,
  getSuggestedMeetupLocationsByZip,
  getZoneTypeEmoji,
  getZoneTypeLabel,
  type SafeZone,
  type SuggestedZone,
} from "@/lib/safezones";
import { isValidZipcodeFormat } from "@/lib/zipcodes";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Home,
  ImageIcon,
  Loader2,
  MapPin,
  Plus,
  ShieldCheck,
} from "lucide-react";
import type { Listing, User } from "@/types/database";

type OfferType = "full_price" | "minus_10" | "minus_15" | "custom";
type Step = 1 | 2 | 3 | 4;

type SelectedLocation =
  | { type: "safe_zone"; zone: SafeZone }
  | { type: "custom"; name: string; address: string; note: string }
  | { type: "home_buyer"; address: string }
  | { type: "home_seller" };

interface TimeWindow {
  id: string;
  label: string;
  short: string;
  startHour: number;
  endHour: number;
}

const TIME_WINDOWS: TimeWindow[] = [
  { id: "morning", label: "Morning (8am – 10am)", short: "Morning", startHour: 8, endHour: 10 },
  { id: "late-morning", label: "Late Morning (10am – 12pm)", short: "Late Morning", startHour: 10, endHour: 12 },
  { id: "early-afternoon", label: "Early Afternoon (12pm – 2pm)", short: "Early Afternoon", startHour: 12, endHour: 14 },
  { id: "afternoon", label: "Afternoon (2pm – 4pm)", short: "Afternoon", startHour: 14, endHour: 16 },
  { id: "late-afternoon", label: "Late Afternoon (4pm – 6pm)", short: "Late Afternoon", startHour: 16, endHour: 18 },
  { id: "evening", label: "Evening (6pm – 8pm)", short: "Evening", startHour: 18, endHour: 20 },
];

type ListingWithSeller = Listing & {
  seller?: Pick<User, "id" | "full_name" | "city"> & { zipcode?: string | null };
};

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

function locationIsValid(loc: SelectedLocation | null): boolean {
  if (!loc) return false;
  if (loc.type === "safe_zone") return !!loc.zone;
  if (loc.type === "custom")
    return loc.name.trim().length > 0 && loc.address.trim().length > 0;
  if (loc.type === "home_buyer") return loc.address.trim().length > 0;
  if (loc.type === "home_seller") return true;
  return false;
}

function locationLabel(loc: SelectedLocation): string {
  if (loc.type === "safe_zone") return loc.zone.name;
  if (loc.type === "custom") return loc.name;
  if (loc.type === "home_buyer") return "Your home";
  return "Seller's home";
}

function RequestToBuyPageInner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);

  const [listing, setListing] = useState<ListingWithSeller | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserZipcode, setCurrentUserZipcode] = useState<string | null>(
    null,
  );

  const [step, setStep] = useState<Step>(1);

  const [offerType, setOfferType] = useState<OfferType>("full_price");
  const [customOffer, setCustomOffer] = useState("");
  const [showCustomOffer, setShowCustomOffer] = useState(false);

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedWindow, setSelectedWindow] = useState<TimeWindow | null>(null);

  const [selectedLocation, setSelectedLocation] =
    useState<SelectedLocation | null>(null);

  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data: listingRow, error } = await supabase
        .from("listings")
        .select("*, seller:users!seller_id(id, full_name, city, zipcode)")
        .eq("id", params.id)
        .single();

      if (error || !listingRow) {
        setLoadError("Listing not found.");
        setLoading(false);
        return;
      }

      if (listingRow.status !== "active") {
        setLoadError("This listing is no longer available.");
        setLoading(false);
        return;
      }

      setListing(listingRow as ListingWithSeller);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const { data: profile } = await supabase
          .from("users")
          .select("zipcode")
          .eq("id", user.id)
          .single();
        if (profile?.zipcode) setCurrentUserZipcode(profile.zipcode);
      }

      setLoading(false);
    };
    load();
  }, [params.id, supabase]);

  const listingPriceCents = listing?.price ?? 0;
  const listingPriceDollars = listingPriceCents / 100;
  const minOfferDollars = Math.ceil(listingPriceDollars * 0.8 * 100) / 100;

  const offeredPriceDollars = useMemo(() => {
    if (offerType === "full_price") return listingPriceDollars;
    if (offerType === "minus_10")
      return Math.round(listingPriceDollars * 0.9 * 100) / 100;
    if (offerType === "minus_15")
      return Math.round(listingPriceDollars * 0.85 * 100) / 100;
    const v = parseFloat(customOffer);
    return Number.isFinite(v) ? v : 0;
  }, [offerType, customOffer, listingPriceDollars]);

  const offeredPriceCents = Math.round(offeredPriceDollars * 100);
  const depositCents = listing ? calculateDeposit(offeredPriceCents) : 0;
  const depositDollars = depositCents / 100;
  const remainingDollars =
    Math.round((offeredPriceDollars - depositDollars) * 100) / 100;

  const customOfferValid =
    offerType !== "custom" ||
    (Number.isFinite(parseFloat(customOffer)) &&
      parseFloat(customOffer) >= minOfferDollars &&
      parseFloat(customOffer) <= listingPriceDollars);

  const sellerZipcode = listing?.seller?.zipcode || null;

  const recommendedSuggestions = useMemo(() => {
    if (!listing) return [];
    return getSuggestedMeetupLocationsByZip(
      currentUserZipcode,
      sellerZipcode,
      3,
    );
  }, [listing, currentUserZipcode, sellerZipcode]);

  const allSuggestionsSorted = useMemo(() => {
    if (!listing) return [];
    return getAllZonesByCombinedDistance(currentUserZipcode, sellerZipcode);
  }, [listing, currentUserZipcode, sellerZipcode]);

  const needsZipcodePrompt = !!currentUserId && !currentUserZipcode;

  const saveZipcode = async (zip: string) => {
    if (!currentUserId) return;
    if (!isValidZipcodeFormat(zip)) return;
    const { error } = await supabase
      .from("users")
      .update({ zipcode: zip })
      .eq("id", currentUserId);
    if (!error) setCurrentUserZipcode(zip);
  };

  const next14Days = useMemo(() => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i + 1);
      return d;
    });
  }, []);

  const canAdvance =
    (step === 1 && customOfferValid && offeredPriceDollars > 0) ||
    (step === 2 && !!selectedDate && !!selectedWindow) ||
    (step === 3 && locationIsValid(selectedLocation)) ||
    (step === 4 && agreed && !submitting);

  const handleSubmit = async () => {
    if (!listing || !selectedDate || !selectedWindow || !selectedLocation)
      return;
    setSubmitting(true);
    setSubmitError("");

    const start = new Date(selectedDate);
    start.setHours(selectedWindow.startHour, 0, 0, 0);
    const end = new Date(selectedDate);
    end.setHours(selectedWindow.endHour, 0, 0, 0);

    let payload: Record<string, unknown> = {};
    if (selectedLocation.type === "safe_zone") {
      const z = selectedLocation.zone;
      payload = {
        type: "safe_zone",
        safeZoneId: z.id,
        name: z.name,
        address: z.address,
        city: z.city,
        state: z.state,
        zip: z.zip,
        lat: z.lat,
        lng: z.lng,
      };
    } else if (selectedLocation.type === "custom") {
      payload = {
        type: "custom",
        name: selectedLocation.name.trim(),
        address: selectedLocation.address.trim(),
        note: selectedLocation.note.trim() || undefined,
      };
    } else if (selectedLocation.type === "home_buyer") {
      payload = {
        type: "home_buyer",
        address: selectedLocation.address.trim(),
      };
    } else {
      payload = { type: "home_seller" };
    }

    const { data: meetup, error: insErr } = await supabase
      .from("meetups")
      .insert({
        listing_id: listing.id,
        buyer_id: currentUserId,
        seller_id: listing.seller_id,
        offered_price: offeredPriceCents,
        offer_type: offerType,
        meetup_window_start: start.toISOString(),
        meetup_window_end: end.toISOString(),
        meetup_location: JSON.stringify(payload),
        deposit_amount: depositCents,
        status: "requested",
      })
      .select("id")
      .single();

    if (insErr || !meetup) {
      setSubmitError(
        insErr?.message ||
          "Could not send your request. Please try again or sign in.",
      );
      setSubmitting(false);
      return;
    }

    await supabase
      .from("listings")
      .update({ status: "pending" })
      .eq("id", listing.id);

    router.push(`/meetups/${meetup.id}/confirmation`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-orange" />
        </main>
      </div>
    );
  }

  if (loadError || !listing) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <AlertCircle className="w-12 h-12 text-orange mb-4" />
          <p className="font-heading text-lg font-bold text-navy mb-2">
            {loadError || "Something went wrong"}
          </p>
          <Button
            className="btn-large btn-primary max-w-xs mt-6"
            onClick={() => router.push("/browse")}
          >
            Browse other listings
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="sticky top-0 z-40 bg-white border-b">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => (step === 1 ? router.back() : setStep((s) => (s - 1) as Step))}
            className="p-2 rounded-full hover:bg-gray-100"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-navy" />
          </button>
          <div className="flex-1">
            <p className="font-heading text-sm font-bold text-navy">
              Step {step} of 4
            </p>
            <div className="flex gap-1 mt-1">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className={`h-1 flex-1 rounded-full ${
                    n <= step ? "bg-orange" : "bg-gray-200"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-28">
        <div className="max-w-lg mx-auto w-full px-4 py-5">
          {step === 1 && (
            <StepOffer
              listingPriceDollars={listingPriceDollars}
              offerType={offerType}
              setOfferType={setOfferType}
              showCustom={showCustomOffer}
              setShowCustom={setShowCustomOffer}
              customOffer={customOffer}
              setCustomOffer={setCustomOffer}
              minOfferDollars={minOfferDollars}
              customValid={customOfferValid}
            />
          )}
          {step === 2 && (
            <StepTime
              days={next14Days}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              selectedWindow={selectedWindow}
              setSelectedWindow={setSelectedWindow}
            />
          )}
          {step === 3 && (
            <StepLocation
              recommendedSuggestions={recommendedSuggestions}
              allSuggestions={allSuggestionsSorted}
              selectedLocation={selectedLocation}
              setSelectedLocation={setSelectedLocation}
              needsZipcodePrompt={needsZipcodePrompt}
              onSaveZipcode={saveZipcode}
            />
          )}
          {step === 4 && (
            <StepReview
              listing={listing}
              offeredPriceDollars={offeredPriceDollars}
              listingPriceDollars={listingPriceDollars}
              depositDollars={depositDollars}
              remainingDollars={remainingDollars}
              selectedDate={selectedDate!}
              selectedWindow={selectedWindow!}
              selectedLocation={selectedLocation!}
              agreed={agreed}
              setAgreed={setAgreed}
              error={submitError}
            />
          )}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-3">
        <div className="max-w-lg mx-auto">
          <Button
            onClick={() => {
              if (step < 4) setStep((step + 1) as Step);
              else handleSubmit();
            }}
            disabled={!canAdvance}
            className="btn-large btn-primary"
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : step < 4 ? (
              <>
                Next <ChevronRight className="w-5 h-5" />
              </>
            ) : (
              "Send Request to Seller"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StepOffer({
  listingPriceDollars,
  offerType,
  setOfferType,
  showCustom,
  setShowCustom,
  customOffer,
  setCustomOffer,
  minOfferDollars,
  customValid,
}: {
  listingPriceDollars: number;
  offerType: OfferType;
  setOfferType: (t: OfferType) => void;
  showCustom: boolean;
  setShowCustom: (b: boolean) => void;
  customOffer: string;
  setCustomOffer: (s: string) => void;
  minOfferDollars: number;
  customValid: boolean;
}) {
  const lightOffer = Math.round(listingPriceDollars * 0.9 * 100) / 100;
  const moderateOffer = Math.round(listingPriceDollars * 0.85 * 100) / 100;

  const Card = ({
    type,
    amount,
    label,
    sub,
    sub2,
    primary,
  }: {
    type: OfferType;
    amount: number;
    label: string;
    sub: string;
    sub2?: string;
    primary?: boolean;
  }) => {
    const selected = offerType === type;
    return (
      <button
        type="button"
        onClick={() => {
          setOfferType(type);
          if (type !== "custom") setShowCustom(false);
        }}
        className={`w-full text-left rounded-2xl border-2 p-4 bg-white transition-colors ${
          selected
            ? "border-orange shadow-[0_0_0_4px_rgba(255,107,53,0.1)]"
            : "border-gray-200"
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              primary
                ? "bg-green-100 text-green-700"
                : "bg-orange/10 text-orange"
            }`}
          >
            {primary ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <span className="font-bold">%</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-heading text-2xl font-bold text-navy tabular-nums">
              Offer {formatMoney(amount)}
            </p>
            <p className="text-sm font-semibold text-navy mt-0.5">{label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            {sub2 && (
              <p className="text-xs text-muted-foreground">{sub2}</p>
            )}
          </div>
        </div>
      </button>
    );
  };

  return (
    <>
      <h1 className="font-heading text-2xl font-bold text-navy mb-1">
        Make Your Offer
      </h1>
      <p className="text-sm text-muted-foreground mb-4">
        Choose an offer amount
      </p>

      <div className="bg-navy/5 rounded-xl px-4 py-3 mb-4">
        <p className="text-xs text-muted-foreground">Listed at</p>
        <p className="font-heading text-xl font-bold text-navy tabular-nums">
          {formatMoney(listingPriceDollars)}
        </p>
      </div>

      <div className="space-y-3">
        <Card
          type="full_price"
          amount={listingPriceDollars}
          label="Full Price"
          sub="⚡ Fastest seller response"
          sub2="Most likely to be accepted"
          primary
        />
        <Card
          type="minus_10"
          amount={lightOffer}
          label="Friendly Offer"
          sub="10% off · Usually accepted"
        />
        <Card
          type="minus_15"
          amount={moderateOffer}
          label="Haggle"
          sub="15% off · Seller may counter"
        />
      </div>

      <button
        type="button"
        onClick={() => {
          const next = !showCustom;
          setShowCustom(next);
          if (next) setOfferType("custom");
        }}
        className="mt-4 text-sm text-orange font-medium"
      >
        {showCustom ? "Hide custom offer" : "Make a custom offer"}
      </button>

      {showCustom && (
        <div className="mt-3 rounded-2xl border-2 border-orange/40 bg-white p-4 space-y-2">
          <p className="text-sm font-semibold text-navy">Your custom offer</p>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-semibold text-navy pointer-events-none leading-none">
              $
            </span>
            <Input
              type="number"
              inputMode="decimal"
              min={minOfferDollars}
              max={listingPriceDollars}
              step="0.01"
              placeholder="0"
              value={customOffer}
              onChange={(e) => {
                setCustomOffer(e.target.value);
                setOfferType("custom");
              }}
              className="input-large pl-12 pr-4 text-2xl font-semibold tabular-nums text-left"
            />
          </div>
          <p
            className={`text-xs ${
              !customValid && customOffer
                ? "text-red-600"
                : "text-muted-foreground"
            }`}
          >
            Minimum offer {formatMoney(minOfferDollars)} · Maximum{" "}
            {formatMoney(listingPriceDollars)}
          </p>
        </div>
      )}
    </>
  );
}

function StepTime({
  days,
  selectedDate,
  setSelectedDate,
  selectedWindow,
  setSelectedWindow,
}: {
  days: Date[];
  selectedDate: Date | null;
  setSelectedDate: (d: Date) => void;
  selectedWindow: TimeWindow | null;
  setSelectedWindow: (w: TimeWindow) => void;
}) {
  return (
    <>
      <h1 className="font-heading text-2xl font-bold text-navy mb-1">
        When Works for You?
      </h1>
      <p className="text-sm text-muted-foreground mb-4">
        Pick a 2-hour window — firm up exact time via message after seller
        accepts.
      </p>

      {selectedDate && selectedWindow && (
        <div className="bg-orange/5 border border-orange/20 rounded-xl p-3 mb-4">
          <p className="text-sm font-semibold text-orange">
            {selectedDate.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}{" "}
            · {selectedWindow.short}
          </p>
        </div>
      )}

      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Pick a date
      </p>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-5">
        {days.map((d) => {
          const isSelected =
            selectedDate && d.getTime() === selectedDate.getTime();
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => setSelectedDate(d)}
              className={`flex-shrink-0 w-16 rounded-xl border-2 p-2 text-center bg-white transition-colors ${
                isSelected ? "border-orange" : "border-gray-200"
              }`}
            >
              <p className="text-[11px] font-semibold text-muted-foreground uppercase">
                {d.toLocaleDateString("en-US", { weekday: "short" })}
              </p>
              <p className="font-heading text-xl font-bold text-navy mt-0.5">
                {d.getDate()}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {d.toLocaleDateString("en-US", { month: "short" })}
              </p>
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Pick a window
          </p>
          <div className="space-y-2">
            {TIME_WINDOWS.map((w) => {
              const selected = selectedWindow?.id === w.id;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setSelectedWindow(w)}
                  className={`w-full text-left rounded-xl border-2 p-3 bg-white transition-colors ${
                    selected ? "border-orange" : "border-gray-200"
                  }`}
                >
                  <p className="font-semibold text-navy">{w.label}</p>
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function ZoneCard({
  suggestion,
  selected,
  onSelect,
  showDistance,
}: {
  suggestion: SuggestedZone;
  selected: boolean;
  onSelect: () => void;
  showDistance: boolean;
}) {
  const z = suggestion.zone;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-2xl border-2 p-4 bg-white transition-colors ${
        selected ? "border-orange" : "border-gray-200"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="text-3xl leading-none">{getZoneTypeEmoji(z.type)}</div>
        <div className="flex-1 min-w-0">
          <p className="font-heading text-base font-bold text-navy">
            {z.name}
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {z.address}, {z.city}, {z.state} {z.zip}
          </p>
          {showDistance && (
            <p className="text-xs text-orange font-medium mt-1 tabular-nums">
              {suggestion.buyerMiles.toFixed(1)} mi from you ·{" "}
              {suggestion.sellerMiles.toFixed(1)} mi from seller
            </p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-[11px] text-muted-foreground">
              {getZoneTypeLabel(z.type)}
            </span>
            <span className="inline-flex items-center gap-1 bg-orange/10 text-orange text-[11px] font-semibold rounded-full px-2 py-0.5">
              <ShieldCheck className="w-3 h-3" />
              {z.badge}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function StepLocation({
  recommendedSuggestions,
  allSuggestions,
  selectedLocation,
  setSelectedLocation,
  needsZipcodePrompt,
  onSaveZipcode,
}: {
  recommendedSuggestions: SuggestedZone[];
  allSuggestions: SuggestedZone[];
  selectedLocation: SelectedLocation | null;
  setSelectedLocation: (l: SelectedLocation | null) => void;
  needsZipcodePrompt: boolean;
  onSaveZipcode: (zip: string) => Promise<void>;
}) {
  const [showAllZones, setShowAllZones] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [showHomeFlow, setShowHomeFlow] = useState(false);

  const [customName, setCustomName] = useState("");
  const [customAddress, setCustomAddress] = useState("");
  const [customNote, setCustomNote] = useState("");

  const [homeAcked, setHomeAcked] = useState(false);
  const [homeOption, setHomeOption] = useState<"buyer" | "seller">("buyer");
  const [buyerHomeAddress, setBuyerHomeAddress] = useState("");

  const [zipDraft, setZipDraft] = useState("");
  const [savingZip, setSavingZip] = useState(false);

  const recommendedIds = new Set(
    recommendedSuggestions.map((s) => s.zone.id),
  );
  const additionalSuggestions = allSuggestions.filter(
    (s) => !recommendedIds.has(s.zone.id),
  );
  const showDistance =
    recommendedSuggestions.length > 0 &&
    recommendedSuggestions[0].combined > 0;

  const isSelectedZone = (id: string) =>
    selectedLocation?.type === "safe_zone" &&
    selectedLocation.zone.id === id;

  const confirmCustom = () => {
    setSelectedLocation({
      type: "custom",
      name: customName,
      address: customAddress,
      note: customNote,
    });
  };

  const confirmHome = () => {
    if (homeOption === "buyer") {
      setSelectedLocation({ type: "home_buyer", address: buyerHomeAddress });
    } else {
      setSelectedLocation({ type: "home_seller" });
    }
  };

  return (
    <>
      <h1 className="font-heading text-2xl font-bold text-navy mb-1">
        Where Should You Meet?
      </h1>
      <p className="text-sm text-muted-foreground mb-4">
        Pick a public safe zone, suggest a different spot, or arrange a home
        meet.
      </p>

      {selectedLocation && (
        <div className="bg-orange/5 border border-orange/20 rounded-xl p-3 mb-4 flex items-start gap-2">
          <CheckCircle2 className="w-5 h-5 text-orange flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-orange">
              {locationLabel(selectedLocation)}
            </p>
            {selectedLocation.type === "custom" && (
              <p className="text-xs text-muted-foreground">
                Custom location · {selectedLocation.address}
              </p>
            )}
            {selectedLocation.type === "home_buyer" && (
              <p className="text-xs text-muted-foreground">
                Your home · {selectedLocation.address || "address pending"}
              </p>
            )}
            {selectedLocation.type === "home_seller" && (
              <p className="text-xs text-muted-foreground">
                Seller will share address after accepting
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSelectedLocation(null)}
            className="text-xs text-muted-foreground"
          >
            Change
          </button>
        </div>
      )}

      {needsZipcodePrompt && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 space-y-2">
          <p className="text-sm font-semibold text-amber-900">
            We need your zipcode to find safe meetup spots near you.
          </p>
          <div className="flex gap-2">
            <Input
              type="text"
              inputMode="numeric"
              maxLength={5}
              placeholder="5-digit zipcode"
              value={zipDraft}
              onChange={(e) =>
                setZipDraft(e.target.value.replace(/\D/g, "").slice(0, 5))
              }
              className="input-large flex-1 tabular-nums"
            />
            <Button
              type="button"
              disabled={!isValidZipcodeFormat(zipDraft) || savingZip}
              onClick={async () => {
                setSavingZip(true);
                await onSaveZipcode(zipDraft);
                setSavingZip(false);
              }}
              className="btn-primary px-5 h-[52px]"
            >
              {savingZip ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      )}

      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Recommended Safe Zones
      </p>
      <div className="space-y-3">
        {recommendedSuggestions.map((s) => (
          <ZoneCard
            key={s.zone.id}
            suggestion={s}
            selected={isSelectedZone(s.zone.id)}
            onSelect={() =>
              setSelectedLocation({ type: "safe_zone", zone: s.zone })
            }
            showDistance={showDistance}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setShowAllZones((v) => !v)}
        className="mt-4 w-full flex items-center justify-between bg-white border-2 border-gray-200 rounded-2xl p-4 text-left"
      >
        <span className="text-sm font-semibold text-navy">
          See all safe zones in your area
        </span>
        {showAllZones ? (
          <ChevronUp className="w-5 h-5 text-navy" />
        ) : (
          <ChevronDown className="w-5 h-5 text-navy" />
        )}
      </button>

      {showAllZones && (
        <div className="space-y-3 mt-3">
          {additionalSuggestions.map((s) => (
            <ZoneCard
              key={s.zone.id}
              suggestion={s}
              selected={isSelectedZone(s.zone.id)}
              onSelect={() =>
                setSelectedLocation({ type: "safe_zone", zone: s.zone })
              }
              showDistance={showDistance}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setShowCustomForm((v) => !v);
          setShowHomeFlow(false);
        }}
        className="mt-4 w-full flex items-center justify-between bg-white border-2 border-orange/30 rounded-2xl p-4 text-left"
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-orange">
          <Plus className="w-4 h-4" /> Suggest a different spot
        </span>
        {showCustomForm ? (
          <ChevronUp className="w-5 h-5 text-orange" />
        ) : (
          <ChevronDown className="w-5 h-5 text-orange" />
        )}
      </button>

      {showCustomForm && (
        <div className="mt-3 rounded-2xl border-2 border-orange/40 bg-white p-4 space-y-3">
          <p className="text-sm font-semibold text-navy">Custom spot</p>
          <Input
            placeholder="Place name (e.g., Starbucks on Main St)"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            className="input-large"
          />
          <Input
            placeholder="Address"
            value={customAddress}
            onChange={(e) => setCustomAddress(e.target.value)}
            className="input-large"
          />
          <Input
            placeholder="Optional note (parking tips, etc.)"
            value={customNote}
            onChange={(e) => setCustomNote(e.target.value)}
            className="input-large"
          />
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 leading-relaxed">
            <span className="font-semibold">⚠️ Heads up:</span> Custom spots
            aren&apos;t verified safe zones. Choose somewhere public and
            well-lit. Avoid private homes for first-time meetups.
          </div>
          <Button
            type="button"
            onClick={confirmCustom}
            disabled={!customName.trim() || !customAddress.trim()}
            className="w-full h-11 btn-primary"
          >
            Use this spot
          </Button>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setShowHomeFlow((v) => !v);
          setShowCustomForm(false);
        }}
        className="mt-4 w-full text-center text-sm text-muted-foreground underline underline-offset-2"
      >
        Meeting at someone&apos;s home?
      </button>

      {showHomeFlow && (
        <div className="mt-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-semibold text-amber-900">
              Meeting at someone&apos;s home
            </p>
          </div>
          <p className="text-xs text-amber-900 leading-relaxed">
            NearGear strongly recommends public meetup spots, especially for
            first-time transactions.
          </p>
          <p className="text-xs text-amber-900 leading-relaxed">
            If both parties agree, you can meet at a home address. Address
            will be shared only after the seller accepts the request.
          </p>
          <label className="flex items-start gap-2 text-sm text-amber-900 cursor-pointer">
            <input
              type="checkbox"
              checked={homeAcked}
              onChange={(e) => setHomeAcked(e.target.checked)}
              className="w-4 h-4 mt-0.5 accent-orange flex-shrink-0"
            />
            <span>I understand the risks</span>
          </label>

          {homeAcked && (
            <>
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm text-navy cursor-pointer">
                  <input
                    type="radio"
                    name="homeType"
                    checked={homeOption === "buyer"}
                    onChange={() => setHomeOption("buyer")}
                    className="w-4 h-4 mt-0.5 accent-orange flex-shrink-0"
                  />
                  <span>Meet at my home (I&apos;ll share my address)</span>
                </label>
                <label className="flex items-start gap-2 text-sm text-navy cursor-pointer">
                  <input
                    type="radio"
                    name="homeType"
                    checked={homeOption === "seller"}
                    onChange={() => setHomeOption("seller")}
                    className="w-4 h-4 mt-0.5 accent-orange flex-shrink-0"
                  />
                  <span>
                    Request seller&apos;s address (seller confirms before
                    sharing)
                  </span>
                </label>
              </div>

              {homeOption === "buyer" && (
                <Input
                  placeholder="Your home address"
                  value={buyerHomeAddress}
                  onChange={(e) => setBuyerHomeAddress(e.target.value)}
                  className="input-large"
                />
              )}

              <Button
                type="button"
                onClick={confirmHome}
                disabled={
                  homeOption === "buyer" && !buyerHomeAddress.trim()
                }
                className="w-full h-11 btn-primary"
              >
                <Home className="w-4 h-4" />
                Confirm home meetup
              </Button>
            </>
          )}
        </div>
      )}
    </>
  );
}

function StepReview({
  listing,
  offeredPriceDollars,
  listingPriceDollars,
  depositDollars,
  remainingDollars,
  selectedDate,
  selectedWindow,
  selectedLocation,
  agreed,
  setAgreed,
  error,
}: {
  listing: ListingWithSeller;
  offeredPriceDollars: number;
  listingPriceDollars: number;
  depositDollars: number;
  remainingDollars: number;
  selectedDate: Date;
  selectedWindow: TimeWindow;
  selectedLocation: SelectedLocation;
  agreed: boolean;
  setAgreed: (v: boolean) => void;
  error: string;
}) {
  const discounted = offeredPriceDollars < listingPriceDollars;

  const locText = (() => {
    if (selectedLocation.type === "safe_zone") {
      const z = selectedLocation.zone;
      return { name: z.name, sub: `${z.address}, ${z.city}` };
    }
    if (selectedLocation.type === "custom") {
      return { name: selectedLocation.name, sub: selectedLocation.address };
    }
    if (selectedLocation.type === "home_buyer") {
      return {
        name: "Your home",
        sub: selectedLocation.address || "Address provided",
      };
    }
    return {
      name: "Seller's home",
      sub: "Seller will confirm and share their address",
    };
  })();

  const isHome =
    selectedLocation.type === "home_buyer" ||
    selectedLocation.type === "home_seller";
  const isCustom = selectedLocation.type === "custom";

  return (
    <>
      <h1 className="font-heading text-2xl font-bold text-navy mb-4">
        Review Your Request
      </h1>

      <div className="bg-white rounded-2xl border p-3 mb-4 flex gap-3">
        <div className="w-20 h-20 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
          {listing.photo_urls?.[0] ? (
            <img
              src={listing.photo_urls[0]}
              alt={listing.title}
              className="w-full h-full object-contain bg-white"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-200">
              <ImageIcon className="w-8 h-8" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-navy line-clamp-2">
            {listing.title}
          </p>
          {discounted ? (
            <>
              <p className="text-xs text-muted-foreground line-through tabular-nums mt-1">
                Listed {formatMoney(listingPriceDollars)}
              </p>
              <p className="font-heading text-2xl font-bold text-orange tabular-nums">
                {formatMoney(offeredPriceDollars)}
              </p>
            </>
          ) : (
            <p className="font-heading text-2xl font-bold text-orange tabular-nums mt-1">
              {formatMoney(offeredPriceDollars)}
            </p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border divide-y mb-4">
        <div className="p-4">
          <p className="text-xs text-muted-foreground mb-0.5">When</p>
          <p className="font-semibold text-navy">
            {selectedDate.toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </p>
          <p className="text-sm text-muted-foreground">
            {selectedWindow.label}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs text-muted-foreground mb-0.5">Where</p>
          <p className="font-semibold text-navy flex items-center gap-1">
            <MapPin className="w-4 h-4 text-orange" />
            {locText.name}
            {isCustom && (
              <span className="ml-1 inline-flex items-center text-[10px] font-semibold bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">
                Custom
              </span>
            )}
            {isHome && (
              <span className="ml-1 inline-flex items-center text-[10px] font-semibold bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">
                Home
              </span>
            )}
          </p>
          <p className="text-sm text-muted-foreground">{locText.sub}</p>
          {selectedLocation.type === "custom" && selectedLocation.note && (
            <p className="text-xs text-muted-foreground mt-1 italic">
              {selectedLocation.note}
            </p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border p-4 mb-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Payment
        </p>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Your offer</dt>
            <dd className="font-semibold text-navy tabular-nums">
              {formatMoney(offeredPriceDollars)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Deposit today</dt>
            <dd className="font-semibold text-navy tabular-nums">
              {formatMoney(depositDollars)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Remaining at meetup</dt>
            <dd className="font-semibold text-navy tabular-nums">
              {formatMoney(remainingDollars)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4 text-sm text-yellow-900">
        <p className="font-semibold">💳 Payments coming in next update</p>
        <p className="mt-1 leading-relaxed">
          Your request will still be sent to the seller. When Stripe integration
          is complete in Session 6, the deposit will be charged to secure your
          meetup.
        </p>
      </div>

      <div className="bg-white rounded-2xl border p-4 mb-4 text-sm text-navy">
        <p className="font-semibold mb-2">By sending this request, you agree:</p>
        <ul className="space-y-1 text-muted-foreground leading-relaxed list-disc pl-5">
          <li>Show up within your 2-hour window</li>
          <li>
            If you cancel less than 2 hours before, seller keeps the deposit
          </li>
          <li>If you don&apos;t show up, seller keeps the full deposit</li>
          <li>You can message the seller to firm up the exact time</li>
        </ul>
      </div>

      <label className="flex items-start gap-3 bg-white border rounded-xl p-4 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="w-5 h-5 mt-0.5 accent-orange flex-shrink-0"
        />
        <span className="text-sm font-medium text-navy">
          I understand and agree
        </span>
      </label>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl p-3 mt-4">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}
    </>
  );
}

import { AuthGate } from "@/components/auth-gate";

export default function RequestToBuyPage() {
  return (
    <AuthGate reason="Sign in to send a meetup request to the seller.">
      <RequestToBuyPageInner />
    </AuthGate>
  );
}
