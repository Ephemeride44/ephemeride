"use client";

import React, { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useUserRoleContext } from '@/components/UserRoleProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Crown, Shield, Power, PowerOff, Trash2 } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type SuperAdmin = Database['public']['Tables']['super_admins']['Row'] & {
  user_email?: string;
  user_name?: string;
  user_raw_user_meta_data?: any;
};

const SuperAdminsAdmin: React.FC = () => {
  const { isSuperAdmin } = useUserRoleContext();
  const { toast } = useToast();
  
  const [superAdmins, setSuperAdmins] = useState<SuperAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [adminToDelete, setAdminToDelete] = useState<SuperAdmin | null>(null);
  const [showPermanentDeleteConfirm, setShowPermanentDeleteConfirm] = useState(false);
  const [adminToPermanentDelete, setAdminToPermanentDelete] = useState<SuperAdmin | null>(null);

  const fetchSuperAdmins = async () => {
    try {
      setLoading(true);
      
      // Récupérer les super admins avec les données utilisateur via RPC
      const { data, error } = await supabase
        .rpc('get_super_admins_with_user_info' as any);

      if (error) {
        console.error('Erreur détaillée super admins:', error);
        throw error;
      }

      // Enrichir les données avec les métadonnées utilisateur
      const enrichedData: SuperAdmin[] = ((data as any) || []).map((admin: any) => ({
        ...admin,
        user_email: admin.user_email || 'Email non disponible',
        user_name: admin.user_raw_user_meta_data?.name || 
                   admin.user_raw_user_meta_data?.full_name ||
                   admin.user_email?.split('@')[0] || 
                   'Nom non disponible'
      }));

      setSuperAdmins(enrichedData);
    } catch (error) {
      console.error('Erreur lors de la récupération des super admins:', error);
      toast({
        title: "Erreur",
        description: "Impossible de récupérer la liste des super admins",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddSuperAdmin = async () => {
    if (!newUserEmail.trim()) {
      toast({
        title: "Erreur",
        description: "Veuillez saisir un email",
        variant: "destructive",
      });
      return;
    }

    try {
      // Valider le format de l'email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newUserEmail.trim())) {
        toast({
          title: "Erreur",
          description: "Veuillez saisir une adresse email valide",
          variant: "destructive",
        });
        return;
      }

      // Appeler l'Edge Function pour inviter le super admin
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Erreur",
          description: "Vous devez être connecté pour effectuer cette action",
          variant: "destructive",
        });
        return;
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/invite-super-admin`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: newUserEmail.toLowerCase().trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors de l\'invitation');
      }

      // Succès
      toast({
        title: "Succès",
        description: result.message || "Le super administrateur a été ajouté avec succès",
      });

      // Fermer le formulaire et réinitialiser
      setShowAddForm(false);
      setNewUserEmail('');

      // Rafraîchir la liste des super admins
      await fetchSuperAdmins();
    } catch (error: any) {
      console.error('Erreur lors de l\'ajout du super admin:', error);
      toast({
        title: "Erreur",
        description: error.message || "Impossible d'ajouter le super admin",
        variant: "destructive",
      });
    }
  };

  const handleToggleSuperAdminStatus = async (admin: SuperAdmin, activate: boolean) => {
    try {
      const { error } = await supabase
        .from('super_admins')
        .update({ is_active: activate })
        .eq('id', admin.id);

      if (error) throw error;

      toast({
        title: activate ? "Super admin réactivé" : "Super admin désactivé",
        description: activate 
          ? "Le super admin a été réactivé avec succès"
          : "Le super admin a été désactivé avec succès",
      });

      setShowDeleteConfirm(false);
      setAdminToDelete(null);
      await fetchSuperAdmins();
    } catch (error) {
      console.error('Erreur lors de la modification du statut:', error);
      toast({
        title: "Erreur",
        description: activate 
          ? "Impossible de réactiver le super admin"
          : "Impossible de désactiver le super admin",
        variant: "destructive",
      });
    }
  };

  const handleDeleteSuperAdmin = async (admin: SuperAdmin) => {
    await handleToggleSuperAdminStatus(admin, false);
  };

  const handlePermanentDeleteSuperAdmin = async (admin: SuperAdmin) => {
    try {
      const { error } = await supabase
        .from('super_admins')
        .delete()
        .eq('id', admin.id);

      if (error) throw error;

      toast({
        title: "Super admin supprimé définitivement",
        description: "Le super administrateur a été supprimé définitivement de la base de données",
      });

      setShowPermanentDeleteConfirm(false);
      setAdminToPermanentDelete(null);
      await fetchSuperAdmins();
    } catch (error) {
      console.error('Erreur lors de la suppression définitive:', error);
      toast({
        title: "Erreur",
        description: "Impossible de supprimer définitivement le super admin",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchSuperAdmins();
  }, []);

  // Redirection si pas super admin
  if (!isSuperAdmin) {
    return (
      <AdminLayout title="Accès refusé" subtitle="">
        <Card>
          <CardContent className="p-8 text-center">
            <Shield className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-2xl font-bold mb-2">Accès refusé</h2>
            <p className="text-muted-foreground">
              Vous n'avez pas les permissions nécessaires pour accéder à cette page.
            </p>
          </CardContent>
        </Card>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Super Administrateurs" subtitle="Gestion des super administrateurs du système">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Crown className="w-5 h-5 text-amber-600" />
                <CardTitle>Liste des Super Administrateurs</CardTitle>
              </div>
              <Button onClick={() => setShowAddForm(true)} className="flex items-center space-x-2">
                <Plus className="w-4 h-4" />
                <span>Ajouter un Super Admin</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <p>Chargement...</p>
              </div>
            ) : superAdmins.length === 0 ? (
              <div className="text-center py-8">
                <Crown className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Aucun super administrateur trouvé</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Créé le</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {superAdmins.map((admin) => (
                    <TableRow key={admin.id}>
                      <TableCell>
                        <div>
                          <div className="text-sm font-medium">{admin.user_email}</div>
                          {admin.user_name && admin.user_name !== admin.user_email?.split('@')[0] && (
                            <div className="text-xs text-muted-foreground">{admin.user_name}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={admin.is_active ? "default" : "secondary"}>
                          {admin.is_active ? "Actif" : "Inactif"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {admin.created_at ? new Date(admin.created_at).toLocaleDateString('fr-FR') : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {admin.is_active ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setAdminToDelete(admin);
                                setShowDeleteConfirm(true);
                              }}
                              className="text-destructive hover:text-destructive"
                            >
                              <PowerOff className="w-4 h-4 mr-1" />
                              Désactiver
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleToggleSuperAdminStatus(admin, true)}
                                className="text-green-600 hover:text-green-700"
                              >
                                <Power className="w-4 h-4 mr-1" />
                                Réactiver
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setAdminToPermanentDelete(admin);
                                  setShowPermanentDeleteConfirm(true);
                                }}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="w-4 h-4 mr-1" />
                                Supprimer
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog d'ajout */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un Super Administrateur</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="email">Email de l'utilisateur</Label>
              <Input
                id="email"
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="admin@exemple.com"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowAddForm(false)}>
                Annuler
              </Button>
              <Button onClick={handleAddSuperAdmin}>
                Ajouter
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmation de désactivation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={(open) => {
        setShowDeleteConfirm(open);
        if (!open) {
          setAdminToDelete(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la désactivation</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir désactiver le super administrateur{' '}
              <strong>{adminToDelete?.user_email}</strong> ?
              <br />
              <br />
              Cette action peut être annulée en réactivant le compte. Le super administrateur perdra 
              temporairement ses privilèges d'administration.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowDeleteConfirm(false);
              setAdminToDelete(null);
            }}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => adminToDelete && handleDeleteSuperAdmin(adminToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Désactiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmation de suppression définitive */}
      <AlertDialog open={showPermanentDeleteConfirm} onOpenChange={(open) => {
        setShowPermanentDeleteConfirm(open);
        if (!open) {
          setAdminToPermanentDelete(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression définitive</AlertDialogTitle>
            <AlertDialogDescription>
              ⚠️ <strong>Attention : Cette action est irréversible !</strong>
              <br />
              <br />
              Êtes-vous absolument sûr de vouloir supprimer définitivement le super administrateur{' '}
              <strong>{adminToPermanentDelete?.user_email}</strong> ?
              <br />
              <br />
              Cette action supprimera complètement l'entrée de la base de données. Le super administrateur 
              devra être réinvité pour retrouver ses privilèges.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowPermanentDeleteConfirm(false);
              setAdminToPermanentDelete(null);
            }}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => adminToPermanentDelete && handlePermanentDeleteSuperAdmin(adminToPermanentDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default function Page() {
  return (
    <ProtectedRoute>
      <SuperAdminsAdmin />
    </ProtectedRoute>
  );
}
