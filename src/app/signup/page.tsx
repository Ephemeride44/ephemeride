"use client";

import React, { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export const dynamic = "force-dynamic";

type OrganizationInvitation = Database["public"]["Tables"]["organization_invitations"]["Row"];

const Signup: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const [invitation, setInvitation] = useState<OrganizationInvitation | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingInvitation, setLoadingInvitation] = useState(true);

  const invitationId = searchParams.get('invitation_id');

  useEffect(() => {
    const loadInvitation = async () => {
      if (!invitationId) {
        setLoadingInvitation(false);
        return;
      }

      try {
        console.log('Loading invitation:', invitationId);
        
        const { data, error } = await supabase
          .from('organization_invitations')
          .select(`
            *,
            organizations (
              name
            )
          `)
          .eq('id', invitationId)
          .eq('is_used', false)
          .gt('expires_at', new Date().toISOString())
          .single();

        console.log('Invitation query result:', { data, error });

        if (error || !data) {
          console.error('Failed to load invitation:', error);
          toast({
            title: "Invitation invalide",
            description: `Cette invitation n'existe pas ou a expiré. Erreur: ${error?.message || 'Aucune donnée'}`,
            variant: "destructive",
          });
          router.push('/');
          return;
        }

        setInvitation(data);
        setEmail(data.email);
      } catch (error) {
        console.error('Erreur lors du chargement de l\'invitation:', error);
        toast({
          title: "Erreur",
          description: "Impossible de charger l'invitation",
          variant: "destructive",
        });
        router.push('/');
      } finally {
        setLoadingInvitation(false);
      }
    };

    loadInvitation();
  }, [invitationId, router, toast]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validation
      if (password !== confirmPassword) {
        toast({
          title: "Erreur",
          description: "Les mots de passe ne correspondent pas",
          variant: "destructive",
        });
        return;
      }

      if (password.length < 6) {
        toast({
          title: "Erreur",
          description: "Le mot de passe doit contenir au moins 6 caractères",
          variant: "destructive",
        });
        return;
      }

      // Inscription avec Supabase et trigger automatique
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            invitation_id: invitationId // Le trigger utilisera cette info
          }
        }
      });

      if (error) {
        console.error('Erreur lors de l\'inscription:', error);
        toast({
          title: "Erreur d'inscription",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      if (data.user) {        // Essayer de confirmer l'email via Edge Function si c'est une invitation
        if (invitationId) {
          try {
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            await fetch(`${supabaseUrl}/functions/v1/confirm-invited-user`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                user_id: data.user.id,
                email: email
              })
            });
          } catch (error) {
            console.warn('Impossible de confirmer automatiquement l\'email:', error);
          }
        }
        
        toast({
          title: "Inscription réussie !",
          description: invitationId ? 
            "Votre compte a été créé et vous avez rejoint l'organisation. Vous pouvez maintenant vous connecter." :
            "Votre compte a été créé. Vérifiez votre email pour confirmer votre inscription.",
        });
      } else {
        toast({
          title: "Erreur",
          description: "Problème lors de la création du compte",
          variant: "destructive",
        });
        return;
      }

      // Redirection vers la page de connexion
      router.push('/admin');
    } catch (error) {
      console.error('Erreur lors de l\'inscription:', error);
      toast({
        title: "Erreur",
        description: "Une erreur inattendue s'est produite",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (loadingInvitation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">Chargement...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            {invitation ? 'Rejoindre l\'organisation' : 'Créer un compte'}
          </CardTitle>
          <CardDescription>
            {invitation ? (
              <>
                Vous avez été invité à rejoindre <strong>{(invitation as any).organizations?.name}</strong>
              </>
            ) : (
              'Créez votre compte pour accéder à Éphéméride'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                required
                disabled={!!invitation}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Création en cours...' : 'Créer le compte'}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <p className="text-sm text-muted-foreground">
              Vous avez déjà un compte ?{' '}
              <Button variant="link" className="p-0" onClick={() => router.push('/admin')}>
                Se connecter
              </Button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <Signup />
    </Suspense>
  );
}
