"use client";

import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/compressImage";
import type { Database } from "@/integrations/supabase/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { useDropzone } from "react-dropzone";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserRoleContext } from "@/components/UserRoleProvider";
import TipeeeSettingsCard from "@/components/settings/TipeeeSettingsCard";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { sanitizeFileName } from "@/lib/utils";

type Theme = Database["public"]["Tables"]["themes"]["Row"];
type ThemeFormValues = {
  name: string;
  image_file?: FileList;
  image_light_file?: FileList;
};

const fetchThemes = async (): Promise<Theme[]> => {
  const { data, error } = await supabase.from("themes").select("*").order("name");
  if (error) throw error;
  return data as Theme[];
};

const SettingsAdmin = () => {
  const { isSuperAdmin, isLoading: userLoading } = useUserRoleContext();
  
  // Protection : seuls les super admins peuvent accéder aux paramètres
  if (!userLoading && !isSuperAdmin) {
    return (
      <AdminLayout title="Accès refusé" subtitle="Cette page est réservée aux super administrateurs">
        <Card>
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-2">Accès refusé</h2>
            <p className="text-muted-foreground">
              Vous n'avez pas les permissions nécessaires pour accéder à cette page.
            </p>
          </CardContent>
        </Card>
      </AdminLayout>
    );
  }

  const queryClient = useQueryClient();
  const { data: themes, isLoading, error } = useQuery<Theme[]>({
    queryKey: ["themes"],
    queryFn: fetchThemes,
  });
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, reset, setValue, formState: { isSubmitting } } = useForm<ThemeFormValues>();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFileLight, setSelectedFileLight] = useState<File | null>(null);
  const [previewUrlLight, setPreviewUrlLight] = useState<string | null>(null);
  const [editTheme, setEditTheme] = useState<Theme | null>(null);
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editPreviewUrl, setEditPreviewUrl] = useState<string | null>(null);
  const [editFileLight, setEditFileLight] = useState<File | null>(null);
  const [editPreviewUrlLight, setEditPreviewUrlLight] = useState<string | null>(null);
  const { register: registerEdit, handleSubmit: handleSubmitEdit, reset: resetEdit, setValue: setValueEdit, formState: { isSubmitting: isSubmittingEdit } } = useForm<ThemeFormValues>();
  const [themeToDelete, setThemeToDelete] = useState<Theme | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageLightError, setImageLightError] = useState<string | null>(null);

  // Préremplir le formulaire d'édition à l'ouverture
  useEffect(() => {
    if (editTheme) {
      resetEdit({ name: editTheme.name });
      setEditPreviewUrl(editTheme.image_url || null);
      setEditFile(null);
      setEditPreviewUrlLight(editTheme.image_url_light || null);
      setEditFileLight(null);
    }
  }, [editTheme, resetEdit]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles[0]) {
      setSelectedFile(acceptedFiles[0]);
      setPreviewUrl(URL.createObjectURL(acceptedFiles[0]));
      // Pour react-hook-form, on simule le champ FileList
      const dt = new DataTransfer();
      dt.items.add(acceptedFiles[0]);
      setValue("image_file", dt.files as FileList, { shouldValidate: true });
    }
  }, [setValue]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    multiple: false,
  });

  const onDropLight = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles[0]) {
      setSelectedFileLight(acceptedFiles[0]);
      setPreviewUrlLight(URL.createObjectURL(acceptedFiles[0]));
      const dt = new DataTransfer();
      dt.items.add(acceptedFiles[0]);
      setValue("image_light_file", dt.files as FileList, { shouldValidate: true });
    }
  }, [setValue]);

  const { getRootProps: getRootPropsLight, getInputProps: getInputPropsLight, isDragActive: isDragActiveLight } = useDropzone({
    onDrop: onDropLight,
    accept: { "image/*": [] },
    multiple: false,
  });

  const onSubmit = async (values: ThemeFormValues) => {
    setImageError(null);
    setImageLightError(null);
    if (!selectedFile) {
      setImageError("L'image pour le mode sombre est obligatoire.");
      return;
    }
    if (!selectedFileLight) {
      setImageLightError("L'image pour le mode clair est obligatoire.");
      return;
    }
    let image_url = null;
    let image_url_light = null;
    if (selectedFile) {
      const selectedFileCompressed = await compressImage(selectedFile, { maxDimension: 512 });
      const filePath = `themes/${Date.now()}_${sanitizeFileName(selectedFileCompressed.name)}`;
      const { error: uploadError } = await supabase.storage.from('event-assets').upload(filePath, selectedFileCompressed, { upsert: true });
      if (!uploadError) {
        const { data: publicUrlData } = supabase.storage.from('event-assets').getPublicUrl(filePath);
        image_url = publicUrlData.publicUrl;
      }
    }
    if (selectedFileLight) {
      const selectedFileLightCompressed = await compressImage(selectedFileLight, { maxDimension: 512 });
      const filePathLight = `themes/${Date.now()}_${sanitizeFileName(selectedFileLightCompressed.name)}`;
      const { error: uploadErrorLight } = await supabase.storage.from('event-assets').upload(filePathLight, selectedFileLightCompressed, { upsert: true });
      if (!uploadErrorLight) {
        const { data: publicUrlDataLight } = supabase.storage.from('event-assets').getPublicUrl(filePathLight);
        image_url_light = publicUrlDataLight.publicUrl;
      }
    }
    await supabase.from("themes").insert({
      name: values.name,
      image_url,
      image_url_light,
    });
    setOpen(false);
    reset();
    setSelectedFile(null);
    setPreviewUrl(null);
    setSelectedFileLight(null);
    setPreviewUrlLight(null);
    queryClient.invalidateQueries({ queryKey: ["themes"] });
  };

  const handleDialogClose = () => {
    setOpen(false);
    reset();
    setSelectedFile(null);
    setPreviewUrl(null);
    setSelectedFileLight(null);
    setPreviewUrlLight(null);
  };

  const onDropEdit = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles[0]) {
      setEditFile(acceptedFiles[0]);
      setEditPreviewUrl(URL.createObjectURL(acceptedFiles[0]));
      const dt = new DataTransfer();
      dt.items.add(acceptedFiles[0]);
      setValueEdit("image_file", dt.files as FileList, { shouldValidate: true });
    }
  }, [setValueEdit]);

  const { getRootProps: getEditRootProps, getInputProps: getEditInputProps, isDragActive: isEditDragActive } = useDropzone({
    onDrop: onDropEdit,
    accept: { "image/*": [] },
    multiple: false,
  });

  const onDropEditLight = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles[0]) {
      setEditFileLight(acceptedFiles[0]);
      setEditPreviewUrlLight(URL.createObjectURL(acceptedFiles[0]));
      const dt = new DataTransfer();
      dt.items.add(acceptedFiles[0]);
      setValueEdit("image_light_file", dt.files as FileList, { shouldValidate: true });
    }
  }, [setValueEdit]);

  const { getRootProps: getEditRootPropsLight, getInputProps: getEditInputPropsLight, isDragActive: isEditDragActiveLight } = useDropzone({
    onDrop: onDropEditLight,
    accept: { "image/*": [] },
    multiple: false,
  });

  const onEditSubmit = async (values: ThemeFormValues) => {
    setImageError(null);
    setImageLightError(null);
    if (!editFile && !editTheme?.image_url) {
      setImageError("L'image pour le mode sombre est obligatoire.");
      return;
    }
    if (!editFileLight && !editTheme?.image_url_light) {
      setImageLightError("L'image pour le mode clair est obligatoire.");
      return;
    }
    if (!editTheme) return;
    let image_url = editTheme.image_url;
    let image_url_light = editTheme.image_url_light;
    if (editFile) {
      const editFileCompressed = await compressImage(editFile, { maxDimension: 512 });
      const filePath = `themes/${Date.now()}_${sanitizeFileName(editFileCompressed.name)}`;
      const { error: uploadError } = await supabase.storage.from('event-assets').upload(filePath, editFileCompressed, { upsert: true });
      if (!uploadError) {
        const { data: publicUrlData } = supabase.storage.from('event-assets').getPublicUrl(filePath);
        image_url = publicUrlData.publicUrl;
      }
    }
    if (editFileLight) {
      const editFileLightCompressed = await compressImage(editFileLight, { maxDimension: 512 });
      const filePathLight = `themes/${Date.now()}_${sanitizeFileName(editFileLightCompressed.name)}`;
      const { error: uploadErrorLight } = await supabase.storage.from('event-assets').upload(filePathLight, editFileLightCompressed, { upsert: true });
      if (!uploadErrorLight) {
        const { data: publicUrlDataLight } = supabase.storage.from('event-assets').getPublicUrl(filePathLight);
        image_url_light = publicUrlDataLight.publicUrl;
      }
    }
    await supabase.from("themes").update({
      name: values.name,
      image_url,
      image_url_light,
    }).eq('id', editTheme.id);
    setEditTheme(null);
    setEditFile(null);
    setEditPreviewUrl(null);
    setEditFileLight(null);
    setEditPreviewUrlLight(null);
    resetEdit();
    queryClient.invalidateQueries({ queryKey: ["themes"] });
  };

  const handleEditDialogClose = () => {
    setEditTheme(null);
    setEditFile(null);
    setEditPreviewUrl(null);
    setEditFileLight(null);
    setEditPreviewUrlLight(null);
    resetEdit();
  };

  const handleDeleteTheme = async () => {
    if (!themeToDelete) return;
    await supabase.from("themes").delete().eq("id", themeToDelete.id);
    setThemeToDelete(null);
    queryClient.invalidateQueries({ queryKey: ["themes"] });
  };

  return (
    <AdminLayout title="Paramètres" subtitle="Configuration et gestion des thèmes">
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold">Configuration du site</h2>
                <p className="text-muted-foreground">Gérez les thèmes et autres paramètres</p>
            </div>
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Thèmes</CardTitle>
                            <CardDescription>Gérez les thèmes visuels du site</CardDescription>
                        </div>
                        <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                    <Button>Ajouter un thème</Button>
                    </DialogTrigger>
                    <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Ajouter un thème</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
                        <div>
                        <label className="block mb-1">Nom</label>
                        <Input {...register("name", { required: true })} placeholder="Nom du thème" />
                        </div>
                        <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block mb-1">Image (mode sombre)</label>
                            <div {...getRootProps()} className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${isDragActive ? 'border-blue-400 bg-blue-50' : 'border-white/30 bg-white/5'}`}>
                            <input {...getInputProps()} />
                            {previewUrl ? (
                            <img src={previewUrl} alt="Prévisualisation" className="mx-auto mb-2 max-h-32 rounded" />
                            ) : (
                            <span className="text-white/70">Glissez-déposez une image ici, ou cliquez pour sélectionner un fichier</span>
                            )}
                            </div>
                            {imageError && <p className="text-red-400 text-sm mt-1">{imageError}</p>}
                        </div>
                        <div className="flex-1">
                            <label className="block mb-1">Image (mode clair)</label>
                            <div {...getRootPropsLight()} className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${isDragActiveLight ? 'border-blue-400 bg-blue-50' : 'border-white/30 bg-white/5'}`}>
                            <input {...getInputPropsLight()} />
                            {previewUrlLight ? (
                            <img src={previewUrlLight} alt="Prévisualisation mode clair" className="mx-auto mb-2 max-h-32 rounded" />
                            ) : (
                            <span className="text-white/70">Glissez-déposez une image ici, ou cliquez pour sélectionner un fichier</span>
                            )}
                            </div>
                            {imageLightError && <p className="text-red-400 text-sm mt-1">{imageLightError}</p>}
                        </div>
                        </div>
                        <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={handleDialogClose}>Annuler</Button>
                        <Button type="submit" disabled={isSubmitting}>Ajouter</Button>
                        </div>
                    </form>
                    </DialogContent>
                        </Dialog>
                    </div>
                </CardHeader>
                <CardContent>
                {isLoading && <p>Chargement…</p>}
                {error && <p className="text-red-400">Erreur lors du chargement des thèmes</p>}
                {themes && themes.length === 0 && <p>Aucun thème pour l'instant.</p>}
                {themes && themes.length > 0 && (
                    <ul className="space-y-2">
                    {themes.map((theme) => (
                        <li key={theme.id} className="flex items-center gap-4 p-2 bg-white/5 rounded">
                        <div className="flex gap-2">
                            {theme.image_url && (
                            <img src={theme.image_url} alt={theme.name + ' (sombre)'} className="w-10 h-10 object-cover rounded" />
                            )}
                            {theme.image_url_light && (
                            <img src={theme.image_url_light} alt={theme.name + ' (clair)'} className="w-10 h-10 object-cover rounded" />
                            )}
                        </div>
                        <div className="flex-1">
                            <div className="font-semibold">{theme.name}</div>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => setEditTheme(theme)}>Modifier</Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                            <Button size="sm" variant="destructive" onClick={() => setThemeToDelete(theme)}>Supprimer</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Supprimer ce thème ?</AlertDialogTitle>
                                <AlertDialogDescription>
                                Cette action est irréversible. Le thème sera définitivement supprimé.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setThemeToDelete(null)}>Annuler</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDeleteTheme}>Supprimer</AlertDialogAction>
                            </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                        </li>
                    ))}
                    </ul>
                )}
                {/* Dialog d'édition */}
                <Dialog open={!!editTheme} onOpenChange={v => { if (!v) handleEditDialogClose(); }}>
                <DialogContent>
                    <DialogHeader>
                    <DialogTitle>Modifier le thème</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmitEdit(onEditSubmit)} className="space-y-4 mt-4">
                    <div>
                        <label className="block mb-1">Nom</label>
                        <Input {...registerEdit("name", { required: true })} placeholder="Nom du thème" />
                    </div>
                    <div className="flex gap-4">
                        <div className="flex-1">
                        <label className="block mb-1">Image (mode sombre)</label>
                        <div {...getEditRootProps()} className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${isEditDragActive ? 'border-blue-400 bg-blue-50' : 'border-white/30 bg-white/5'}`}>
                            <input {...getEditInputProps()} />
                            {editPreviewUrl ? (
                            <img src={editPreviewUrl} alt="Prévisualisation mode sombre" className="mx-auto mb-2 max-h-32 rounded" />
                            ) : (
                            <span className="text-white/70">Glissez-déposez une image ici, ou cliquez pour sélectionner un fichier</span>
                            )}
                        </div>
                        {imageError && <p className="text-red-400 text-sm mt-1">{imageError}</p>}
                        </div>
                        <div className="flex-1">
                        <label className="block mb-1">Image (mode clair)</label>
                        <div {...getEditRootPropsLight()} className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${isEditDragActiveLight ? 'border-blue-400 bg-blue-50' : 'border-white/30 bg-white/5'}`}>
                            <input {...getEditInputPropsLight()} />
                            {editPreviewUrlLight ? (
                            <img src={editPreviewUrlLight} alt="Prévisualisation mode clair" className="mx-auto mb-2 max-h-32 rounded" />
                            ) : (
                            <span className="text-white/70">Glissez-déposez une image ici, ou cliquez pour sélectionner un fichier</span>
                            )}
                        </div>
                        {imageLightError && <p className="text-red-400 text-sm mt-1">{imageLightError}</p>}
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={handleEditDialogClose}>Annuler</Button>
                        <Button type="submit" disabled={isSubmittingEdit}>Enregistrer</Button>
                    </div>
                    </form>
                </DialogContent>
                </Dialog>
                </CardContent>
            </Card>
            <TipeeeSettingsCard />
        </div>
    </AdminLayout>
  );
};

export default function Page() {
  return (
    <ProtectedRoute>
      <SettingsAdmin />
    </ProtectedRoute>
  );
}
