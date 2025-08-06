import { MessageReviewQueue } from "@/app/components/MessageReviewQueue";
import type { AppContext } from "@/worker";

interface MessageReviewPageProps {
  ctx: AppContext;
}

export function MessageReviewPage({ ctx }: MessageReviewPageProps) {
  const { user } = ctx;
  
  if (!user) {
    return <div>Authentication required</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="border-b border-gray-200 pb-5 mb-6">
            <h1 className="text-3xl font-bold leading-6 text-gray-900">
              Message Review Queue
            </h1>
            <p className="mt-2 max-w-4xl text-sm text-gray-500">
              Review and approve messages submitted by staff members before delivery to patients.
              Current user: {user.email} ({user.role})
            </p>
          </div>

          {/* Message Review Component */}
          <MessageReviewQueue user={user} />
        </div>
      </div>
    </div>
  );
}
