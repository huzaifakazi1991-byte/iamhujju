import { Nav } from '@/components/nav';
import { ChatClient } from '@/components/chat-client';

export const dynamic = 'force-dynamic';

export default function PlaygroundPage() {
  return (
    <div className="flex h-screen flex-col">
      <Nav />
      <ChatClient />
    </div>
  );
}
