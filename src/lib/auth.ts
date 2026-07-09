import { useEffect, useState } from "react";

export type Role = "admin" | "unit";

export type Session = {
  email: string;
  role: Role;
  unitId?: string;
  name: string;
};

const KEY = "sabor-cia-session";

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session) {
  window.localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new Event("sabor-cia:auth"));
}

export function clearSession() {
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("sabor-cia:auth"));
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(getSession());
    setReady(true);
    const onChange = () => setSession(getSession());
    window.addEventListener("sabor-cia:auth", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("sabor-cia:auth", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return { session, ready };
}