"use client";

import type { Database } from "@/integrations/supabase/types";
import type { EventOrganization } from "@/lib/eventSelect";
type Event = Database["public"]["Tables"]["events"]["Row"] & {
  organization?: Pick<EventOrganization, "id" | "name"> | null;
};
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Euro, Ticket, Pencil, Repeat, Clock, Bookmark, Megaphone } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { useUserRoleContext } from "@/components/UserRoleProvider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import EventForm from "@/components/EventForm";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { daysOfWeek, monthNamesShort, getDateBlockColor, getEventStart, formatTimeDisplay, formatCityName, formatPrice, eventSlug } from "@/lib/utils";
import { describeRecurrenceFromEvent } from "@/lib/recurrence";
import { triggerRevalidate } from "@/lib/revalidate";
import { useBookmarks } from "@/hooks/use-bookmarks";

interface EventCardProps {
  event: Event;
  isPast?: boolean;
  /**
   * Affiche le bloc date (jour/numéro/mois) sur la vignette ou le panneau coloré.
   * À désactiver quand une frise temporelle porte déjà la date (liste de la home)
   * pour éviter la redondance ; conservé ailleurs (favoris, page événement, page
   * organisateur·ice). L'heure reste affichée dans tous les cas.
   */
  showDate?: boolean;
}

const EventCard = ({ event: eventProp, isPast = false, showDate = true }: EventCardProps) => {
  const [openDialog, setOpenDialog] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  // Une fois supprimé, on retire la carte de l'affichage sans recharger la page.
  const [isDeleted, setIsDeleted] = useState(false);
  // Copie locale de l'événement : permet de refléter une modification admin
  // sans recharger la page (on reste exactement au même endroit).
  const [event, setEvent] = useState(eventProp);
  const { theme } = useTheme();
  const { toast } = useToast();
  const { isSuperAdmin, isOrganizationAdmin } = useUserRoleContext();
  const canEdit = isSuperAdmin || isOrganizationAdmin;
  const { isBookmarked, toggle: toggleBookmark, isAuthenticated } = useBookmarks();
  const bookmarked = isBookmarked(event.id);
  // Favoris réservés aux utilisateurs connectés (feature en accès restreint).
  const showBookmark = isAuthenticated;
  const actionCount = (showBookmark ? 1 : 0) + (canEdit ? 1 : 0);

  useEffect(() => {
    setEvent(eventProp);
  }, [eventProp]);

  const handleSaveEvent = async (data: Partial<typeof event>): Promise<boolean> => {
    // Nettoyer les données avant l'update (retirer la relation jointe et l'id,
    // convertir les UUID vides en null).
    const cleanData = { ...data } as Record<string, unknown>;
    delete cleanData.theme;
    delete cleanData.recurrence;
    delete cleanData.organization;
    delete cleanData.id;
    if (cleanData.organization_id === '') cleanData.organization_id = null;
    if (cleanData.theme_id === '') cleanData.theme_id = null;

    const updated = { ...cleanData, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('events').update(updated).eq('id', event.id);

    if (error) {
      toast({
        title: "Erreur lors de la mise à jour",
        description: error.message,
        variant: "destructive",
      });
      return false;
    }

    setEvent(prev => ({ ...prev, ...updated }) as typeof event);
    void triggerRevalidate({ slug: eventSlug({ id: event.id, name: (updated as any).name ?? event.name }), department: (updated as any).location_department ?? event.location_department });
    toast({
      title: "Événement mis à jour",
      description: "L'événement a été mis à jour avec succès",
    });
    setShowEdit(false);
    return true;
  };

  const handleDeleteEvent = async (): Promise<void> => {
    const { error } = await supabase.from('events').delete().eq('id', event.id);

    if (error) {
      toast({
        title: "Erreur lors de la suppression",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    void triggerRevalidate({ slug: eventSlug({ id: event.id, name: event.name }), department: event.location_department });
    toast({
      title: "Événement supprimé",
      description: "L'événement a été supprimé avec succès",
    });
    setShowEdit(false);
    setIsDeleted(true);
  };

  const eventStart = getEventStart(event);
  const dayName = eventStart ? daysOfWeek[eventStart.getDay()] : "lundi";
  const dayColor = getDateBlockColor(dayName);
  const timeLabel = formatTimeDisplay(event);
  const recurrenceLabel = describeRecurrenceFromEvent(event, { includeTime: false, withPrefix: false });

  // Bloc date affiché à gauche de la carte (utile hors liste, ex. page détail).
  const weekdayShort = eventStart ? `${daysOfWeek[eventStart.getDay()].slice(0, 3)}.` : null;
  const dayNumber = eventStart ? eventStart.getDate() : null;
  const monthShort = eventStart ? monthNamesShort[eventStart.getMonth()] : null;
  const hasDate = eventStart != null;
  // Affichage effectif du bloc date : présent ET non masqué par le contexte.
  const showDateBlock = showDate && hasDate;
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  // Format location
  const locationString = `${event.location_place || ''}${event.location_city ? ` — ${formatCityName(event.location_city)}` : ''}${event.location_department ? ` (${event.location_department})` : ''}`;

  const cardContent = (
    <div className="flex flex-col md:flex-row h-full">
      {/* Visuel : affiche si présente (avec badges date + heure), sinon panneau
          coloré portant la date et l'heure, ou simple liseré coloré si aucune
          date ni heure. */}
      {event.cover_url ? (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="relative flex-shrink-0 w-full md:w-56">
                <img
                  src={event.cover_url}
                  alt="Affiche de l'événement"
                  className={`h-56 w-full md:h-full object-cover cursor-pointer ${isPast ? 'opacity-60' : ''}`}
                  onClick={e => { e.preventDefault(); e.stopPropagation(); setOpenDialog(true); }}
                  tabIndex={0}
                  aria-label="Voir l'affiche en grand"
                />
                <div className="absolute top-2 left-2 flex flex-col items-start gap-1.5">
                  {showDateBlock && (
                    <span className={`inline-flex items-center rounded-full ${dayColor} text-white text-xs font-semibold px-2.5 py-1 shadow-md`}>
                      {capitalize(weekdayShort!)} {dayNumber} {monthShort}
                    </span>
                  )}
                  {timeLabel && (
                    <span className={`inline-flex items-center gap-1.5 rounded-full ${dayColor} text-white text-sm font-semibold px-3 py-1.5 shadow-md`}>
                      <Clock className="w-4 h-4" />
                      {timeLabel}
                    </span>
                  )}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Voir l'affiche en grand
            </TooltipContent>
          </Tooltip>
        </>
      ) : showDateBlock || timeLabel ? (
        <div className={`flex-shrink-0 w-full md:w-56 ${dayColor} flex flex-col items-center justify-center gap-1 py-5 md:py-0 text-white ${isPast ? 'opacity-60' : ''}`}>
          {showDateBlock && (
            <div className="text-center leading-none">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-90">{capitalize(weekdayShort!)}</div>
              <div className="text-4xl font-extrabold leading-tight">{dayNumber}</div>
              <div className="text-xs font-semibold uppercase tracking-wide opacity-90">{monthShort}</div>
            </div>
          )}
          {timeLabel && (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
              <Clock className="w-4 h-4" />
              {timeLabel}
            </span>
          )}
        </div>
      ) : (
        <div className={`flex-shrink-0 w-full h-1.5 md:h-auto md:w-1.5 ${dayColor} ${isPast ? 'opacity-60' : ''}`} />
      )}

      {/* Contenu principal */}
      <div className="flex-1 p-6 relative">
        {/* Actions en haut à droite : favori (connectés) + modifier (admins). */}
        {actionCount > 0 && (
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
            {showBookmark && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleBookmark(event.id);
                    }}
                    aria-label={bookmarked ? "Retirer des favoris" : "Ajouter aux favoris"}
                    aria-pressed={bookmarked}
                    className={`p-2 rounded-full border transition-colors ${bookmarked
                      ? 'border-transparent bg-accent-peach text-accent-peach-foreground hover:bg-accent-peach-hover'
                      : theme === 'dark'
                        ? 'border-white/20 text-white/70 hover:text-white hover:bg-white/10'
                        : 'border-gray-300 text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                      }`}
                  >
                    <Bookmark className="w-4 h-4" fill={bookmarked ? 'currentColor' : 'none'} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">
                  {bookmarked ? "Retirer des favoris" : "Ajouter aux favoris"}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Bouton Modifier (admins uniquement) */}
            {canEdit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowEdit(true);
                    }}
                    aria-label="Modifier l'événement"
                    className={`p-2 rounded-full border transition-colors ${theme === 'dark'
                      ? 'border-white/20 text-white/70 hover:text-white hover:bg-white/10'
                      : 'border-gray-300 text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                      }`}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">
                  Modifier l'événement
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        {/* Nom de l'événement */}
        <div className={`flex flex-wrap items-center gap-2 mb-3 ${actionCount >= 2 ? 'pr-20' : actionCount === 1 ? 'pr-10' : ''}`}>
          <h3 className="text-xl font-bold leading-tight">{event.name}</h3>
          {event.is_full && (
            <span className="inline-flex items-center rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
              Complet
            </span>
          )}
          {event.is_cancelled && (
            <span className="inline-flex items-center rounded-full bg-gray-700 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-white dark:bg-gray-200 dark:text-gray-900">
              Annulé
            </span>
          )}
        </div>

        {/* Lieu */}
        <div className="flex items-center text-sm mb-2">
          <img
            src="/lovable-uploads/680f536f-accd-4c50-8dd4-82707544fbe1.png"
            alt="Lieu"
            className={`w-4 h-4 mr-2 ${theme === 'dark' ? 'brightness-0 invert' : 'brightness-0'
              }`}
          />
          {locationString}
        </div>

        {/* Mention de l'organisateur·ice (cliquable vers sa page) */}
        {event.organization && (
          <Link
            href={`/organisateur/${event.organization.id}`}
            onClick={(e) => e.stopPropagation()}
            className="mb-2 inline-flex items-center gap-1.5 text-sm transition-colors hover:text-accent-peach"
          >
            <Megaphone className="h-3.5 w-3.5 opacity-70" />
            <span className="text-[11px] uppercase tracking-wide opacity-60">Organisé par</span>
            <span className="font-medium">{event.organization.name}</span>
          </Link>
        )}

        {/* Prix avec icône euro */}
        {!isPast && event.price && (
          <div className={`flex items-center text-sm mb-3 ${theme === 'dark' ? 'text-white/70' : 'text-gray-600'}`}>
            <Euro className={`w-4 h-4 mr-1 ${theme === 'dark' ? 'brightness-0 invert' : 'brightness-0'
              }`} />
            {formatPrice(event.price)}
          </div>
        )}

        {/* Récurrence avec icône (même style que le prix) */}
        {recurrenceLabel && (
          <div className={`flex items-center text-sm mb-3 ${theme === 'dark' ? 'text-white/70' : 'text-gray-600'}`}>
            <Repeat className={`w-4 h-4 mr-1 shrink-0 ${theme === 'dark' ? 'brightness-0 invert' : 'brightness-0'}`} />
            {recurrenceLabel}
          </div>
        )}

        {/* Type d'événement - pilule (ne s'affiche que si audience n'est pas vide) */}
        {event.audience && (
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide ${theme === 'dark' ? 'bg-white/10 text-white/70' : 'bg-[#1B263B]/5 text-gray-600'}`}>
            {event.audience}
          </span>
        )}

        {/* Boutons billeterie et plus d'infos */}
        {(event.ticketing_url || event.url) && (
          <div className="mt-4 flex items-center justify-end gap-2 md:absolute md:bottom-4 md:right-4 md:mt-0">
            {/* Bouton billeterie */}
            {event.ticketing_url && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={event.ticketing_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-pointer"
                  >
                    <Ticket className={`w-5 h-5 transition-transform hover:scale-110 ${theme === 'dark'
                      ? 'text-white/70 hover:text-white'
                      : 'text-gray-600 hover:text-gray-800'
                      }`} />
                  </a>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">
                  Accéder à la billeterie
                </TooltipContent>
              </Tooltip>
            )}

            {/* Bouton plus d'infos */}
            {event.url && (
              <>
                {!isPast ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={event.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={`flex items-center gap-2 rounded-none px-4 py-2 text-xs font-medium border transition-colors ${theme === 'dark'
                          ? 'border-white/20 text-white hover:bg-white/10'
                          : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                      >
                        Découvrir l'événement
                        <ArrowRight className={`w-4 h-4 transition-transform group-hover:translate-x-0.5 ${theme === 'dark'
                          ? 'text-white/70'
                          : 'text-gray-600'
                          }`} />
                      </a>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="text-xs">
                      Accéder au site de l'événement
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={event.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="cursor-pointer"
                      >
                        <ArrowRight className={`w-5 h-5 transition-transform hover:scale-110 ${theme === 'dark'
                          ? 'text-white/70 hover:text-white'
                          : 'text-gray-600 hover:text-gray-800'
                          }`} />
                      </a>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="text-xs">
                      Accéder au site de l'événement
                    </TooltipContent>
                  </Tooltip>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const card = (
    <Card
      id={`event-${event.id}`}
      className={`${theme === 'dark' ? 'bg-ephemeride-light' : 'bg-white'} ${theme === 'dark' ? 'text-[#faf3ec]' : 'text-[#1B263B]'} mb-4 animate-fade-in hover:shadow-lg transition-all duration-200 border-0 shadow-sm overflow-hidden rounded-none scroll-mt-24`}
    >
      <CardContent className="p-0 h-full">
        {cardContent}
      </CardContent>
    </Card>
  );

  if (isDeleted) return null;

  // Les modales (affiche en grand, édition) sont rendues HORS de la carte
  // cliquable. Bien que Radix les portale dans document.body, les événements
  // synthétiques React remontent selon l'arbre React : si elles étaient
  // descendantes du div role="link", un clic (ou Espace/Entrée) dans le
  // formulaire d'édition déclencherait l'ouverture du lien externe.
  const dialogs = (
    <>
      {event.cover_url && (
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogContent className="max-w-2xl flex flex-col items-center bg-black/95">
            <img
              src={event.cover_url}
              alt="Affiche de l'événement"
              className="max-h-[80vh] w-auto object-contain rounded shadow-lg"
              style={{ background: '#fff' }}
            />
          </DialogContent>
        </Dialog>
      )}
      {canEdit && (
        <Dialog open={showEdit} onOpenChange={setShowEdit}>
          <DialogContent
            className={`w-3/4 max-w-4xl mx-auto max-h-[90vh] overflow-y-auto ${theme === 'light' ? 'bg-[#f8f8f6] text-ephemeride border-none' : 'bg-ephemeride-light text-ephemeride-foreground border-none'}`}
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
      )}
    </>
  );

  if (event.url) {
    const openEvent = () => window.open(event.url!, "_blank", "noopener,noreferrer");
    // Carte cliquable sans <a> englobant : un <a> contiendrait les liens
    // internes (billetterie, « plus d'infos ») → ancres imbriquées invalides
    // (erreur d'hydratation React 19). On utilise un div role="link".
    return (
      <>
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
          className="group block focus:outline-none cursor-pointer"
          style={{ textDecoration: "none" }}
        >
          {card}
        </div>
        {dialogs}
      </>
    );
  }
  return (
    <>
      {card}
      {dialogs}
    </>
  );
};

export default EventCard;