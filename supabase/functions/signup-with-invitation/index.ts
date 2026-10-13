import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  console.log('Edge Function signup-with-invitation called');
  // Gérer les requêtes CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // Créer un client Supabase avec les permissions service_role
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    console.log('Parsing request body...');
    let requestBody;
    try {
      requestBody = await req.json();
      console.log('Request body parsed:', {
        email: requestBody.email,
        invitation_id: requestBody.invitation_id
      });
    } catch (e) {
      console.error('Failed to parse request body:', e);
      return new Response(JSON.stringify({
        error: 'Corps de requête invalide'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const { email, password, invitation_id } = requestBody;
    if (!email || !password || !invitation_id) {
      console.error('Missing required fields:', {
        email: !!email,
        password: !!password,
        invitation_id: !!invitation_id
      });
      return new Response(JSON.stringify({
        error: 'Email, mot de passe et invitation_id requis'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log('Validating invitation:', invitation_id);
    // Vérifier que l'invitation existe et est valide
    const { data: invitation, error: invitationError } = await supabaseAdmin.from('organization_invitations').select('*').eq('id', invitation_id).eq('email', email).eq('is_used', false).gt('expires_at', new Date().toISOString()).single();
    console.log('Invitation validation result:', {
      invitation: !!invitation,
      error: invitationError
    });
    if (invitationError || !invitation) {
      console.error('Invalid invitation:', invitationError);
      return new Response(JSON.stringify({
        error: 'Invitation invalide ou expirée'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log('Creating user...');
    // Créer l'utilisateur avec confirmation automatique
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        invitation_id,
        organization_id: invitation.organization_id,
        invited_role: invitation.role
      }
    });
    console.log('User creation result:', {
      user: !!userData?.user,
      error: userError
    });
    if (userError) {
      console.error('Error creating user:', userError);
      return new Response(JSON.stringify({
        error: `Erreur lors de la création du compte: ${userError.message}`
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    if (!userData?.user) {
      console.error('No user data returned');
      return new Response(JSON.stringify({
        error: 'Erreur lors de la création du compte: aucune donnée utilisateur'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log('User created successfully:', userData.user.id);
    // Ajouter l'utilisateur à l'organisation
    console.log('Adding user to organization...');
    const { error: orgError } = await supabaseAdmin.from('organization_users').insert({
      user_id: userData.user.id,
      organization_id: invitation.organization_id,
      role: invitation.role,
      is_active: true
    });
    if (orgError) {
      console.error('Error adding user to organization:', orgError);
      // Ne pas échouer complètement, on peut corriger ça plus tard
      console.log('User creation succeeded, but organization assignment failed');
    } else {
      console.log('User added to organization successfully');
    }
    // Marquer l'invitation comme utilisée
    console.log('Marking invitation as used...');
    const { error: updateError } = await supabaseAdmin.from('organization_invitations').update({
      is_used: true,
      accepted_at: new Date().toISOString()
    }).eq('id', invitation_id);
    if (updateError) {
      console.error('Error updating invitation:', updateError);
    } else {
      console.log('Invitation marked as used successfully');
    }
    console.log('Signup process completed successfully');
    return new Response(JSON.stringify({
      success: true,
      message: 'Compte créé avec succès',
      user_id: userData.user.id,
      organization_assigned: !orgError
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Unhandled error in signup-with-invitation:', error);
    return new Response(JSON.stringify({
      error: 'Erreur interne du serveur',
      details: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
