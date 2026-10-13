"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/compressImage";
import { useDropzone } from "react-dropzone";
import { X, Trash2, Bell } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useTheme } from "@/components/ThemeProvider";
import { useUserRoleContext } from "@/components/UserRoleProvider";
import { formatCityName, formatPrice, getEventStart, getEventEnd, sanitizeFileName } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import RecurrenceFields from "@/components/RecurrenceFields";
import type { RecurrenceRule, RecurringSharedFields } from "@/lib/recurrence";
import DepartmentSelect from "@/components/DepartmentSelect";
import { getLastDepartment, rememberLastDepartment } from "@/lib/departments";

type Event = Database["public"]["Tables"]["events"]["Row"];
type Theme = Database["public"]["Tables"]["themes"]["Row"];

type EventFormValues = {
  id?: string;
  date: string;        // YYYY-MM-DD
  start_time: string;  // HH:MM
  end_time?: string | null; // HH:MM
  name: string;
  location_place?: string;
  location_city: string;
  location_department?: string;
  price?: string | null;
  audience?: string | null;
  emoji?: string | null;
  url?: string | null;
  ticketing_url?: string | null;
  theme_id?: string | null;
  cover_url?: string | null;
  organization_id?: string | null;
  is_full?: boolean;
  is_cancelled?: boolean;
};

// Règle de récurrence telle que jointe depuis la table event_recurrences.
type JoinedRecurrence = {
  interval: number;
  weekdays: number[];
  start_date: string;
  end_date: string;
} | null;

type EventFormEvent = Partial<Event> & { recurrence?: JoinedRecurrence };

interface EventFormProps {
  event?: EventFormEvent;
  onSave: (event: Partial<Event>) => Promise<boolean>;
  onCancel: () => void;
  showValidationActions?: boolean;
  themes?: Theme[];
  theme?: 'light' | 'dark';
  onSaveRecurring?: (rule: RecurrenceRule, shared: RecurringSharedFields) => Promise<boolean>;
  // Mode duplication : pré-remplit le formulaire mais reste en création.
  duplicate?: boolean;
  // Suppression de l'événement (édition uniquement). Si fourni, un bouton
  // « Supprimer » s'affiche en bas à gauche, protégé par une confirmation.
  onDelete?: () => Promise<void> | void;
}

const defaultRecurrence: RecurrenceRule = {
  interval: 1,
  weekdays: [],
  startDate: '',
  endDate: '',
  startTime: '',
  endTime: '',
};

const defaultValues: EventFormValues = {
  id: '',
  date: '',
  start_time: '',
  end_time: '',
  name: '',
  location_place: '',
  location_city: '',
  location_department: '',
  price: '',
  audience: '',
  emoji: '',
  url: '',
  ticketing_url: '',
  theme_id: '',
  cover_url: '',
  organization_id: '',
  is_full: false,
  is_cancelled: false,
};

const fetchThemes = async (): Promise<Theme[]> => {
  const { data, error } = await supabase.from("themes").select("*").order("name");
  if (error) throw error;
  return data as Theme[];
};

const EventForm = ({ event, onSave, onCancel, showValidationActions, themes, theme: themeProp, onSaveRecurring, duplicate, onDelete }: EventFormProps) => {
  const { toast } = useToast();
  const { currentOrganization, isSuperAdmin, organizations } = useUserRoleContext();
  // En duplication, on pré-remplit depuis un événement source mais on reste en création.
  const isEditing = !!event && !duplicate;
  // Le mode récurrent n'est proposé qu'à la création (et si un handler est fourni).
  const canRecur = !isEditing && !!onSaveRecurring;
  const [eventType, setEventType] = useState<'single' | 'recurring'>('single');
  const [recurrence, setRecurrence] = useState<RecurrenceRule>(defaultRecurrence);
  const [coverPreview, setCoverPreview] = useState<string | null>(event?.cover_url || null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{[key: string]: string}>({});
  const [formData, setFormData] = useState<EventFormValues>(defaultValues);
  const formDataRef = useRef<EventFormValues>(defaultValues);
  // Notification push aux personnes ayant mis l'événement en favori (édition).
  const [bookmarkCount, setBookmarkCount] = useState<number | null>(null);
  const [notificationMessage, setNotificationMessage] = useState("");
  // Dialogue post-sauvegarde : proposé après « Mettre à jour » s'il y a ≥ 1 favori.
  const [showNotifyPrompt, setShowNotifyPrompt] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<Partial<Event> | null>(null);
  const { theme: contextTheme } = useTheme();
  const theme = themeProp || contextTheme;
  
  // Synchroniser formData avec la ref
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  // Remplir le formulaire si édition / duplication
  useEffect(() => {
    if (event) {
      // Convertir les valeurs null en chaînes vides pour éviter les warnings React.
      // On écarte les champs joints (theme, recurrence) qui ne sont pas des colonnes.
      const sanitizedEvent = Object.fromEntries(
        Object.entries(event)
          .filter(([key]) => !['recurrence', 'theme'].includes(key))
          .map(([key, value]) => [
            key,
            value === null ? '' : value
          ])
      );

      const newValues = {
        ...defaultValues,
        ...sanitizedEvent,
      } as EventFormValues & Record<string, unknown>;

      // Dériver date / heures depuis start_at / end_at (avec fallback legacy
      // géré par les helpers). On retire les champs qui ne sont pas des entrées
      // de formulaire pour ne pas les renvoyer tels quels à la sauvegarde.
      const pad = (n: number) => String(n).padStart(2, '0');
      const toTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      const start = getEventStart(event);
      const end = getEventEnd(event);
      newValues.date = start ? `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}` : '';
      newValues.start_time = start ? toTime(start) : '';
      newValues.end_time = end ? toTime(end) : '';
      delete newValues.start_at;
      delete newValues.end_at;

      // En duplication : on crée un nouvel événement, donc pas d'id ni de lien
      // de récurrence hérités.
      if (duplicate) {
        newValues.id = '';
        newValues.recurrence_id = null;
      }

      setFormData(newValues as EventFormValues);
      formDataRef.current = newValues as EventFormValues;

      // Duplication d'un événement récurrent : pré-remplir la récurrence.
      if (duplicate && event.recurrence) {
        setEventType('recurring');
        setRecurrence({
          interval: event.recurrence.interval,
          weekdays: event.recurrence.weekdays,
          startDate: event.recurrence.start_date,
          endDate: event.recurrence.end_date,
          startTime: start ? toTime(start) : '',
          endTime: end ? toTime(end) : '',
        });
      } else {
        setEventType('single');
        setRecurrence(defaultRecurrence);
      }
    } else {
      // Création : pré-remplir le département avec le dernier choisi (souvent le
      // même d'un ajout à l'autre) pour éviter de le rechercher à chaque fois.
      const initialValues = { ...defaultValues, location_department: getLastDepartment() };
      setFormData(initialValues);
      formDataRef.current = initialValues;
    }
  }, [event, duplicate]);

  // En édition : nombre de personnes ayant mis l'événement en favori (pour la
  // case « Envoyer la notif »). RPC sécurisée (admins uniquement).
  useEffect(() => {
    if (!isEditing || !event?.id) {
      setBookmarkCount(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any).rpc("count_event_bookmarks", {
        p_event_id: event.id,
      });
      if (!cancelled) setBookmarkCount(!error && typeof data === "number" ? data : 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [isEditing, event?.id]);

  const { data: themesData, isLoading: isLoadingThemes } = useQuery<Theme[]>({
    queryKey: ["themes"],
    queryFn: fetchThemes,
    enabled: !themes,
  });
  const themeList = themes || themesData || [];

  // Dropzone pour l'affiche
  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles[0]) {
      setCoverFile(acceptedFiles[0]);
      setCoverPreview(URL.createObjectURL(acceptedFiles[0]));
    }
  };
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    multiple: false,
    disabled: isUploading,
  });

  // Upload l'affiche si une nouvelle a été déposée, sinon conserve l'URL existante.
  // Retourne `undefined` en cas d'échec (l'appelant doit alors interrompre).
  const uploadCoverIfNeeded = async (currentCoverUrl: string | null): Promise<string | null | undefined> => {
    if (!coverFile) return currentCoverUrl;
    setIsUploading(true);
    const file = await compressImage(coverFile);
    const filePath = `covers/${Date.now()}_${sanitizeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from('event-assets').upload(filePath, file, { upsert: true });
    setIsUploading(false);
    if (uploadError) {
      toast({
        title: "Erreur lors de l'upload de l'affiche",
        description: uploadError.message,
        variant: "destructive",
      });
      return undefined;
    }
    const { data: publicUrlData } = supabase.storage.from('event-assets').getPublicUrl(filePath);
    setCoverPreview(publicUrlData.publicUrl);
    return publicUrlData.publicUrl;
  };

  // Résout l'organisation à assigner selon le rôle de l'utilisateur.
  const resolveOrganizationId = (selectedOrgId?: string | null): string | null => {
    if (isSuperAdmin) {
      return selectedOrgId && selectedOrgId !== 'none' ? selectedOrgId : null;
    } else if (organizations.length > 1) {
      return selectedOrgId && selectedOrgId !== 'none' ? selectedOrgId : null;
    } else if (organizations.length === 1) {
      return organizations[0].organization_id;
    } else if (!isEditing && currentOrganization) {
      return currentOrganization.organization_id;
    }
    return selectedOrgId ?? null;
  };

  // Transforme les champs de formulaire en payload de colonnes : combine
  // date + heures en start_at / end_at et écarte les champs propres au formulaire
  // (date, start_time, end_time) qui ne sont pas des colonnes de la table.
  const toEventPayload = (values: EventFormValues): Partial<Event> => {
    const { date, start_time, end_time, ...rest } = values;
    const start_at = date && start_time ? `${date}T${start_time}:00` : null;
    const end_at = date && end_time ? `${date}T${end_time}:00` : null;
    return { ...rest, start_at, end_at };
  };

  // Message par défaut de la notification, déduit du changement le plus notable
  // entre l'événement d'origine et le formulaire. L'admin peut le réécrire.
  const buildAutoMessage = (): string => {
    const name = (formData.name || event?.name || "L'événement").trim();
    if (!event) return `${name} a été mis à jour.`;

    if (!event.is_cancelled && formData.is_cancelled) return `${name} : l'événement est annulé.`;
    if (!event.is_full && formData.is_full) return `${name} : c'est complet, plus de places disponibles.`;

    const origStart = getEventStart(event);
    const pad = (n: number) => String(n).padStart(2, "0");
    const origDate = origStart
      ? `${origStart.getFullYear()}-${pad(origStart.getMonth() + 1)}-${pad(origStart.getDate())}`
      : "";
    const origTime = origStart ? `${pad(origStart.getHours())}:${pad(origStart.getMinutes())}` : "";
    const dateChanged = !!formData.date && formData.date !== origDate;
    const timeChanged = !!formData.start_time && formData.start_time !== origTime;
    if (dateChanged || timeChanged) {
      const d = formData.date
        ? new Date(`${formData.date}T${formData.start_time || "00:00"}:00`)
        : null;
      const dateLabel = d
        ? d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
        : formData.date;
      const timeLabel = formData.start_time ? ` à ${formData.start_time}` : "";
      return `${name} : nouvel horaire, le ${dateLabel}${timeLabel}.`;
    }

    const placeChanged =
      (formData.location_place || "") !== (event.location_place || "") ||
      (formData.location_city || "") !== (event.location_city || "");
    if (placeChanged) {
      const loc = [formData.location_place, formData.location_city].filter(Boolean).join(", ");
      return `${name} : nouveau lieu — ${loc}.`;
    }

    return `${name} a été mis à jour.`;
  };

  // Persiste l'événement via onSave, puis envoie éventuellement la notification
  // push aux personnes l'ayant mis en favori.
  const persistAndMaybeNotify = async (payload: Partial<Event>, notify: boolean) => {
    try {
      const success = await onSave(payload);
      if (!success) return; // onSave a échoué : ne pas fermer le formulaire

      if (notify && event?.id && notificationMessage.trim()) {
        const { data: notif, error: notifError } = await supabase.functions.invoke(
          "send-event-notification",
          { body: { eventId: event.id, message: notificationMessage.trim() } },
        );
        if (notifError) {
          toast({
            title: "Notification non envoyée",
            description: notifError.message,
            variant: "destructive",
          });
        } else {
          const parts = [`${notif?.sent ?? 0} push`];
          if (notif?.emailed) parts.push(`${notif.emailed} e-mail(s)`);
          toast({
            title: "Notification envoyée",
            description: `Transmis : ${parts.join(", ")}.`,
          });
        }
      }
    } catch (e) {
      console.error('💥 [EventForm] onSave error', e);
      toast({
        title: "Erreur de sauvegarde",
        description: "Une erreur est survenue lors de la sauvegarde.",
        variant: "destructive",
      });
    }
  };

  const onSubmit = async (data: Partial<Event>) => {
    // Nettoyer les données : convertir les chaînes vides en null pour la base de données
    const cleanData = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        value === '' ? null : value
      ])
    ) as Partial<Event>;
    const cover_url = await uploadCoverIfNeeded(cleanData.cover_url || null);
    if (cover_url === undefined) return;
    const organization_id = resolveOrganizationId(cleanData.organization_id);
    const payload = { ...cleanData, cover_url, organization_id };
    // Retirer les relations jointes (non écrivables comme colonnes) éventuellement
    // présentes via EVENT_SELECT : theme, recurrence, organization.
    delete (payload as Record<string, unknown>).theme;
    delete (payload as Record<string, unknown>).recurrence;
    delete (payload as Record<string, unknown>).organization;

    // En édition, si au moins une personne a mis l'événement en favori, on
    // propose d'envoyer une notification AVANT de finaliser (le dialogue
    // enregistre puis notifie ou non selon le choix de l'admin).
    if (isEditing && (bookmarkCount ?? 0) >= 1) {
      setPendingPayload(payload);
      setNotificationMessage(buildAutoMessage());
      setShowNotifyPrompt(true);
      return;
    }

    await persistAndMaybeNotify(payload, false);
  };

  // Soumission d'un événement récurrent : valide la règle, prépare les champs
  // partagés (upload affiche + organisation + normalisation) puis délègue la
  // génération des occurrences au parent via onSaveRecurring.
  const submitRecurring = async () => {
    const currentFormData = formDataRef.current;
    const fieldErrors: { [key: string]: string } = {};

    if (!currentFormData.name?.trim()) fieldErrors.name = "Le nom de l'événement est obligatoire";
    if (!currentFormData.location_city?.trim()) fieldErrors.location_city = "La ville est obligatoire";
    if (!currentFormData.location_department?.trim()) fieldErrors.location_department = "Le département est obligatoire";
    if (!recurrence.startDate) fieldErrors.startDate = "La date de début est obligatoire";
    if (!recurrence.endDate) fieldErrors.endDate = "La date de fin est obligatoire";
    if (recurrence.startDate && recurrence.endDate && recurrence.endDate < recurrence.startDate) {
      fieldErrors.endDate = "La date de fin doit être après la date de début";
    }
    if (!recurrence.startTime?.trim()) fieldErrors.startTime = "L'heure de début est obligatoire";
    if (!recurrence.weekdays.length) fieldErrors.weekdays = "Sélectionnez au moins un jour";

    if (Object.keys(fieldErrors).length > 0) {
      setValidationErrors(fieldErrors);
      toast({
        title: "Champs obligatoires manquants",
        description: "Veuillez compléter les informations de la récurrence.",
        variant: "destructive",
      });
      return;
    }
    setValidationErrors({});

    if (currentFormData.location_department) {
      rememberLastDepartment(currentFormData.location_department);
    }

    const cover_url = await uploadCoverIfNeeded(currentFormData.cover_url || null);
    if (cover_url === undefined) return;
    const organization_id = resolveOrganizationId(currentFormData.organization_id);

    const shared: RecurringSharedFields = {
      name: currentFormData.name,
      location_place: currentFormData.location_place || null,
      location_city: formatCityName(currentFormData.location_city),
      location_department: currentFormData.location_department || null,
      price: currentFormData.price ? formatPrice(currentFormData.price) : null,
      audience: currentFormData.audience || null,
      emoji: currentFormData.emoji || null,
      url: currentFormData.url || null,
      ticketing_url: currentFormData.ticketing_url || null,
      theme_id: currentFormData.theme_id || null,
      cover_url: cover_url || null,
      organization_id,
      is_full: !!currentFormData.is_full,
      is_cancelled: !!currentFormData.is_cancelled,
    };

    try {
      await onSaveRecurring?.(recurrence, shared);
    } catch (e) {
      console.error('💥 [EventForm] onSaveRecurring error', e);
      toast({
        title: "Erreur de sauvegarde",
        description: "Une erreur est survenue lors de la création de la récurrence.",
        variant: "destructive",
      });
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Événement récurrent : chemin de soumission dédié.
    if (eventType === 'recurring') {
      await submitRecurring();
      return;
    }

    // Récupérer les valeurs actuelles depuis la ref (plus fiable)
    const currentFormData = formDataRef.current;

    // Validation manuelle simple
    const errors: string[] = [];
    const fieldErrors: {[key: string]: string} = {};
    
    if (!currentFormData.name?.trim()) {
      errors.push('Nom de l\'événement');
      fieldErrors.name = 'Le nom de l\'événement est obligatoire';
    }
    if (!currentFormData.date?.trim()) {
      errors.push('Date');
      fieldErrors.date = 'La date est obligatoire';
    }
    if (!currentFormData.start_time?.trim()) {
      errors.push('Heure de début');
      fieldErrors.start_time = "L'heure de début est obligatoire";
    }
    if (!currentFormData.location_city?.trim()) {
      errors.push('Ville');
      fieldErrors.location_city = 'La ville est obligatoire';
    }
    if (!currentFormData.location_department?.trim()) {
      errors.push('Département');
      fieldErrors.location_department = 'Le département est obligatoire';
    }

    if (errors.length > 0) {
      setValidationErrors(fieldErrors);
      toast({
        title: "Champs obligatoires manquants",
        description: `Veuillez remplir : ${errors.join(', ')}`,
        variant: "destructive",
      });
      
      // Restaurer les données après un délai pour éviter la réinitialisation
      setTimeout(() => {
        setFormData(formDataRef.current);
      }, 100);
      
      return;
    }
    
    // Nettoyer les erreurs si validation OK
    setValidationErrors({});

    // Mémoriser le département pour pré-remplir les prochains ajouts.
    if (currentFormData.location_department) {
      rememberLastDepartment(currentFormData.location_department);
    }

    // Uniformiser ville (majuscules) et prix (première lettre en majuscule) avant l'enregistrement
    const normalizedFormData = {
      ...currentFormData,
      location_city: formatCityName(currentFormData.location_city),
      price: currentFormData.price ? formatPrice(currentFormData.price) : currentFormData.price,
    };

    await onSubmit(toEventPayload(normalizedFormData));
  };

  return (
    <form onSubmit={handleFormSubmit}>
      <div className="flex flex-col md:flex-row gap-6">
        <Card className={theme === 'light' ? 'w-full md:w-3/4 bg-[#fff7e6] border-[#f3e0c7] text-[#1B263B] shadow-lg py-5' : 'w-full md:w-3/4 bg-ephemeride-light border-none text-ephemeride-foreground shadow-lg py-5'}>
          <CardContent>
            <div className="space-y-4">
              {canRecur && (
                <div className="space-y-2">
                  <Label>Type d'événement</Label>
                  <RadioGroup
                    value={eventType}
                    onValueChange={(value) => setEventType(value as 'single' | 'recurring')}
                    className="flex flex-col sm:flex-row gap-4"
                  >
                    <label htmlFor="type-single" className="flex items-center gap-2 cursor-pointer">
                      <RadioGroupItem id="type-single" value="single" />
                      <span>Événement ponctuel</span>
                    </label>
                    <label htmlFor="type-recurring" className="flex items-center gap-2 cursor-pointer">
                      <RadioGroupItem id="type-recurring" value="recurring" />
                      <span>Événement récurrent</span>
                    </label>
                  </RadioGroup>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2 md:col-span-3">
                  <Label htmlFor="name">Nom de l'événement *</Label>
                  <Input
                    id="name"
                    value={formData.name || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="ex: Atelier vélo Good'Huile"
                    className={`${theme === 'light' ? 'border-[#f3e0c7] bg-white text-[#1B263B]' : 'border-white/20 bg-white/10 text-white'} ${validationErrors.name ? 'border-red-500 focus:border-red-500' : ''}`}
                  />
                  {validationErrors.name && (
                    <p className="text-red-500 text-sm">{validationErrors.name}</p>
                  )}
                </div>
                <div className="space-y-2 md:col-span-1">
                  <Label htmlFor="theme_id">Thème visuel</Label>
                  <Select
                    value={formData.theme_id || 'none'}
                    onValueChange={value => setFormData(prev => ({ ...prev, theme_id: value === 'none' ? null : value }))}
                  >
                    <SelectTrigger className={theme === 'light' ? 'border-[#f3e0c7] bg-white text-[#1B263B]' : 'border-white/20 bg-white/10 text-white'}>
                      <SelectValue placeholder={themes ? "Choisir un thème" : (isLoadingThemes ? "Chargement..." : "Choisir un thème") } />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucun</SelectItem>
                      {themeList.map(theme => (
                        <SelectItem key={theme.id} value={theme.id}>
                          <div className="flex items-center gap-2">
                            {theme.image_url && <img src={theme.image_url} alt={theme.name} className="w-6 h-6 rounded object-cover" />}
                            <span>{theme.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Sélecteur d'organisation - visible si super admin ou plusieurs organisations */}
              {(isSuperAdmin || organizations.length > 1) && (
                <div className="space-y-2">
                  <Label htmlFor="organization_id">Organisation</Label>
                  <Select
                    value={formData.organization_id || 'none'}
                    onValueChange={value => setFormData(prev => ({ ...prev, organization_id: value === 'none' ? null : value }))}
                    disabled={organizations.length === 0}
                  >
                    <SelectTrigger className={theme === 'light' ? 'border-[#f3e0c7] bg-white text-[#1B263B]' : 'border-white/20 bg-white/10 text-white'}>
                      <SelectValue placeholder={
                        organizations.length === 0 ? "Aucune organisation disponible" :
                        organizations.length === 1 ? organizations[0].organization_name :
                        "Sélectionner une organisation"
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Option "Aucune organisation" seulement pour les super admins */}
                      {isSuperAdmin && (
                        <SelectItem value="none">Aucune organisation</SelectItem>
                      )}
                      {organizations.map(org => (
                        <SelectItem key={org.organization_id} value={org.organization_id}>
                          <div className="flex items-center justify-between w-full">
                            <span>{org.organization_name}</span>
                            {org.role && (
                              <span className="text-xs text-muted-foreground ml-2">
                                ({org.role === 'organization_admin' ? 'Admin' : 
                                  org.role === 'organization_member' ? 'Membre' : 
                                  org.role === 'super_admin' ? 'Super Admin' : org.role})
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {organizations.length === 1 && !isSuperAdmin && (
                    <p className="text-xs text-muted-foreground">
                      Événement automatiquement assigné à votre organisation
                    </p>
                  )}
                </div>
              )}

              {eventType === 'recurring' ? (
                <RecurrenceFields
                  value={recurrence}
                  onChange={setRecurrence}
                  theme={theme}
                  errors={validationErrors}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="date">Date *</Label>
                    <Input
                      id="date"
                      type="date"
                      value={formData.date || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                      className={`${theme === 'light' ? 'border-[#f3e0c7] bg-white text-[#1B263B]' : 'border-white/20 bg-white/10 text-white'} ${validationErrors.date ? 'border-red-500 focus:border-red-500' : ''}`}
                    />
                    {validationErrors.date && (
                      <p className="text-red-500 text-sm">{validationErrors.date}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="start_time">Heure de début *</Label>
                    <Input
                      id="start_time"
                      type="time"
                      value={formData.start_time || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
                      className={`${theme === 'light' ? 'border-[#f3e0c7] bg-white text-[#1B263B]' : 'border-white/20 bg-white/10 text-white'} ${validationErrors.start_time ? 'border-red-500 focus:border-red-500' : ''}`}
                    />
                    {validationErrors.start_time && (
                      <p className="text-red-500 text-sm">{validationErrors.start_time}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end_time">Heure de fin (optionnel)</Label>
                    <Input
                      id="end_time"
                      type="time"
                      value={formData.end_time || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
                      className={theme === 'light' ? 'border-[#f3e0c7] bg-white text-[#1B263B]' : 'border-white/20 bg-white/10 text-white'}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="location_place">Nom du lieu (optionnel)</Label>
                    <Input
                      id="location_place"
                      value={formData.location_place || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, location_place: e.target.value }))}
                      placeholder="ex: La Solid'"
                      className={theme === 'light' ? 'border-[#f3e0c7] bg-white text-[#1B263B]' : 'border-white/20 bg-white/10 text-white'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location_city">Ville *</Label>
                    <Input
                      id="location_city"
                      value={formData.location_city || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, location_city: e.target.value }))}
                      placeholder="ex: CLISSON"
                      className={`${theme === 'light' ? 'border-[#f3e0c7] bg-white text-[#1B263B]' : 'border-white/20 bg-white/10 text-white'} ${validationErrors.location_city ? 'border-red-500 focus:border-red-500' : ''}`}
                    />
                    {validationErrors.location_city && (
                      <p className="text-red-500 text-sm">{validationErrors.location_city}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location_department">Département *</Label>
                    <DepartmentSelect
                      id="location_department"
                      value={formData.location_department || ''}
                      onChange={(code) => setFormData(prev => ({ ...prev, location_department: code }))}
                      theme={theme}
                      hasError={!!validationErrors.location_department}
                    />
                    {validationErrors.location_department && (
                      <p className="text-red-500 text-sm">{validationErrors.location_department}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <label htmlFor="is_full" className="flex items-center gap-2 cursor-pointer w-fit">
                  <Checkbox
                    id="is_full"
                    checked={!!formData.is_full}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_full: checked === true }))}
                  />
                  <span>Événement complet</span>
                </label>

                <label htmlFor="is_cancelled" className="flex items-center gap-2 cursor-pointer w-fit">
                  <Checkbox
                    id="is_cancelled"
                    checked={!!formData.is_cancelled}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_cancelled: checked === true }))}
                  />
                  <span>Événement annulé</span>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Prix (optionnel)</Label>
                  <Input
                    id="price"
                    value={formData.price || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                    placeholder="ex: 5-8€, gratuit, prix libre"
                    className={theme === 'light' ? 'border-[#f3e0c7] bg-white text-[#1B263B]' : 'border-white/20 bg-white/10 text-white'}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="audience">Public visé (optionnel)</Label>
                  <Input
                    id="audience"
                    value={formData.audience || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, audience: e.target.value }))}
                    placeholder="ex: à partir de 3 ans, tout public"
                    className={theme === 'light' ? 'border-[#f3e0c7] bg-white text-[#1B263B]' : 'border-white/20 bg-white/10 text-white'}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emoji">Emoji (optionnel)</Label>
                  <Input
                    id="emoji"
                    value={formData.emoji || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, emoji: e.target.value }))}
                    placeholder="ex: 📖, ❤️"
                    className={theme === 'light' ? 'border-[#f3e0c7] bg-white text-[#1B263B]' : 'border-white/20 bg-white/10 text-white'}
                  />
                </div>
              </div>
              {/* Champ URL (optionnel) */}
              <div className="space-y-2">
                <Label htmlFor="url">Lien externe (optionnel)</Label>
                <Input
                  id="url"
                  type="url"
                  value={formData.url || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="ex: https://www.monevenement.com"
                  className={theme === 'light' ? 'border-[#f3e0c7] bg-white text-[#1B263B]' : 'border-white/20 bg-white/10 text-white'}
                />
              </div>

              {/* Champ URL billeterie (optionnel) */}
              <div className="space-y-2">
                <Label htmlFor="ticketing_url">Lien billeterie (optionnel)</Label>
                <Input
                  id="ticketing_url"
                  type="url"
                  value={formData.ticketing_url || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, ticketing_url: e.target.value }))}
                  placeholder="ex: https://billetterie.exemple.com"
                  className={theme === 'light' ? 'border-[#f3e0c7] bg-white text-[#1B263B]' : 'border-white/20 bg-white/10 text-white'}
                />
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Card d'upload affiche avec dropzone */}
        <Card className={theme === 'light' ? 'w-full md:w-1/4 bg-[#fff7e6] border-[#f3e0c7] text-[#1B263B] shadow-lg py-5 flex flex-col items-center justify-start min-h-[350px]' : 'w-full md:w-1/4 bg-ephemeride-light border-none text-ephemeride-foreground shadow-lg py-5 flex flex-col items-center justify-start min-h-[350px]'}>
          <CardContent className="flex flex-col items-center justify-start w-full">
            <Label className="mb-2 text-lg">Affiche</Label>
            <div className="w-full mb-4 relative group">
              {coverPreview ? (
                <>
                  <div {...getRootProps()} className="w-full h-48 p-2 flex items-center justify-center rounded cursor-pointer bg-white/10 overflow-hidden">
                    <input {...getInputProps()} />
                    <img src={coverPreview} alt="Aperçu affiche" className="rounded shadow max-h-40 object-contain w-full" />
                    {/* Bouton suppression */}
                    <button
                      type="button"
                      className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      onClick={e => { e.stopPropagation(); setCoverPreview(null); setCoverFile(null); }}
                      tabIndex={-1}
                      aria-label="Supprimer l'affiche"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </>
              ) : (
                <div
                  {...getRootProps()}
                  className={`w-full h-48 flex flex-col items-center justify-center rounded border-2 border-dashed transition-colors cursor-pointer ${isDragActive ? (theme === 'light' ? 'border-green-400 bg-green-50/10' : 'border-green-400 bg-green-50/10') : (theme === 'light' ? 'border-[#f3e0c7] bg-white' : 'border-white/20 bg-white/10')}`}
                  style={{ outline: 'none' }}
                >
                  <input {...getInputProps()} />
                  <span className="text-white/40">{isDragActive ? "Déposez l'image ici..." : "Glissez-déposez ou cliquez pour choisir une image"}</span>
                </div>
              )}
            </div>
            {isUploading && <span className="text-xs text-white/60">Upload en cours...</span>}
          </CardContent>
        </Card>
      </div>
      {/* Footer global pour les actions */}
      <div className="w-full mt-6 pt-6 flex flex-col items-center">
        <div className="flex flex-col-reverse md:flex-row gap-4 w-full max-w-2xl md:items-center md:justify-between">
          {/* Bouton de suppression à gauche (édition uniquement) */}
          {isEditing && onDelete ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  className="bg-red-600 text-white hover:bg-red-700 gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Supprimer
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer cet événement ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Cette action est irréversible. L'événement
                    {formData.name ? ` « ${formData.name} »` : ''} sera
                    définitivement supprimé.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 text-white hover:bg-red-700"
                    onClick={() => onDelete()}
                  >
                    Supprimer
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <span className="hidden md:block" />
          )}

          {/* Groupe d'actions à droite */}
          <div className="flex flex-col md:flex-row gap-4 md:justify-end">
            <Button
              variant="outline"
              onClick={onCancel}
              className={theme === 'light' ? 'border-[#f3e0c7] text-[#1B263B] hover:bg-[#ffe2b0]' : 'border-white/20 text-white hover:bg-white/10'}
              type="button"
              disabled={false}
            >
              Annuler
            </Button>
            {showValidationActions ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  className="bg-green-600 text-white hover:bg-green-700"
                  disabled={false}
                  onClick={() => onSave({ ...toEventPayload(formData), status: 'accepted' })}
                >
                  Accepter
                </Button>
                <Button
                  type="button"
                  className="bg-red-600 text-white hover:bg-red-700"
                  disabled={false}
                  onClick={() => onSave({ ...toEventPayload(formData), status: 'rejected' })}
                >
                  Refuser
                </Button>
              </div>
            ) : (
              <Button
                type="submit"
                className={theme === 'light' ? 'bg-[#fff7e6] text-[#1B263B] border-[#f3e0c7] hover:bg-[#ffe2b0] shadow-sm' : 'bg-white text-ephemeride hover:bg-white/80'}
                disabled={false}
              >
                {isEditing ? "Mettre à jour" : eventType === 'recurring' ? "Créer les événements" : "Créer l'événement"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Dialogue post-sauvegarde : proposer d'avertir les personnes ayant mis
          l'événement en favori. Apparaît après « Mettre à jour » s'il y a ≥ 1
          favori. Les deux actions enregistrent ; seule « Notifier » envoie le push. */}
      <AlertDialog open={showNotifyPrompt} onOpenChange={setShowNotifyPrompt}>
        <AlertDialogContent
          className={theme === 'light' ? 'bg-[#f8f8f6] text-ephemeride border-none' : 'bg-ephemeride-light text-ephemeride-foreground border-none'}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Prévenir les personnes intéressées ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bookmarkCount} {(bookmarkCount ?? 0) > 1 ? 'personnes ont' : 'personne a'} mis cet
              événement en favori. Vous pouvez leur envoyer une notification du changement.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1">
            <Textarea
              rows={3}
              value={notificationMessage}
              onChange={(e) => setNotificationMessage(e.target.value)}
              placeholder="Message de la notification"
              className={theme === 'light' ? 'border-[#f3e0c7] bg-white text-[#1B263B]' : 'border-white/20 bg-white/10 text-white'}
            />
            <p className="text-xs opacity-60">Message envoyé en notification push. Modifiable avant l'envoi.</p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                const payload = pendingPayload;
                if (payload) void persistAndMaybeNotify(payload, false);
              }}
            >
              Enregistrer sans notifier
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const payload = pendingPayload;
                if (payload) void persistAndMaybeNotify(payload, true);
              }}
            >
              Enregistrer et notifier
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
};

export default EventForm;