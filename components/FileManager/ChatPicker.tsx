"use client";

import { useState } from "react";
import { ChevronRight, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CenterMessage } from "@/components/common/states";
import { useToast } from "@/components/common/toast";
import { openTelegramLink } from "@/lib/telegram/webapp";
import type { SelectChatSessionDto } from "@/lib/types";
import { useSession } from "./session-context";

export function ChatPicker({ data }: { data: SelectChatSessionDto }) {
  const { selectChat, reauth } = useSession();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);

  const pick = async (chatId: string) => {
    setPending(chatId);
    try {
      await selectChat(chatId);
    } catch (err) {
      toast({ title: "Could not open group", description: (err as Error).message, variant: "error" });
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)] pb-3">
        <h1 className="text-xl font-semibold">Your groups</h1>
        <p className="text-sm text-muted-foreground">Choose a group to browse its files.</p>
      </header>
      {data.chats.length === 0 ? (
        <CenterMessage
          icon={<Users className="size-12" strokeWidth={1.25} />}
          title="No groups yet"
          description={
            <>
              Add <span className="font-medium text-foreground">@{data.botUsername}</span> to a group and send <code>/files</code> there. Then come back and refresh.
            </>
          }
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => openTelegramLink(`https://t.me/${data.botUsername}?startgroup=true`)}>
                Add to a group
              </Button>
              <Button onClick={() => void reauth()}>Refresh</Button>
            </div>
          }
        />
      ) : (
        <div className="mx-4 divide-y overflow-hidden rounded-2xl bg-card">
          {data.chats.map((c) => (
            <button key={c.id} type="button" onClick={() => pick(c.id)} disabled={!!pending} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-accent">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Users className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium">{c.title}</div>
                <div className="text-xs text-muted-foreground capitalize">{c.type}</div>
              </div>
              {c.role !== "member" && <Badge variant="secondary">{c.role}</Badge>}
              {pending === c.id ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground/50" />}
            </button>
          ))}
        </div>
      )}
      {data.chats.length > 0 && (
        <p className="px-6 pt-4 text-center text-xs text-muted-foreground">
          Missing a group? Send <code>/files</code> in that group so the bot can see you there.
        </p>
      )}
    </div>
  );
}
