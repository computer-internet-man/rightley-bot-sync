import { json } from '@/lib/response';
import { setupDb } from '@/db';
import { getUser } from '@/lib/auth';
import { AuditExportService } from '@/lib/services/auditExportService';

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
      case '/api/audit-export/export':
        const exportResult = await AuditExportService.exportAuditLogs(body, user);
        
        if (!exportResult.success) {
          return json(exportResult, { status: 400 });
        }

        // Return file data with appropriate headers
        const headers = new Headers({
          'Content-Type': body.format === 'csv' ? 'text/csv' : 
                         body.format === 'json' ? 'application/json' : 
                         'text/html',
          'Content-Disposition': `attachment; filename="${exportResult.filename}"`,
        });

        return new Response(exportResult.data, { headers });

      case '/api/audit-export/compliance-report':
        const { dateRange } = body;
        const reportResult = await AuditExportService.generateComplianceReport(
          {
            start: new Date(dateRange.start),
            end: new Date(dateRange.end)
          },
          user
        );
        
        return json(reportResult);

      case '/api/audit-export/verify-integrity':
        const { logIds } = body;
        const verifyResult = await AuditExportService.verifyDataIntegrity(user, logIds);
        
        return json(verifyResult);

      default:
        return json({ success: false, error: 'Unknown endpoint' }, { status: 404 });
    }

  } catch (error) {
    console.error('Audit export API error:', error);
    return json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
