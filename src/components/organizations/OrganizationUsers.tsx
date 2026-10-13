"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase as baseSupabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { Trash2, UserPlus } from 'lucide-react';

const supabase: SupabaseClient = baseSupabase;

type UserRole = Database["public"]["Enums"]["user_role"];
type Organization = Database["public"]["Tables"]["organizations"]["Row"];
type OrganizationUser = Database["public"]["Tables"]["organization_users"]["Row"];

interface OrganizationUsersProps {
  organization: Organization;
}

interface OrganizationUserWithEmail extends OrganizationUser {
  user_email: string;
  user_name?: string;
  user_raw_user_meta_data?: any;
}

export const OrganizationUsers: React.FC<OrganizationUsersProps> = ({ organization }) => {
  const [users, setUsers] = useState<OrganizationUserWithEmail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('organization_member');
  const [isAddingUser, setIsAddingUser] = useState(false);
  const { toast } = useToast();

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      
      // Récupérer les utilisateurs de l'organisation avec leurs emails via RPC
      const { data, error } = await supabase
        .rpc('get_organization_users_with_emails', { org_id: organization.id });

      if (error) throw error;

      // Enrichir les données avec les métadonnées utilisateur
      const enrichedUsers = (data || []).map(user => ({
        ...user,
        user_email: user.user_email || 'Email non disponible',
        user_name: user.user_raw_user_meta_data?.name || 
                   user.user_raw_user_meta_data?.full_name ||
                   user.user_email?.split('@')[0] || 
                   'Nom non disponible'
      }));

      setUsers(enrichedUsers);
    } catch (error) {
      console.error('Erreur lors de la récupération des utilisateurs:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les utilisateurs",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAddingUser(true);

    try {
      // Valider l'email
      if (!newUserEmail || !newUserEmail.includes('@')) {
        toast({
          title: "Erreur",
          description: "Veuillez saisir une adresse email valide",
          variant: "destructive",
        });
        return;
      }

      // Utiliser la fonction RPC qui gère automatiquement les utilisateurs existants
      const { data: result, error: inviteError } = await supabase
        .rpc('invite_user_to_organization', {
          p_email: newUserEmail.toLowerCase().trim(),
          p_organization_id: organization.id,
          p_role: newUserRole
        });

      if (inviteError) {
        console.error('Erreur lors de l\'invitation:', inviteError);
        toast({
          title: "Erreur",
          description: "Impossible d'inviter l'utilisateur: " + inviteError.message,
          variant: "destructive",
        });
        return;
      }

      console.log('Résultat invitation:', result);

      if (result.success) {
        if (result.user_exists) {
          // L'utilisateur existait déjà et a été ajouté directement
          toast({
            title: "Utilisateur ajouté",
            description: result.message || "L'utilisateur a été ajouté à l'organisation avec succès",
          });
          
          // Recharger la liste immédiatement car l'utilisateur a été ajouté
          await fetchUsers();
        } else {
          // Une invitation a été créée pour un nouvel utilisateur
          const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
          const baseUrl = isDevelopment ? 'http://localhost:8081' : window.location.origin; // Port 8081 pour le dev
          const invitationLink = `${baseUrl}/signup?invitation_id=${result.invitation_id}`;

          // Affichage hybride selon l'environnement
          if (isDevelopment) {
            // Développement : afficher directement le lien
            toast({
              title: "Invitation créée (dev)",
              description: (
                <div className="space-y-2">
                  <p>Invitation créée pour {newUserEmail}</p>
                  <div className="p-2 bg-muted/50 rounded text-xs">
                    <p><strong>Lien d'invitation :</strong></p>
                    <a 
                      href={invitationLink} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-400 underline break-all hover:text-blue-300"
                    >
                      {invitationLink}
                    </a>
                  </div>
                </div>
              ),
              duration: 10000,
            });
          } else {
            // Production : tenter d'envoyer l'email ET afficher le lien pour l'admin
            let emailSent = false;
            let emailError = null;

            try {
              const { data: { session } } = await supabase.auth.getSession();
              const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
              const response = await fetch(`${supabaseUrl}/functions/v1/invite-user`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  organization_id: organization.id,
                  email: newUserEmail.toLowerCase().trim(),
                  role: newUserRole,
                  send_email_only: true
                })
              });
              
              if (response.ok) {
                emailSent = true;
              } else {
                const errorData = await response.json();
                emailError = errorData.error || 'Erreur lors de l\'envoi de l\'email';
              }
            } catch (error) {
              emailError = 'Erreur lors de l\'envoi de l\'email';
            }

            const toastTitle = emailSent ? "Invitation envoyée" : "Invitation créée";
            const toastDescription = (
              <div className="space-y-2">
                <p>
                  {emailSent ? 
                    `Email envoyé à ${newUserEmail} avec le lien d'inscription.` :
                    `Invitation créée pour ${newUserEmail}. ${emailError ? `Erreur email: ${emailError}` : 'Email non envoyé.'}`
                  }
                </p>
                <div className="p-2 bg-muted/50 rounded text-xs">
                  <p><strong>Lien d'invitation :</strong></p>
                  <a 
                    href={invitationLink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-400 underline break-all hover:text-blue-300"
                  >
                    {invitationLink}
                  </a>
                  <p className="mt-1 text-muted-foreground">
                    💡 Vous pouvez partager ce lien directement si nécessaire
                  </p>
                </div>
              </div>
            );

            toast({
              title: toastTitle,
              description: toastDescription,
              duration: 8000,
            });
          }
        }
      } else {
        // Erreur retournée par la fonction
        toast({
          title: "Erreur",
          description: result.message || "Erreur lors de l'invitation",
          variant: "destructive",
        });
        return;
      }

      setShowAddUser(false);
      setNewUserEmail('');
      setNewUserRole('organization_member');
    } catch (error) {
      console.error('Erreur lors de l\'ajout de l\'utilisateur:', error);
      toast({
        title: "Erreur",
        description: "Impossible d'ajouter l'utilisateur",
        variant: "destructive",
      });
    } finally {
      setIsAddingUser(false);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('organization_users')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('organization_id', organization.id);

      if (error) throw error;

      toast({
        title: "Succès",
        description: "Utilisateur retiré de l'organisation",
      });

      fetchUsers();
    } catch (error) {
      console.error('Erreur lors de la suppression de l\'utilisateur:', error);
      toast({
        title: "Erreur",
        description: "Impossible de retirer l'utilisateur",
        variant: "destructive",
      });
    }
  };

  const getRoleBadgeVariant = (role: UserRole) => {
    switch (role) {
      case 'organization_admin':
        return 'default';
      case 'organization_member':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case 'organization_admin':
        return 'Admin Organisation';
      case 'organization_member':
        return 'Membre';
      default:
        return role;
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [organization.id]);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Utilisateurs de l'organisation</CardTitle>
            <CardDescription>
              Gérez les membres et leurs rôles dans {organization.name}
            </CardDescription>
          </div>
          <Button 
            onClick={() => setShowAddUser(true)}
            className="flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Ajouter un utilisateur
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showAddUser && (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">Ajouter un utilisateur</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddUser} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email de l'utilisateur</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    placeholder="utilisateur@example.com"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="role">Rôle</Label>
                  <Select value={newUserRole} onValueChange={(value) => setNewUserRole(value as UserRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="organization_member">Membre</SelectItem>
                      <SelectItem value="organization_admin">Admin Organisation</SelectItem>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setShowAddUser(false)}
                  >
                    Annuler
                  </Button>
                  <Button type="submit" disabled={isAddingUser}>
                    {isAddingUser ? 'Ajout...' : 'Ajouter'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div>Chargement...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Utilisateur</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Ajouté le</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{user.user_name || 'Nom non disponible'}</div>
                      <div className="text-sm text-muted-foreground">{user.user_email}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(user.role)}>
                      {getRoleLabel(user.role)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(user.created_at || '').toLocaleDateString('fr-FR')}
                  </TableCell>
                  <TableCell className="text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Retirer l'utilisateur</AlertDialogTitle>
                          <AlertDialogDescription>
                            Êtes-vous sûr de vouloir retirer cet utilisateur de l'organisation ?
                            Cette action peut être annulée en le réajoutant.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleRemoveUser(user.user_id)}
                          >
                            Retirer
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Aucun utilisateur dans cette organisation
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};