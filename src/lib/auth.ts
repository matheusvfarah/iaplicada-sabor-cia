import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type Role = "gestor_geral" | "gerente";

export type Profile = {
  id: string;
  nome: string;
  role: Role;
  unidade_id: number | null;
};

export type Session = {
  email: string;
  profile: Profile;
};

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nome, role, unidade_id")
    .eq("id", userId)
    .single();
  if (error || !data) return null;
  return data;
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function resolve(user: { id: string; email?: string } | undefined) {
      if (!user?.email) {
        if (active) {
          setSession(null);
          setReady(true);
        }
        return;
      }
      const profile = await fetchProfile(user.id);
      if (!active) return;
      setSession(profile ? { email: user.email, profile } : null);
      setReady(true);
    }

    supabase.auth.getSession().then(({ data }) => resolve(data.session?.user));

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) =>
      resolve(newSession?.user),
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return { session, ready };
}

export async function signIn(email: string, password: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;

  const profile = await fetchProfile(data.user.id);
  if (!profile) {
    await supabase.auth.signOut();
    throw new Error("Usuário autenticado, mas sem perfil configurado.");
  }

  return { email: data.user.email!, profile };
}

export async function signOut() {
  await supabase.auth.signOut();
}
