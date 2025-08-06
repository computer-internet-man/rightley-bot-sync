import { json } from '@/lib/response';
import { setupDb } from '@/db';
import { getUser } from '@/lib/auth';
import { 
  submitMessageForReview,
  reviewMessage,
  sendMessageDirectly,
  getPendingReviewMessages,
  updateDeliveryStatus 
} from '@/actions/messageWorkflow';

export async function POST(request: Request, env: any, ctx: any) {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    await setupDb(env);
    const user = await getUser(request, env);
    
    if (!user) {
      return json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();

    switch (path) {
      case '/api/message-workflow/submit-for-review':
        return json(await submitMessageForReview(body, user, env, request));

      case '/api/message-workflow/review':
        return json(await reviewMessage(body, user, env, request));

      case '/api/message-workflow/send-directly':
        return json(await sendMessageDirectly(body, user, env, request));

      case '/api/message-workflow/delivery-status':
        // Webhook endpoint for delivery providers
        const { auditLogId, status, failureReason, webhookData } = body;
        return json(await updateDeliveryStatus(auditLogId, status, failureReason, webhookData, env));

      default:
        return json({ success: false, error: 'Unknown endpoint' }, { status: 404 });
    }

  } catch (error) {
    console.error('Message workflow API error:', error);
    return json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

export async function GET(request: Request, env: any, ctx: any) {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    await setupDb(env);
    const user = await getUser(request, env);
    
    if (!user) {
      return json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    switch (path) {
      case '/api/message-workflow/pending-review':
        return json(await getPendingReviewMessages(user, env));

      default:
        return json({ success: false, error: 'Unknown endpoint' }, { status: 404 });
    }

  } catch (error) {
    console.error('Message workflow GET API error:', error);
    return json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
