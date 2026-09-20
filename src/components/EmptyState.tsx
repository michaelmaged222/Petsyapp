import { Inbox } from 'lucide-react';

export default function EmptyState({ message, subMessage }: { message: string; subMessage?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-primary-800/50 flex items-center justify-center mb-4">
        <Inbox className="w-8 h-8 text-gray-600" />
      </div>
      <p className="text-gray-400 font-medium">{message}</p>
      {subMessage && <p className="text-sm text-gray-600 mt-1">{subMessage}</p>}
    </div>
  );
}
