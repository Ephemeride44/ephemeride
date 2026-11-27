"use client";

import EventForm from "@/components/EventForm";
import { AdminLayout } from "@/components/AdminLayout";
import EventsHeader from "@/components/events/EventsHeader";
import EventsPagination from "@/components/events/EventsPagination";
import EventsTable from "@/components/events/EventsTable";
import { useTheme } from "@/components/ThemeProvider";
import { useUserRoleContext } from "@/components/UserRoleProvider";
import { OrganizationSelector } from "@/components/OrganizationSelector";
import { NoOrganizationScreen } from "@/components/NoOrganizationScreen";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { triggerRevalidate } from "@/lib/revalidate";
import type { Database } from "@/integrations/supabase/types";
import { buildRecurringEvents, describeRecurrenceFromEvent, type RecurrenceRule, type RecurringSharedFields } from "@/lib/recurrence";
import { formatEventDateTimeLabel } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Building2, Eye, Repeat, Check, X, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type ThemeRow = Database["public"]["Tables"]["themes"]["Row"];
type CreatorInfo = { email: string | null; full_name: string | null };

const AdminDashboard = () => {
  const [pendingEvents, setPendingEvents] = useState<EventRow[]>([]);
  const [acceptedEvents, setAcceptedEvents] = useState<EventRow[]>([]);
  // Compte connecté ayant créé chaque événement, indexé par id d'événement.
  const [creators, setCreators] = useState<Record<string, CreatorInfo>>({});
  const [themes, setThemes] = useState<ThemeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [showForm, setShowForm] = useState(false);
  const [currentEvent, setCurrentEvent] = useState<EventRow | undefined>(undefined);
  const [duplicateMode, setDuplicateMode] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<EventRow | null>(null);
  const [deleteMode, setDeleteMode] = useState<'single' | 'series'>('single');
  const [showPastEvents, setShowPastEvents] = useState(false);

  const { toast } = useToast();
  const router = useRouter();
  const { theme } = useTheme();
  const { user, currentOrganization, isSuperAdmin, organizations } = useUserRoleContext();

  const emptyEvent: EventRow = {
    id: '',
    name: '',
    start_at: null,
    end_at: null,
    location_place: '',
    location_city: '',
    location_department: '',
    price: '',
    audience: '',
    url: '',
    emoji: '',
    cover_url: null,
    theme_id: null,
    is_full: false,
    is_cancelled: false,
    status: 'pending',
    createdby: null,
    created_by: null,
    updated_at: '',
    organization_id: null,
    ticketing_url: null,
    recurrence_id: null,
  };

  useEffect(() => {
    // Ne charger les événements que si l'utilisateur a accès à des organisations ou est super admin
    if (user && (isSuperAdmin || currentOrganization || organizations.length > 0)) {
      fetchPendingEvents();
      fetchAcceptedEvents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, showPastEvents, currentOrganization, isSuperAdmin, user]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    // Charger les thèmes au montage
    const fetchThemes = async () => {
      const { data, error } = await supabase.from("themes").select("*").order("name");
      if (!error && data) setThemes(data);
    };
    fetchThemes();
  }, []);

  // Charge le compte créateur des événements affichés (RPC réservée à l'admin).
  const loadCreators = async (rows: EventRow[]) => {
    const ids = rows.filter((e) => e.created_by).map((e) => e.id);
    if (ids.length === 0) return;
    const { data, error } = await supabase.rpc('get_event_creators', { p_event_ids: ids });
    if (error) {
      console.error('Erreur lors du chargement des créateurs :', error);
      return;
    }
    setCreators((prev) => ({
      ...prev,
      ...Object.fromEntries(
        (data ?? []).map((c): [string, CreatorInfo] => [
          c.event_id,
          { email: c.email, full_name: c.full_name },
        ])
      ),
    }));
  };

  const fetchPendingEvents = async () => {
    let query = supabase
      .from('events')
      .select('*, theme:theme_id(*), recurrence:recurrence_id(*)')
      .eq('status', 'pending');

    // Filtrer par organisation selon le type d'utilisateur
    if (currentOrganization) {
      // Organisation spécifique sélectionnée
      query = query.eq('organization_id', currentOrganization.organization_id);
    } else if (!isSuperAdmin) {
      // Utilisateur normal avec "Toutes mes organisations" - filtrer par ses organisations
      const userOrgIds = organizations.map(org => org.organization_id);
      query = query.in('organization_id', userOrgIds);
    }
    // Super admin avec "Toutes les organisations" - pas de filtre

    query = query
      .order('start_at', { ascending: false, nullsFirst: false });

    const { data, error } = await query;
    if (error) {
      console.error('Erreur lors du chargement des événements en attente :', error);
      return;
    }
    setPendingEvents(data || []);
    loadCreators(data || []);
  };

  const fetchAcceptedEvents = async () => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = supabase
      .from('events')
      .select('*, theme:theme_id(*), recurrence:recurrence_id(*)', { count: 'exact' })
      .eq('status', 'accepted');

    // Filtrer par organisation selon le type d'utilisateur
    if (currentOrganization) {
      // Organisation spécifique sélectionnée
      query = query.eq('organization_id', currentOrganization.organization_id);
    } else if (!isSuperAdmin) {
      // Utilisateur normal avec "Toutes mes organisations" - filtrer par ses organisations
      const userOrgIds = organizations.map(org => org.organization_id);
      query = query.in('organization_id', userOrgIds);
    }
    // Super admin avec "Toutes les organisations" - pas de filtre

    const today = new Date().toISOString().slice(0, 10); // format YYYY-MM-DD
    // Filtrer sur la date si on ne veut pas les événements passés
    if (!showPastEvents) {
      query = query.gte('start_at', today).order('start_at', { ascending: true, nullsFirst: false });
    } else {
      query = query.lt('start_at', today).order('start_at', { ascending: false, nullsFirst: false });
    }
    query = query.range(from, to);
    if (search) {
      const lower = debouncedSearch.toLowerCase();
      query = query.or(
        `name.ilike.%${lower}%,location_place.ilike.%${lower}%,location_city.ilike.%${lower}%,location_department.ilike.%${lower}%`
      );
    }
    const { data, error, count } = await query;
    if (error) {
      console.error('Erreur lors du chargement des événements acceptés :', error);
      return;
    }
    setAcceptedEvents(data || []);
    loadCreators(data || []);
    setTotal(count || 0);
  };

  const handleAddEvent = () => {
    setCurrentEvent(undefined);
    setDuplicateMode(false);
    setShowForm(true);
  };

  const handleEditEvent = (event: EventRow) => {
    setCurrentEvent(event);
    setDuplicateMode(false);
    setShowForm(true);
  };

  // Duplication : ouvre le formulaire de création pré-rempli avec l'événement
  // source (et sa récurrence si applicable).
  const handleDuplicateEvent = (event: EventRow) => {
    setCurrentEvent(event);
    setDuplicateMode(true);
    setShowForm(true);
  };

  const confirmDeleteEvent = (id: string) => {
    const event = acceptedEvents.find(e => e.id === id);
    if (!event) return;
    setEventToDelete(event);
    setDeleteMode('single');
    setShowDeleteConfirm(true);
  };

  const confirmDeleteSeries = (event: EventRow) => {
    setEventToDelete(event);
    setDeleteMode('series');
    setShowDeleteConfirm(true);
  };

  // Alerte best-effort les personnes abonnées à la commune ou à l'organisation
  // d'un événement fraîchement publié (push + Notification Tray + e-mail).
  // Non bloquant : l'idempotence est garantie côté Edge Function.
  const notifyNewEvent = async (eventId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("notify-new-event", {
        body: { eventId },
      });
      if (error) return;
      const notified = (data as { notified?: number } | null)?.notified ?? 0;
      if (notified > 0) {
        toast({
          title: "Abonnés notifiés",
          description: `${notified} personne(s) suivant la commune ou l'organisateur·ice ont été alertées.`,
        });
      }
    } catch {
      /* notification non bloquante */
    }
  };

  // Validation groupée d'une proposition récurrente : passe toutes les occurrences
  // en attente liées à la même récurrence en accepted/rejected.
  const handleValidateSeries = async (event: EventRow, status: 'accepted' | 'rejected') => {
    if (!event.recurrence_id) return;
    const { error } = await supabase
      .from('events')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('recurrence_id', event.recurrence_id)
      .eq('status', 'pending');
    if (error) {
      toast({
        title: "Erreur lors de la validation de la série",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: status === 'accepted' ? "Série acceptée" : "Série refusée",
      description: status === 'accepted'
        ? "Tous les événements de la série ont été acceptés."
        : "Tous les événements de la série ont été refusés.",
    });
    await fetchPendingEvents();
    await fetchAcceptedEvents();
    void triggerRevalidate();
    // Une seule alerte par série : la prochaine occurrence à venir.
    if (status === 'accepted') {
      const { data: next } = await supabase
        .from('events')
        .select('id')
        .eq('recurrence_id', event.recurrence_id)
        .eq('status', 'accepted')
        .gte('start_at', new Date().toISOString())
        .order('start_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (next?.id) void notifyNewEvent(next.id);
    }
  };

  // Validation individuelle d'une proposition : ne change que l'occurrence ciblée.
  const handleValidateSingle = async (event: EventRow, status: 'accepted' | 'rejected') => {
    const { error } = await supabase
      .from('events')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', event.id);
    if (error) {
      toast({
        title: "Erreur lors de la validation",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: status === 'accepted' ? "Événement accepté" : "Événement refusé",
      description: status === 'accepted'
        ? "L'événement a été accepté."
        : "L'événement a été refusé.",
    });
    await fetchPendingEvents();
    await fetchAcceptedEvents();
    void triggerRevalidate();
    if (status === 'accepted') void notifyNewEvent(event.id);
  };

  const handleDeleteConfirmed = async () => {
    if (!eventToDelete) return;

    // Suppression de la série complète : supprimer la récurrence supprime en
    // cascade tous les événements liés.
    if (deleteMode === 'series' && eventToDelete.recurrence_id) {
      const { error: seriesError } = await supabase
        .from('event_recurrences')
        .delete()
        .eq('id', eventToDelete.recurrence_id);
      if (seriesError) {
        toast({
          title: "Erreur lors de la suppression de la série",
          description: seriesError.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Série supprimée",
          description: "Tous les événements de la série ont été supprimés.",
        });
        await fetchPendingEvents();
        await fetchAcceptedEvents();
      }
      setShowDeleteConfirm(false);
      setEventToDelete(null);
      setDeleteMode('single');
      return;
    }

    const { error: deleteError } = await supabase.from('events').delete().eq('id', eventToDelete.id);
    if (deleteError) {
      toast({
        title: "Erreur lors de la suppression",
        description: deleteError.message,
        variant: "destructive",
      });
    } else {
      setAcceptedEvents(acceptedEvents.filter(event => event.id !== eventToDelete.id));
      void triggerRevalidate();
      toast({
        title: "Événement supprimé",
        description: "L'événement a été supprimé avec succès",
      });
    }
    setShowDeleteConfirm(false);
    setEventToDelete(null);
    setDeleteMode('single');
  };

  const handleSaveEvent = async (eventData: Omit<EventRow, 'id'> & { id?: string }) => {
    let success = false;

    if (eventData.id) {
      // Update existing event
      // Nettoyer les données pour éviter les UUID vides
      const cleanData = { ...eventData };
      if (cleanData.organization_id === '') cleanData.organization_id = null;
      if (cleanData.theme_id === '') cleanData.theme_id = null;

      const { error: updateError } = await supabase
        .from('events')
        .update({
          ...cleanData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', eventData.id);

      if (updateError) {
        toast({
          title: "Erreur lors de la mise à jour",
          description: updateError.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Événement mis à jour",
          description: "L'événement a été mis à jour avec succès",
        });
        success = true;
      }
    } else {
      // Create new event
      const organizationId = eventData.organization_id ?? currentOrganization?.organization_id ?? null;

      const { data: inserted, error: insertError } = await supabase
        .from('events')
        .insert({
          start_at: eventData.start_at || null,
          end_at: eventData.end_at || null,
          name: eventData.name,
          location_place: eventData.location_place || null,
          location_city: eventData.location_city,
          location_department: eventData.location_department || null,
          price: eventData.price || null,
          audience: eventData.audience || null,
          url: eventData.url || null,
          ticketing_url: eventData.ticketing_url || null,
          emoji: eventData.emoji || null,
          theme_id: eventData.theme_id || null,
          cover_url: eventData.cover_url || null,
          organization_id: organizationId,
          updated_at: new Date().toISOString(),
          status: "accepted",
        })
        .select('id')
        .single();

      if (insertError) {
        toast({
          title: "Erreur lors de la création",
          description: insertError.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Événement créé",
          description: "Le nouvel événement a été créé avec succès",
        });
        success = true;
        if (inserted?.id) void notifyNewEvent(inserted.id);
      }
    }

    // Rafraîchir la liste
    if (success) {
      await fetchPendingEvents();
      await fetchAcceptedEvents();
      setShowForm(false);
    }

    return success;
  };

  // Création groupée d'un événement récurrent : 1 ligne event_recurrences + N events liés.
  const handleSaveRecurringEvent = async (
    rule: RecurrenceRule,
    shared: RecurringSharedFields,
  ): Promise<boolean> => {
    const occurrences = buildRecurringEvents(rule, shared);
    if (occurrences.length === 0) {
      toast({
        title: "Aucune occurrence",
        description: "La récurrence ne génère aucun événement sur la période choisie.",
        variant: "destructive",
      });
      return false;
    }

    // 1. Créer la règle de récurrence.
    const { data: recurrenceData, error: recurrenceError } = await supabase
      .from('event_recurrences')
      .insert({
        frequency: 'weekly',
        interval: rule.interval,
        weekdays: rule.weekdays,
        start_date: rule.startDate,
        end_date: rule.endDate,
      })
      .select()
      .single();

    if (recurrenceError || !recurrenceData) {
      toast({
        title: "Erreur lors de la création de la récurrence",
        description: recurrenceError?.message ?? "Erreur inconnue",
        variant: "destructive",
      });
      return false;
    }

    // 2. Insérer les occurrences liées.
    const now = new Date().toISOString();
    const rows = occurrences.map((occ) => ({
      ...occ,
      recurrence_id: recurrenceData.id,
      status: 'accepted',
      updated_at: now,
    }));

    const { data: insertedRows, error: insertError } = await supabase
      .from('events')
      .insert(rows)
      .select('id, start_at');

    if (insertError) {
      // Rollback : supprimer la récurrence (cascade sur les events déjà insérés).
      await supabase.from('event_recurrences').delete().eq('id', recurrenceData.id);
      toast({
        title: "Erreur lors de la création des événements",
        description: insertError.message,
        variant: "destructive",
      });
      return false;
    }

    toast({
      title: "Événements créés",
      description: `${rows.length} événements récurrents ont été créés.`,
    });
    await fetchPendingEvents();
    await fetchAcceptedEvents();
    void triggerRevalidate();
    setShowForm(false);
    // Une seule alerte : la prochaine occurrence à venir de la série.
    const nowMs = Date.now();
    const upcoming = (insertedRows ?? [])
      .filter((r) => r.start_at && new Date(r.start_at).getTime() >= nowMs)
      .sort((a, b) => new Date(a.start_at!).getTime() - new Date(b.start_at!).getTime());
    if (upcoming[0]?.id) void notifyNewEvent(upcoming[0].id);
    return true;
  };

  // Affichage d'un message si l'utilisateur n'a pas d'organisation et n'est pas super admin
  if (!isSuperAdmin && organizations.length === 0) {
    return (
      <AdminLayout title="Aucune organisation" subtitle="Contactez un administrateur pour être ajouté">
        <Card>
          <CardContent className="p-8">
            <div className="text-center">
              <Building2 className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-2xl font-bold mb-2">Aucune organisation</h2>
              <p className="text-muted-foreground">
                Vous n'êtes membre d'aucune organisation. Contactez un administrateur pour être ajouté à une organisation.
              </p>
            </div>
          </CardContent>
        </Card>
      </AdminLayout>
    );
  }

  // Affichage de l'écran "aucune organisation" pour les utilisateurs sans organisation
  if (!isSuperAdmin && organizations.length === 0) {
    return <NoOrganizationScreen />;
  }


  return (
    <AdminLayout title="Tableau de bord" subtitle="Gestion des événements">
      <div className="space-y-6">

        {/* Section événements en attente */}
        {pendingEvents.length > 0 && (
          <Card className="mb-8">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-orange-600">Événements en attente de validation</h2>
                <Badge variant="outline" className="text-orange-600 border-orange-600">
                  {pendingEvents.length} en attente
                </Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Lieu</TableHead>
                    <TableHead>Proposé par</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingEvents.map(event => (
                    <TableRow key={event.id}>
                      <TableCell className="font-medium">{formatEventDateTimeLabel(event)}</TableCell>
                      <TableCell>
                        <div className="max-w-xs">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{event.name}</p>
                            {event.recurrence_id && (
                              <Badge variant="secondary" className="gap-1 shrink-0">
                                <Repeat className="h-3 w-3" />
                                Récurrent
                              </Badge>
                            )}
                          </div>
                          {event.recurrence_id && describeRecurrenceFromEvent(event) && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {describeRecurrenceFromEvent(event)}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{event.location_place}</p>
                          <p className="text-sm text-muted-foreground">{event.location_city}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          {event.createdby && typeof event.createdby === 'object' && 'name' in event.createdby ? (
                            <p className="font-medium">{(event.createdby as { name?: string }).name}</p>
                          ) : null}
                          {event.createdby && typeof event.createdby === 'object' && 'email' in event.createdby ? (
                            <a
                              href={`mailto:${(event.createdby as { email?: string }).email}`}
                              className="text-sm text-blue-600 hover:underline"
                            >
                              {(event.createdby as { email?: string }).email}
                            </a>
                          ) : null}
                          {creators[event.id] ? (
                            <div className="mt-1 text-xs text-muted-foreground" title="Compte connecté ayant créé l'événement">
                              <p>Compte : {creators[event.id].full_name ?? 'nom non renseigné'}</p>
                              {creators[event.id].email ? (
                                <a href={`mailto:${creators[event.id].email}`} className="hover:underline">
                                  {creators[event.id].email}
                                </a>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2 flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setCurrentEvent(event); setDuplicateMode(false); setShowForm(true); }}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            Voir
                          </Button>

                          {/* Accepter : split button (action principale individuelle + menu série) */}
                          <div className="flex">
                            <Button
                              size="sm"
                              className={`bg-green-600 text-white hover:bg-green-700 ${event.recurrence_id ? 'rounded-r-none' : ''}`}
                              title="Accepter cet événement"
                              onClick={() => handleValidateSingle(event, 'accepted')}
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Accepter
                            </Button>
                            {event.recurrence_id && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="sm"
                                    className="bg-green-600 text-white hover:bg-green-700 rounded-l-none border-l border-green-700 px-2"
                                    title="Plus d'options"
                                  >
                                    <ChevronDown className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleValidateSeries(event, 'accepted')}>
                                    <Repeat className="w-4 h-4 mr-2" />
                                    Accepter la série
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>

                          {/* Refuser : split button (action principale individuelle + menu série) */}
                          <div className="flex">
                            <Button
                              size="sm"
                              variant="destructive"
                              className={event.recurrence_id ? 'rounded-r-none' : ''}
                              title="Refuser cet événement"
                              onClick={() => handleValidateSingle(event, 'rejected')}
                            >
                              <X className="w-4 h-4 mr-1" />
                              Refuser
                            </Button>
                            {event.recurrence_id && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="rounded-l-none border-l border-red-800 px-2"
                                    title="Plus d'options"
                                  >
                                    <ChevronDown className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleValidateSeries(event, 'rejected')}>
                                    <Repeat className="w-4 h-4 mr-2" />
                                    Refuser la série
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Section événements acceptés */}
        <EventsHeader
          onAdd={handleAddEvent}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Rechercher par nom, date ou lieu..."
          theme={theme}
          showPastEvents={showPastEvents}
          onTogglePastEvents={setShowPastEvents}
        />
        {/* Tableau principal des événements */}
        <EventsTable events={acceptedEvents} onEdit={handleEditEvent} onDelete={confirmDeleteEvent} onDeleteSeries={confirmDeleteSeries} onDuplicate={handleDuplicateEvent} />
        <EventsPagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className={`w-3/4 max-w-4xl mx-auto ${theme === 'light' ? 'bg-[#f8f8f6] text-ephemeride border-none' : 'bg-ephemeride-light text-ephemeride-foreground border-none'}`} >
            <DialogHeader>
              <DialogTitle>{duplicateMode ? "Dupliquer un événement" : currentEvent ? (currentEvent.status === 'pending' ? "Valider une proposition" : "Modifier l'événement") : "Ajouter un événement"}</DialogTitle>
            </DialogHeader>
            <EventForm
              event={currentEvent}
              onSave={async (eventData) => {
                try {
                  const mappedData = {
                    ...eventData,
                    updated_at: new Date().toISOString(),
                  } as EventRow & { theme: ThemeRow };
                  delete mappedData.theme;
                  delete (mappedData as Record<string, unknown>).recurrence;
                  delete (mappedData as Record<string, unknown>).organization;

                  if (eventData.status === 'accepted') {
                    // Convertir les chaînes vides en null : les colonnes UUID
                    // (organization_id, theme_id, recurrence_id) rejettent "".
                    const cleanData = Object.fromEntries(
                      Object.entries({ ...mappedData, status: 'accepted' }).map(([key, value]) => [
                        key,
                        value === '' ? null : value,
                      ])
                    ) as typeof mappedData;

                    const { error } = await supabase.from('events').update(cleanData).eq('id', currentEvent?.id);
                    if (error) throw error;
                    setShowForm(false);
                    await fetchPendingEvents();
                    await fetchAcceptedEvents();
                    void triggerRevalidate();
                    toast({ title: "Événement accepté", description: "L'événement a été accepté." });
                    return true;
                  } else if (eventData.status === 'rejected') {
                    const { error } = await supabase.from('events').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', currentEvent?.id);
                    if (error) throw error;
                    setShowForm(false);
                    await fetchPendingEvents();
                    await fetchAcceptedEvents();
                    void triggerRevalidate();
                    toast({ title: "Événement refusé", description: "L'événement a été refusé." });
                    return true;
                  } else {
                    // Edition classique, ajout, ou duplication (création : pas d'id source)
                    const idToSave = duplicateMode ? undefined : currentEvent?.id;
                    const success = await handleSaveEvent({ ...eventData, id: idToSave } as Omit<EventRow, 'id'> & { id?: string });
                    return success;
                  }
                } catch (error) {
                  toast({
                    title: "Erreur de sauvegarde",
                    description: "Une erreur est survenue lors de la sauvegarde de l'événement.",
                    variant: "destructive",
                  });
                  return false;
                }
              }}
              onCancel={() => setShowForm(false)}
              showValidationActions={currentEvent?.status === 'pending' && !duplicateMode}
              themes={themes}
              onSaveRecurring={handleSaveRecurringEvent}
              duplicate={duplicateMode}
            />
          </DialogContent>
        </Dialog>
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{deleteMode === 'series' ? "Supprimer la série" : "Confirmer la suppression"}</DialogTitle>
            </DialogHeader>
            {deleteMode === 'series' ? (
              <p>Voulez-vous vraiment supprimer <b>toute la série récurrente</b> de l'événement <b>{eventToDelete?.name}</b> ? Tous les événements liés seront supprimés.</p>
            ) : (
              <p>Voulez-vous vraiment supprimer l'événement <b>{eventToDelete?.name}</b> ?</p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                className="btn btn-secondary"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Annuler
              </button>
              <button
                className="btn btn-danger"
                onClick={handleDeleteConfirmed}
              >
                Supprimer
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default function Page() {
  return (
    <ProtectedRoute>
      <AdminDashboard />
    </ProtectedRoute>
  );
}
