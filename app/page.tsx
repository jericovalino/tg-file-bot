import { FileManager } from "@/components/FileManager/FileManager";
import { SessionProvider } from "@/components/FileManager/session-context";

export default function Home() {
  return (
    <SessionProvider>
      <FileManager />
    </SessionProvider>
  );
}
