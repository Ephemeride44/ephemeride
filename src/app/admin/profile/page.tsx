"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/lib/compressImage';
import { useToast } from '@/hooks/use-toast';
import { useUserRoleContext } from '@/components/UserRoleProvider';
import { User, Lock, Mail, Save, Eye, EyeOff, Upload, X } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useDropzone } from 'react-dropzone';

const Profile: React.FC = () => {
  const { user, refreshUserData } = useUserRoleContext();
  const { toast } = useToast();
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  
  // Charger l'avatar existant
  useEffect(() => {
    if (user?.user_metadata?.avatar_url) {
      setAvatarPreview(user.user_metadata.avatar_url);
    } else {
      setAvatarPreview(null);
    }
  }, [user]);

  // Nettoyer l'URL de prévisualisation lors du démontage
  useEffect(() => {
    return () => {
      if (avatarPreview && avatarPreview.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!currentPassword || !newPassword) {
      toast({
        title: "Erreur",
        description: "Veuillez remplir tous les champs",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Erreur",
        description: "Le mot de passe doit contenir au moins 6 caractères",
        variant: "destructive",
      });
      return;
    }

    setIsChangingPassword(true);

    try {
      // Vérifier le mot de passe actuel en tentant de se reconnecter
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: currentPassword,
      });

      if (signInError) {
        toast({
          title: "Erreur",
          description: "Le mot de passe actuel est incorrect",
          variant: "destructive",
        });
        setIsChangingPassword(false);
        return;
      }

      // Mettre à jour le mot de passe
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        throw updateError;
      }

      toast({
        title: "Succès",
        description: "Votre mot de passe a été modifié avec succès",
      });

      // Réinitialiser le formulaire
      setCurrentPassword('');
      setNewPassword('');
      setShowPasswordForm(false);
    } catch (error: any) {
      console.error('Erreur lors du changement de mot de passe:', error);
      toast({
        title: "Erreur",
        description: error.message || "Impossible de modifier le mot de passe",
        variant: "destructive",
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const getUserDisplayName = () => {
    if (user?.user_metadata?.name) return user.user_metadata.name;
    if (user?.user_metadata?.full_name) return user.user_metadata.full_name;
    return user?.email?.split('@')[0] || 'Utilisateur';
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles[0]) {
      const file = acceptedFiles[0];
      // Vérifier le type de fichier
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Erreur",
          description: "Veuillez sélectionner une image",
          variant: "destructive",
        });
        return;
      }
      // Vérifier la taille (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "Erreur",
          description: "L'image ne doit pas dépasser 5MB",
          variant: "destructive",
        });
        return;
      }
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    multiple: false,
    disabled: isUploadingAvatar,
  });

  const handleUploadAvatar = async () => {
    if (!avatarFile || !user) {
      return;
    }

    setIsUploadingAvatar(true);

    try {
      // Supprimer l'ancien avatar si il existe
      if (user.user_metadata?.avatar_url) {
        try {
          // Extraire le chemin depuis l'URL complète
          const url = new URL(user.user_metadata.avatar_url);
          const pathParts = url.pathname.split('/');
          const avatarsIndex = pathParts.indexOf('avatars');
          if (avatarsIndex !== -1 && pathParts.length > avatarsIndex + 1) {
            const filePath = pathParts.slice(avatarsIndex + 1).join('/');
            await supabase.storage.from('avatars').remove([filePath]);
          }
        } catch (error) {
          // Si l'extraction échoue, on continue quand même
          console.warn('Impossible de supprimer l\'ancien avatar:', error);
        }
      }

      // Uploader le nouvel avatar dans le bucket avatars
      const file = await compressImage(avatarFile, { maxDimension: 512 });
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      // Stocker dans un dossier avec le user_id pour les politiques RLS
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      // Obtenir l'URL publique
      const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Mettre à jour les métadonnées utilisateur
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          ...user.user_metadata,
          avatar_url: publicUrlData.publicUrl,
        },
      });

      if (updateError) {
        throw updateError;
      }

      toast({
        title: "Succès",
        description: "Votre avatar a été mis à jour avec succès",
      });

      // Rafraîchir les données utilisateur
      if (refreshUserData) {
        await refreshUserData();
      } else {
        // Fallback : recharger la session
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setAvatarPreview(session.user.user_metadata?.avatar_url || null);
        }
      }
      
      // Réinitialiser le fichier
      setAvatarFile(null);
    } catch (error: any) {
      console.error('Erreur lors de l\'upload de l\'avatar:', error);
      toast({
        title: "Erreur",
        description: error.message || "Impossible de mettre à jour l'avatar",
        variant: "destructive",
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user?.user_metadata?.avatar_url) {
      return;
    }

    setIsUploadingAvatar(true);

    try {
      // Supprimer l'avatar du storage
      try {
        const url = new URL(user.user_metadata.avatar_url);
        const pathParts = url.pathname.split('/');
        const avatarsIndex = pathParts.indexOf('avatars');
        if (avatarsIndex !== -1 && pathParts.length > avatarsIndex + 1) {
          const filePath = pathParts.slice(avatarsIndex + 1).join('/');
          await supabase.storage.from('avatars').remove([filePath]);
        }
      } catch (error) {
        console.warn('Impossible de supprimer l\'avatar du storage:', error);
      }

      // Mettre à jour les métadonnées utilisateur
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          ...user.user_metadata,
          avatar_url: null,
        },
      });

      if (updateError) {
        throw updateError;
      }

      toast({
        title: "Succès",
        description: "Votre avatar a été supprimé",
      });

      // Rafraîchir les données utilisateur
      if (refreshUserData) {
        await refreshUserData();
      } else {
        // Fallback : recharger la session
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setAvatarPreview(session.user.user_metadata?.avatar_url || null);
        }
      }
      
      // Réinitialiser
      setAvatarFile(null);
      setAvatarPreview(null);
    } catch (error: any) {
      console.error('Erreur lors de la suppression de l\'avatar:', error);
      toast({
        title: "Erreur",
        description: error.message || "Impossible de supprimer l'avatar",
        variant: "destructive",
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  return (
    <AdminLayout title="Mon Profil" subtitle="Gérez vos informations personnelles">
      <div className="space-y-6">
        {/* Informations du profil */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <User className="w-5 h-5" />
              <CardTitle>Informations du profil</CardTitle>
            </div>
            <CardDescription>
              Vos informations personnelles et de connexion
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-start space-x-4">
                <div className="flex flex-col items-center space-y-2">
                  <div className="relative">
                    {avatarPreview ? (
                      <img
                        src={avatarPreview}
                        alt="Avatar"
                        className="w-16 h-16 rounded-full object-cover border-2 border-primary"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-2xl font-medium">
                        {getUserDisplayName().charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <div {...getRootProps()} className="cursor-pointer">
                      <input {...getInputProps()} />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-1"
                        disabled={isUploadingAvatar}
                      >
                        <Upload className="w-3 h-3" />
                        <span className="text-xs">Changer</span>
                      </Button>
                    </div>
                    {avatarFile && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleUploadAvatar}
                        disabled={isUploadingAvatar}
                        className="flex items-center gap-1"
                      >
                        <Save className="w-3 h-3" />
                        <span className="text-xs">{isUploadingAvatar ? 'Envoi...' : 'Enregistrer'}</span>
                      </Button>
                    )}
                    {(avatarPreview && !avatarFile) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleRemoveAvatar}
                        disabled={isUploadingAvatar}
                        className="flex items-center gap-1 text-destructive hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                        <span className="text-xs">Supprimer</span>
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{getUserDisplayName()}</h3>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    {user?.email}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Informations détaillées */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">Email</Label>
                <p className="text-sm font-medium mt-1">{user?.email || 'Non disponible'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Nom d'utilisateur</Label>
                <p className="text-sm font-medium mt-1">{getUserDisplayName()}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Date de création</Label>
                <p className="text-sm font-medium mt-1">
                  {user?.created_at 
                    ? new Date(user.created_at).toLocaleDateString('fr-FR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })
                    : 'Non disponible'}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Dernière connexion</Label>
                <p className="text-sm font-medium mt-1">
                  {user?.last_sign_in_at
                    ? new Date(user.last_sign_in_at).toLocaleDateString('fr-FR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : 'Non disponible'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Changement de mot de passe */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Lock className="w-5 h-5" />
              <CardTitle>Sécurité</CardTitle>
            </div>
            <CardDescription>
              Modifiez votre mot de passe pour sécuriser votre compte
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!showPasswordForm ? (
              <Button
                onClick={() => setShowPasswordForm(true)}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Lock className="w-4 h-4" />
                Modifier le mot de passe
              </Button>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Mot de passe actuel</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Entrez votre mot de passe actuel"
                      required
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">Nouveau mot de passe</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Entrez votre nouveau mot de passe"
                      required
                      minLength={6}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Le mot de passe doit contenir au moins 6 caractères
                  </p>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowPasswordForm(false);
                      setCurrentPassword('');
                      setNewPassword('');
                      setShowCurrentPassword(false);
                      setShowNewPassword(false);
                    }}
                    disabled={isChangingPassword}
                  >
                    Annuler
                  </Button>
                  <Button
                    type="submit"
                    disabled={isChangingPassword}
                    className="flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {isChangingPassword ? 'Modification...' : 'Enregistrer'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default function Page() {
  return (
    <ProtectedRoute>
      <Profile />
    </ProtectedRoute>
  );
}

