"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiClient, ClientApiError } from "@/lib/api/client";
import { applyTelegramTheme, getWebApp } from "@/lib/telegram/webapp";
import type { ChatSessionDto, Permission, SelectChatSessionDto } from "@/lib/types";

export type SessionState =
  | { status: "loading" }
  | { status: "not-telegram" }
  | { status: "error"; error: Error }
  | { status: "select-chat"; data: SelectChatSessionDto }
  | { status: "ready"; session: ChatSessionDto };

interface SessionContextValue {
  state: SessionState;
  api: ApiClient;
  /** Permission check mirroring the server policy (the server is still the source of truth). */
  can: (permission: Permission, resource?: { createdBy: { id: string } | null }) => boolean;
  selectChat: (chatId: string) => Promise<void>;
  reauth: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

/** Convenience: the ready session or throws (use only inside components rendered when status === "ready"). */
export function useChatSession(): ChatSessionDto {
  const { state } = useSession();
  if (state.status !== "ready") throw new Error("Session not ready");
  return state.session;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const reauthRef = useRef<() => Promise<void>>(async () => {});
  const [api] = useState(() => {
    const client = new ApiClient(null);
    // Re-authenticate automatically when a token expires mid-session.
    client.onError = (err: ClientApiError) => {
      if (err.code === "SESSION_EXPIRED" || err.code === "UNAUTHORIZED") void reauthRef.current();
    };
    return client;
  });
  const authInFlight = useRef<Promise<void> | null>(null);

  const bootstrap = useCallback(async () => {
    const wa = getWebApp();
    if (!wa || !wa.initData) {
      setState({ status: "not-telegram" });
      return;
    }
    try {
      const result = await api.createSession(wa.initData);
      if (result.status === "chat") {
        api.setToken(result.token);
        setState({ status: "ready", session: result });
      } else {
        api.setToken(result.token);
        setState({ status: "select-chat", data: result });
      }
    } catch (err) {
      setState({ status: "error", error: err as Error });
    }
  }, [api]);

  const reauth = useCallback(async () => {
    if (!authInFlight.current) {
      authInFlight.current = bootstrap().finally(() => {
        authInFlight.current = null;
      });
    }
    return authInFlight.current;
  }, [bootstrap]);

  useEffect(() => {
    const wa = getWebApp();
    if (wa) {
      try {
        wa.ready();
        wa.expand();
        wa.disableVerticalSwipes?.();
      } catch {
        /* ignore */
      }
      applyTelegramTheme();
      const onTheme = () => applyTelegramTheme();
      wa.onEvent("themeChanged", onTheme);
      void reauth();
      return () => wa.offEvent("themeChanged", onTheme);
    }
    void reauth();
  }, [reauth]);

  useEffect(() => {
    reauthRef.current = reauth;
  }, [reauth]);

  const selectChat = useCallback(async (chatId: string) => {
    const session = await api.selectChat(chatId);
    api.setToken(session.token);
    setState({ status: "ready", session });
  }, [api]);

  const can = useCallback<SessionContextValue["can"]>(
    (permission, resource) => {
      if (state.status !== "ready") return false;
      const perms = state.session.permissions;
      if (perms.includes(permission)) return true;
      if (resource?.createdBy && resource.createdBy.id === state.session.user.id) {
        return perms.includes(`${permission}.own` as Permission);
      }
      return false;
    },
    [state],
  );

  const value = useMemo<SessionContextValue>(() => ({ state, api, can, selectChat, reauth }), [state, api, can, selectChat, reauth]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
