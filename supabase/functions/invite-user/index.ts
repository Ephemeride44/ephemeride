import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  console.log('Edge Function invite-user called');
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
    // Créer un client pour vérifier l'authentification de l'utilisateur
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '');
    // Récupérer l'authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({
        error: 'Token d\'authentification requis'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const token = authHeader.replace('Bearer ', '');
    // Vérifier l'utilisateur
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({
        error: 'Non autorisé'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Parse request body
    const { organization_id, email, role = 'organization_member', send_email_only = false } = await req.json();
    if (!organization_id || !email) {
      return new Response(JSON.stringify({
        error: 'organization_id et email sont requis'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log('Request params:', {
      organization_id,
      email,
      role,
      send_email_only
    });
    // Vérifier que l'utilisateur a le droit d'inviter
    const { data: canInvite } = await supabaseClient.rpc('is_organization_admin', {
      org_uuid: organization_id,
      user_uuid: user.id
    });
    const { data: isSuperAdmin } = await supabaseClient.rpc('is_super_admin', {
      user_uuid: user.id
    });
    if (!canInvite && !isSuperAdmin) {
      return new Response(JSON.stringify({
        error: 'Permission refusée'
      }), {
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Récupérer les informations de l'organisation
    const { data: organization, error: orgError } = await supabaseAdmin.from('organizations').select('name').eq('id', organization_id).single();
    if (orgError || !organization) {
      return new Response(JSON.stringify({
        error: 'Organisation introuvable'
      }), {
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Si c'est juste pour envoyer l'email, récupérer l'invitation existante
    let invitationId;
    if (send_email_only) {
      const { data: existingInvitation } = await supabaseAdmin.from('organization_invitations').select('id').eq('organization_id', organization_id).eq('email', email).eq('is_used', false).order('created_at', {
        ascending: false
      }).limit(1).single();
      if (!existingInvitation) {
        return new Response(JSON.stringify({
          error: 'Aucune invitation valide trouvée'
        }), {
          status: 404,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      invitationId = existingInvitation.id;
    }
    // Déterminer l'URL du site
    const siteUrl = Deno.env.get('SITE_URL') || 'https://votre-site.com';
    const inviteUrl = `${siteUrl}/signup?invitation_id=${invitationId}`;
    console.log('Sending invitation email to:', email);
    console.log('Invitation URL:', inviteUrl);
    // Envoyer l'email d'invitation
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: inviteUrl,
      data: {
        organization_id,
        organization_name: organization.name,
        role,
        invitation_id: invitationId
      }
    });
    if (inviteError) {
      console.error('Erreur envoi email:', inviteError);
      return new Response(JSON.stringify({
        error: `Erreur lors de l'envoi de l'invitation: ${inviteError.message}`
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log('Email sent successfully');
    return new Response(JSON.stringify({
      success: true,
      message: 'Email d\'invitation envoyé avec succès',
      invitation_id: invitationId
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Unhandled error:', error);
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
