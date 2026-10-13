"use client";

import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/compressImage";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

// Extrait le chemin de stockage depuis l'URL publique d'un avatar.
function storagePathFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/");
    const idx = parts.indexOf("avatars");
    if (idx !== -1 && parts.length > idx + 1) return parts.slice(idx + 1).join("/");
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Upload / suppression de l'avatar utilisateur (bucket `avatars`, rangé sous
 * `${user.id}/`). L'URL publique est stockée dans `user_metadata.avatar_url`.
 * Logique mutualisée entre la dialog de bienvenue et la page Compte.
 */
export const useAvatarUpload = (onChange?: () => void) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);

  const uploadFile = useCallback(
    async (original: File): Promise<boolean> => {
      if (!user) return false;
      if (!original.type.startsWith("image/")) {
        toast({ title: "Format invalide", description: "Sélectionnez une image (JPG ou PNG).", variant: "destructive" });
        return false;
      }
      const file = await compressImage(original, { maxDimension: 512 });
      if (file.size > 2 * 1024 * 1024) {
        toast({ title: "Image trop lourde", description: "2 Mo maximum.", variant: "destructive" });
        return false;
      }

      setIsUploading(true);
      try {
        // Nettoyage de l'ancien avatar (best-effort).
        const oldUrl = user.user_metadata?.avatar_url as string | undefined;
        if (oldUrl) {
          const path = storagePathFromUrl(oldUrl);
          if (path) await supabase.storage.from("avatars").remove([path]);
        }

        const ext = file.name.split(".").pop() || "jpg";
        const filePath = `${user.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, file, { upsert: true });
        if (uploadError) throw uploadError;

        const { data: pub } = supabase.storage.from("avatars").getPublicUrl(filePath);
        const { error: updateError } = await supabase.auth.updateUser({
          data: { ...user.user_metadata, avatar_url: pub.publicUrl },
        });
        if (updateError) throw updateError;

        toast({ title: "Photo mise à jour" });
        onChange?.();
        return true;
      } catch (err) {
        toast({
          title: "Échec de l'envoi",
          description: err instanceof Error ? err.message : "Réessayez plus tard.",
          variant: "destructive",
        });
        return false;
      } finally {
        setIsUploading(false);
      }
    },
    [user, toast, onChange],
  );

  const removeAvatar = useCallback(async (): Promise<void> => {
    if (!user?.user_metadata?.avatar_url) return;
    setIsUploading(true);
    try {
      const path = storagePathFromUrl(user.user_metadata.avatar_url as string);
      if (path) await supabase.storage.from("avatars").remove([path]);
      await supabase.auth.updateUser({ data: { ...user.user_metadata, avatar_url: null } });
      toast({ title: "Photo retirée" });
      onChange?.();
    } catch (err) {
      toast({
        title: "Échec",
        description: err instanceof Error ? err.message : "Réessayez plus tard.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [user, toast, onChange]);

  return { uploadFile, removeAvatar, isUploading };
};
