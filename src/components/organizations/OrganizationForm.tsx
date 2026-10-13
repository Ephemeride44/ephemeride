"use client";

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Camera, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { GradientAvatar } from '@/components/account/GradientAvatar';
import { useToast } from '@/hooks/use-toast';
import { supabase as baseSupabase } from '@/integrations/supabase/client';
import { compressImage } from '@/lib/compressImage';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const supabase: SupabaseClient = baseSupabase;

type Organization = Database["public"]["Tables"]["organizations"]["Row"];

interface OrganizationFormProps {
  organization?: Organization;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const OrganizationForm: React.FC<OrganizationFormProps> = ({
  organization,
  onSuccess,
  onCancel,
}) => {
  const [formData, setFormData] = useState({
    name: organization?.name || '',
    description: organization?.description || '',
    contact_email: organization?.contact_email || '',
    contact_phone: organization?.contact_phone || '',
    address: organization?.address || '',
    website_url: organization?.website_url || '',
    location_city: (organization as { location_city?: string | null } | undefined)?.location_city || '',
    location_department:
      (organization as { location_department?: string | null } | undefined)?.location_department || '',
    logo_url: (organization as { logo_url?: string | null } | undefined)?.logo_url || '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const { toast } = useToast();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Upload du logo dans le bucket public `event-assets` (dossier `covers/`,
  // autorisé en écriture aux utilisateurs authentifiés — même bucket que les
  // affiches d'événements).
  const onDropLogo = useCallback(
    async (files: File[]) => {
      if (!files[0]) return;
      if (!files[0].type.startsWith('image/')) {
        toast({ title: 'Format invalide', description: 'Sélectionnez une image (JPG ou PNG).', variant: 'destructive' });
        return;
      }
      // Logo affiché en avatar (≤ 80px) : 512px suffisent largement.
      const file = await compressImage(files[0], { maxDimension: 512 });
      if (file.size > 2 * 1024 * 1024) {
        toast({ title: 'Image trop lourde', description: '2 Mo maximum.', variant: 'destructive' });
        return;
      }
      setIsUploadingLogo(true);
      try {
        const ext = file.name.split('.').pop() || 'png';
        const filePath = `covers/org-logo-${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from('event-assets').upload(filePath, file, { upsert: true });
        if (error) throw error;
        const { data } = supabase.storage.from('event-assets').getPublicUrl(filePath);
        setFormData(prev => ({ ...prev, logo_url: data.publicUrl }));
        toast({ title: 'Logo mis à jour' });
      } catch (error) {
        toast({
          title: 'Échec de l\'envoi',
          description: error instanceof Error ? error.message : 'Réessayez plus tard.',
          variant: 'destructive',
        });
      } finally {
        setIsUploadingLogo(false);
      }
    },
    [toast],
  );

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: onDropLogo,
    accept: { 'image/*': [] },
    multiple: false,
    disabled: isUploadingLogo,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = organization
        ? await supabase.from('organizations').update(formData).eq('id', organization.id)
        : await supabase.from('organizations').insert([formData]);

      if (result.error) throw result.error;

      toast({
        title: 'Succès',
        description: organization
          ? 'Organisation mise à jour avec succès'
          : 'Organisation créée avec succès',
      });
      onSuccess?.();
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de l\'organisation:', error);
      toast({
        title: 'Erreur',
        description: 'Une erreur s\'est produite lors de la sauvegarde',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Identité : logo + nom + site */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center gap-2">
          <div
            {...getRootProps()}
            className="group relative cursor-pointer rounded-full"
            title="Changer le logo"
          >
            <input {...getInputProps()} aria-label="Importer un logo" />
            <GradientAvatar name={formData.name || '?'} src={formData.logo_url} className="h-20 w-20" textClassName="text-xl" />
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-[uploading=true]:opacity-100" data-uploading={isUploadingLogo}>
              {isUploadingLogo ? (
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              ) : (
                <Camera className="h-5 w-5 text-white" />
              )}
            </div>
          </div>
          {formData.logo_url && (
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, logo_url: '' }))}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3" />
              Retirer
            </button>
          )}
        </div>

        <div className="flex-1 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nom de l'organisation *</Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="Ex: Festival de Jazz de Nantes"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="website_url">Site web</Label>
            <Input
              id="website_url"
              name="website_url"
              type="url"
              value={formData.website_url}
              onChange={handleChange}
              placeholder="https://www.organisation.fr"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder="Description de l'organisation..."
          rows={3}
        />
      </div>

      <Separator />

      {/* Localisation */}
      <div className="space-y-4">
        <p className="text-sm font-medium text-muted-foreground">Localisation</p>
        <div className="space-y-2">
          <Label htmlFor="address">Adresse</Label>
          <Input
            id="address"
            name="address"
            value={formData.address}
            onChange={handleChange}
            placeholder="123 Rue de la Musique, 44000 Nantes"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="location_city">Commune</Label>
            <Input
              id="location_city"
              name="location_city"
              value={formData.location_city}
              onChange={handleChange}
              placeholder="Ex: Clisson"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location_department">Département (code)</Label>
            <Input
              id="location_department"
              name="location_department"
              value={formData.location_department}
              onChange={handleChange}
              placeholder="Ex: 44"
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Contact */}
      <div className="space-y-4">
        <p className="text-sm font-medium text-muted-foreground">Contact</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="contact_email">Email de contact</Label>
            <Input
              id="contact_email"
              name="contact_email"
              type="email"
              value={formData.contact_email}
              onChange={handleChange}
              placeholder="contact@organisation.fr"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact_phone">Téléphone</Label>
            <Input
              id="contact_phone"
              name="contact_phone"
              value={formData.contact_phone}
              onChange={handleChange}
              placeholder="02 XX XX XX XX"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Annuler
          </Button>
        )}
        <Button type="submit" disabled={isLoading || isUploadingLogo}>
          {isLoading ? 'Sauvegarde...' : organization ? 'Mettre à jour' : 'Créer'}
        </Button>
      </div>
    </form>
  );
};
