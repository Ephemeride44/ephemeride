"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Bookmark, Clock, Euro, Image as ImageIcon, MapPin, Pencil, Repeat, Ticket } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import EventForm from "@/components/EventForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/components/ThemeProvider";
import { useUserRoleContext } from "@/components/UserRoleProvider";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { triggerRevalidate } from "@/lib/revalidate";
import {
  eventSlug,
  formatCityName,
  formatPrice,
  formatTimeDisplay,
  getEventStart,
} from "@/lib/utils";
import { describeRecurrenceFromEvent } from "@/lib/recurrence";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { hexA, weekdayColor } from "@/lib/colors";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

interface DayEventCardProps {
  event: EventRow;
  size?: "mobile" | "desktop";
  /** Remonte une modification/suppression au parent pour rafraîchir le mois. */
  onChanged?: () => void;
}

/**
 * Carte d'événement riche du panneau jour de la vue calendrier : colonne média
 * (affiche cliquable pour agrandir, ou panneau coloré avec l'heure) + corps
 * (titre, badges, lieu, prix, récurrence, public, billetterie, « Découvrir »).
 * Comme `EventCard`, la carte entière est cliquable (ouvre `event.url`) via un
 * `div role="link"` — les liens internes appellent `stopPropagation`. Les
 * superadmins disposent d'un bouton « Modifier » qui ouvre `EventForm`.
 */
const DayEventCard = ({ event: eventProp, size = "desktop", onChanged }: DayEventCardProps) => {
  const big = size === "desktop";
  const { theme } = useTheme();
  const { toast } = useToast();
  const { isSuperAdmin } = useUserRoleContext();
  const { isBookmarked, toggle: toggleBookmark, isAuthenticated } = useBookmarks();
  const [event, setEvent] = useState(eventProp);
  const [showEdit, setShowEdit] = useState(false);
  const [openPoster, setOpenPoster] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);

  useEffect(() => {
    setEvent(eventProp);
  }, [eventProp]);

  const start = getEventStart(event);
  const color = weekdayColor(start ?? new Date());
  const timeLabel = formatTimeDisplay(event);
  const recurrenceLabel = describeRecurrenceFromEvent(event, { includeTime: false, withPrefix: false });
  const bookmarked = isBookmarked(event.id);
  const locationString = `${event.location_place || ""}${
    event.location_city ? ` — ${formatCityName(event.location_city)}` : ""
  }${event.location_department ? ` (${event.location_department})` : ""}`;

  const handleSaveEvent = async (data: Partial<EventRow>): Promise<boolean> => {
    const cleanData = { ...data } as Record<string, unknown>;
    delete cleanData.theme;
    delete cleanData.recurrence;
    delete cleanData.organization;
    delete cleanData.id;
    if (cleanData.organization_id === "") cleanData.organization_id = null;
    if (cleanData.theme_id === "") cleanData.theme_id = null;

    const updated = { ...cleanData, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("events").update(updated).eq("id", event.id);
    if (error) {
      toast({ title: "Erreur lors de la mise à jour", description: error.message, variant: "destructive" });
      return false;
    }

    setEvent((prev) => ({ ...prev, ...updated }) as EventRow);
    void triggerRevalidate({
      slug: eventSlug({ id: event.id, name: (updated as Partial<EventRow>).name ?? event.name }),
      department: (updated as Partial<EventRow>).location_department ?? event.location_department,
    });
    toast({ title: "Événement mis à jour", description: "L'événement a été mis à jour avec succès" });
    setShowEdit(false);
    onChanged?.();
    return true;
  };

  const handleDeleteEvent = async (): Promise<void> => {
    const { error } = await supabase.from("events").delete().eq("id", event.id);
    if (error) {
      toast({ title: "Erreur lors de la suppression", description: error.message, variant: "destructive" });
      return;
    }
    void triggerRevalidate({
      slug: eventSlug({ id: event.id, name: event.name }),
      department: event.location_department,
    });
    toast({ title: "Événement supprimé", description: "L'événement a été supprimé avec succès" });
    setShowEdit(false);
    setIsDeleted(true);
    onChanged?.();
  };

  if (isDeleted) return null;

  const mediaWidth = big ? 116 : 84;

  const card = (
    <div
      className="flex overflow-hidden rounded-none border-0 shadow-sm bg-white dark:bg-ephemeride-light text-[#1B263B] dark:text-[#faf3ec]"
      style={{ opacity: event.is_cancelled ? 0.62 : 1 }}
    >
      {/* Colonne média */}
      <div
        className="relative flex flex-shrink-0 items-center justify-center"
        style={{
          width: mediaWidth,
          background: color,
          backgroundImage: "linear-gradient(155deg, rgba(255,255,255,.18), rgba(27,38,59,.22))",
        }}
      >
        {event.cover_url ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Voir l'affiche en grand"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpenPoster(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      setOpenPoster(true);
                    }
                  }}
                  className="absolute inset-0 cursor-pointer"
                >
                  <img
                    src={event.cover_url}
                    alt="Affiche de l'événement"
                    className="h-full w-full object-cover"
                  />
                  {timeLabel && (
                    <span
                      className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-bold text-[#1B263B] shadow"
                      style={{ background: color, fontSize: big ? 12 : 11 }}
                    >
                      <Clock style={{ width: big ? 13 : 12, height: big ? 13 : 12 }} />
                      {timeLabel}
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Voir l'affiche en grand
              </TooltipContent>
            </Tooltip>
            <Dialog open={openPoster} onOpenChange={setOpenPoster}>
              <DialogContent
                onClick={(e) => e.stopPropagation()}
                className="max-w-2xl flex flex-col items-center bg-black/95"
              >
                <img
                  src={event.cover_url}
                  alt="Affiche de l'événement"
                  className="max-h-[80vh] w-auto object-contain rounded shadow-lg"
                  style={{ background: "#fff" }}
                />
              </DialogContent>
            </Dialog>
          </>
        ) : timeLabel ? (
          <span className="flex flex-col items-center gap-1 text-[#1B263B]">
            <Clock style={{ width: big ? 18 : 16, height: big ? 18 : 16 }} />
            <span
              className="font-display font-extrabold"
              style={{ fontSize: big ? 15 : 13 }}
            >
              {timeLabel}
            </span>
          </span>
        ) : (
          <ImageIcon style={{ width: big ? 30 : 24, height: big ? 30 : 24, color: hexA("#1B263B", 0.5) }} />
        )}
      </div>

      {/* Corps */}
      <div className="relative min-w-0 flex-1" style={{ padding: big ? "13px 16px" : "11px 13px" }}>
        {/* Bouton Favori (réservé aux utilisateurs connectés). */}
        {isAuthenticated && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleBookmark(event.id);
                }}
                aria-label={bookmarked ? "Retirer des favoris" : "Ajouter aux favoris"}
                aria-pressed={bookmarked}
                className={`absolute top-2 z-10 rounded-full border p-1.5 transition-colors ${
                  isSuperAdmin ? "right-9" : "right-2"
                } ${
                  bookmarked
                    ? "border-transparent bg-accent-peach text-accent-peach-foreground hover:bg-accent-peach-hover"
                    : theme === "dark"
                      ? "border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-800"
                }`}
              >
                <Bookmark className="h-3.5 w-3.5" fill={bookmarked ? "currentColor" : "none"} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">
              {bookmarked ? "Retirer des favoris" : "Ajouter aux favoris"}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Bouton Modifier (superadmins) */}
        {isSuperAdmin && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowEdit(true);
                  }}
                  aria-label="Modifier l'événement"
                  className={`absolute right-2 top-2 z-10 rounded-full border p-1.5 transition-colors ${
                    theme === "dark"
                      ? "border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-800"
                  }`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">
                Modifier l'événement
              </TooltipContent>
            </Tooltip>
            <Dialog open={showEdit} onOpenChange={setShowEdit}>
              <DialogContent
                onClick={(e) => e.stopPropagation()}
                className={`mx-auto w-3/4 max-w-4xl max-h-[90vh] overflow-y-auto ${
                  theme === "light"
                    ? "bg-[#f8f8f6] text-ephemeride border-none"
                    : "bg-ephemeride-light text-ephemeride-foreground border-none"
                }`}
              >
                <DialogHeader>
                  <DialogTitle>Modifier l'événement</DialogTitle>
                </DialogHeader>
                <EventForm
                  event={event}
                  onSave={handleSaveEvent}
                  onCancel={() => setShowEdit(false)}
                  onDelete={handleDeleteEvent}
                />
              </DialogContent>
            </Dialog>
          </>
        )}

        {/* Titre + badges */}
        <div className={`flex flex-wrap items-center gap-2 ${isSuperAdmin ? "pr-16" : isAuthenticated ? "pr-8" : ""}`} style={{ marginBottom: big ? 7 : 5 }}>
          <span className="font-bold leading-tight" style={{ fontSize: big ? 16 : 14 }}>
            {event.name}
          </span>
          {event.is_full && (
            <span className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Complet
            </span>
          )}
          {event.is_cancelled && (
            <span className="inline-flex items-center rounded-full bg-gray-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white dark:bg-gray-200 dark:text-gray-900">
              Annulé
            </span>
          )}
        </div>

        {/* Lieu */}
        <div className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="shrink-0" style={{ width: big ? 14 : 13, height: big ? 14 : 13 }} />
          <span className="truncate" style={{ fontSize: big ? 13 : 12 }}>
            {locationString}
          </span>
        </div>

        {/* Prix */}
        {event.price && (
          <div className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
            <Euro className="shrink-0" style={{ width: big ? 14 : 13, height: big ? 14 : 13 }} />
            <span className="truncate" style={{ fontSize: big ? 13 : 12 }}>
              {formatPrice(event.price)}
            </span>
          </div>
        )}

        {/* Récurrence */}
        {recurrenceLabel && (
          <div className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
            <Repeat className="shrink-0" style={{ width: big ? 14 : 13, height: big ? 14 : 13 }} />
            <span className="truncate" style={{ fontSize: big ? 13 : 12 }}>
              {recurrenceLabel}
            </span>
          </div>
        )}

        {/* Pied : type + billetterie + découvrir */}
        <div className="flex flex-wrap items-center justify-between gap-2" style={{ marginTop: big ? 10 : 8 }}>
          {event.audience ? (
            <span className="inline-block rounded-full bg-[#1B263B]/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground dark:bg-white/10">
              {event.audience}
            </span>
          ) : (
            <span />
          )}
          {(event.ticketing_url || event.url) && (
            <div className="flex items-center gap-2">
              {event.ticketing_url &&
                (big ? (
                  <a
                    href={event.ticketing_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors border-gray-300 text-[#1B263B] hover:bg-gray-50 dark:border-white/20 dark:text-[#faf3ec] dark:hover:bg-white/10"
                  >
                    <Ticket className="h-4 w-4" />
                    Billetterie
                  </a>
                ) : (
                  <a
                    href={event.ticketing_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Accéder à la billetterie"
                    className="text-muted-foreground transition-transform hover:scale-110"
                  >
                    <Ticket className="h-5 w-5" />
                  </a>
                ))}
              {event.url &&
                (big ? (
                  <a
                    href={event.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 rounded-none border px-3 py-1 text-xs font-semibold transition-colors border-gray-300 text-[#1B263B] hover:bg-gray-50 dark:border-white/20 dark:text-[#faf3ec] dark:hover:bg-white/10"
                  >
                    Découvrir l'événement
                    <ArrowRight className="h-4 w-4" />
                  </a>
                ) : (
                  <a
                    href={event.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Accéder au site de l'événement"
                    className="text-muted-foreground transition-transform hover:scale-110"
                  >
                    <ArrowRight className="h-5 w-5" />
                  </a>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Carte cliquable (ouvre le site de l'événement), comme `EventCard` : on
  // utilise un div role="link" plutôt qu'un <a> englobant, afin d'éviter les
  // ancres imbriquées (billetterie, « Découvrir ») → hydratation invalide.
  if (event.url) {
    const openEvent = () => window.open(event.url!, "_blank", "noopener,noreferrer");
    return (
      <div
        role="link"
        tabIndex={0}
        onClick={openEvent}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openEvent();
          }
        }}
        className="block cursor-pointer focus:outline-none"
        style={{ textDecoration: "none" }}
      >
        {card}
      </div>
    );
  }

  return card;
};

export default DayEventCard;
