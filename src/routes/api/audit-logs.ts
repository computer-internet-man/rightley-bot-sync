import { json } from '@/lib/response';
import { setupDb } from '@/db';
import { getUser } from '@/lib/auth';
import { AuditService } from '@/lib/services/auditService';

export async function GET(request: Request, env: any, ctx: any) {
  try {
    await setupDb(env);
    const user = await getUser(request, env);
    
    if (!user) {
      return json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    // Parse query parameters for filtering
    const url = new URL(request.url);
    const filters: any = {};
    
    const dateRange = url.searchParams.get('dateRange');
    const actionType = url.searchParams.get('actionType');
    const deliveryStatus = url.searchParams.get('deliveryStatus');
    const patientName = url.searchParams.get('patientName');
    
    if (dateRange && dateRange !== 'all') {
      const days = parseInt(dateRange);
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
      filters.dateRange = { start: startDate, end: endDate };
    }
    
    if (actionType) filters.actionType = actionType;
    if (deliveryStatus) filters.deliveryStatus = deliveryStatus;
    if (patientName) filters.patientName = patientName;

    const { logs, total } = await AuditService.getAuditLogs(filters, { page: 1, limit: 1000 }, user);

    return json({
      success: true,
      logs,
      total
    });

  } catch (error) {
    console.error('Audit logs API error:', error);
    return json({ 
      success: false, 
      error: 'Failed to fetch audit logs' 
    }, { status: 500 });
  }
}

export async function POST(request: Request, env: any, ctx: any) {
  try {
    await setupDb(env);
    const user = await getUser(request, env);
    
    if (!user) {
      return json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json() as {
      patientName: string;
      requestText: string;
      generatedDraft: string;
      finalMessage?: string;
      actionType: string;
      deliveryStatus?: string;
      deliveredAt?: Date;
    };
    
    const auditLog = await AuditService.createAuditLog(body, user);

    return json({
      success: true,
      auditLog
    });

  } catch (error) {
    console.error('Create audit log API error:', error);
    return json({ 
      success: false, 
      error: 'Failed to create audit log' 
    }, { status: 500 });
  }
}
