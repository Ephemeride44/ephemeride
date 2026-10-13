import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
Deno.serve(async (req)=>{
  console.log('Edge Function invite-super-admin called');
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
    // Vérifier l'utilisateur et qu'il est super admin
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
    // Vérifier que l'utilisateur est super admin
    const { data: isSuperAdmin } = await supabaseClient.rpc('is_super_admin', {
      user_uuid: user.id
    });
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({
        error: 'Permission refusée. Seuls les super admins peuvent inviter.'
      }), {
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Parse request body
    const { email } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({
        error: 'email est requis'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const normalizedEmail = email.toLowerCase().trim();
    console.log('Inviting super admin:', normalizedEmail);
    // Vérifier si l'utilisateur existe déjà en cherchant par email
    let existingUser = null;
    let userId;
    try {
      const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (!listError && usersData?.users) {
        existingUser = usersData.users.find((u)=>u.email?.toLowerCase() === normalizedEmail);
      }
    } catch (error) {
      console.warn('Erreur lors de la recherche, on continue:', error);
    }
    if (existingUser) {
      // L'utilisateur existe déjà
      userId = existingUser.id;
      console.log('Utilisateur existant trouvé:', userId);
      // Vérifier si l'utilisateur est déjà super admin
      const { data: existingSuperAdmin } = await supabaseAdmin.from('super_admins').select('id').eq('user_id', userId).eq('is_active', true).maybeSingle();
      if (existingSuperAdmin) {
        return new Response(JSON.stringify({
          error: 'Cet utilisateur est déjà super administrateur'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    } else {
      // Créer l'utilisateur et envoyer l'invitation par email
      const siteUrl = Deno.env.get('SITE_URL') || 'https://ephemeride.fr';
      const inviteUrl = `${siteUrl}/signup`;
      console.log('Création de l\'utilisateur et envoi de l\'invitation:', normalizedEmail);
      const { data: newUser, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
        redirectTo: inviteUrl,
        data: {
          is_super_admin: true
        }
      });
      if (inviteError) {
        // Si l'erreur indique que l'utilisateur existe déjà, essayer de le récupérer
        if (inviteError.message?.includes('already registered') || inviteError.message?.includes('already exists')) {
          console.log('L\'utilisateur existe déjà, tentative de récupération...');
          const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
          const foundUser = usersData?.users?.find((u)=>u.email?.toLowerCase() === normalizedEmail);
          if (foundUser) {
            userId = foundUser.id;
            existingUser = foundUser;
          } else {
            throw inviteError;
          }
        } else {
          throw inviteError;
        }
      } else if (newUser?.user) {
        userId = newUser.user.id;
        console.log('Utilisateur créé avec succès:', userId);
      } else {
        return new Response(JSON.stringify({
          error: 'Impossible de créer l\'utilisateur'
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    // Ajouter l'utilisateur dans la table super_admins
    const { data: superAdminData, error: insertError } = await supabaseAdmin.from('super_admins').insert({
      user_id: userId,
      created_by: user.id,
      is_active: true
    }).select().single();
    if (insertError) {
      console.error('Erreur lors de l\'ajout dans super_admins:', insertError);
      // Si l'erreur est due à une contrainte unique, l'utilisateur existe peut-être déjà
      if (insertError.code === '23505') {
        return new Response(JSON.stringify({
          error: 'Cet utilisateur est déjà super administrateur'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      return new Response(JSON.stringify({
        error: `Erreur lors de l\'ajout du super admin: ${insertError.message}`
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log('Super admin ajouté avec succès:', superAdminData);
    return new Response(JSON.stringify({
      success: true,
      message: existingUser ? 'Super administrateur ajouté avec succès' : 'Invitation envoyée et super administrateur ajouté avec succès',
      user_id: userId,
      super_admin_id: superAdminData.id
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
