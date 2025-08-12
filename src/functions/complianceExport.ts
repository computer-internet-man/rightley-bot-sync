import { drizzleDb } from '@/db';
import { auditLogs, users } from '@/db/schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import * as Sentry from '@sentry/cloudflare';

export interface ComplianceExportFilters {
  startDate?: string; // ISO date string
  endDate?: string;   // ISO date string
  userId?: string;
  actionType?: string;
  deliveryStatus?: string;
  patientName?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogRow {
  timestamp: string;
  user_email: string;
  user_role: string;
  patient_name: string;
  action_type: string;
  delivery_status: string;
  content_preview: string;
  content_hash: string;
  ai_model: string;
  tokens_consumed: number;
  ip_address: string;
  review_status: string;
}

/**
 * Create redacted content preview for CSV export
 */
function createContentPreview(content: string): string {
  if (!content) return '';
  
  // Remove any potential PII patterns and create safe preview
  const cleaned = content
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]')      // SSN patterns
    .replace(/\b\d{10,}\b/g, '[PHONE]')              // Phone numbers
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]') // Email addresses
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '[DATE]'); // Date patterns
  
  // Return first 80 characters with ellipsis
  return cleaned.length > 80 ? cleaned.substring(0, 80) + '...' : cleaned;
}

/**
 * Escape CSV field content
 */
function escapeCSVField(field: string | null | undefined): string {
  if (!field) return '';
  
  const stringField = String(field);
  
  // If field contains comma, quote, or newline, wrap in quotes and escape quotes
  if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
    return `"${stringField.replace(/"/g, '""')}"`;
  }
  
  return stringField;
}

/**
 * Convert audit log data to CSV row
 */
function formatAuditLogToCSV(log: any, userEmail: string, userRole: string): AuditLogRow {
  return {
    timestamp: log.createdAt ? new Date(log.createdAt).toISOString() : '',
    user_email: userEmail || 'unknown',
    user_role: userRole || 'unknown',
    patient_name: log.patientName || '',
    action_type: log.actionType || '',
    delivery_status: log.deliveryStatus || '',
    content_preview: createContentPreview(log.finalMessage || log.generatedDraft || ''),
    content_hash: log.contentHash || '',
    ai_model: log.aiModelUsed || '',
    tokens_consumed: log.tokensConsumed || 0,
    ip_address: log.ipAddress || '',
    review_status: log.reviewedAt ? 'reviewed' : 'pending',
  };
}

/**
 * Generate CSV header row
 */
function getCSVHeader(): string {
  return [
    'timestamp',
    'user_email', 
    'user_role',
    'patient_name',
    'action_type',
    'delivery_status',
    'content_preview',
    'content_hash',
    'ai_model',
    'tokens_consumed',
    'ip_address',
    'review_status'
  ].join(',');
}

/**
 * Convert audit log row to CSV line
 */
function auditLogRowToCSV(row: AuditLogRow): string {
  return [
    escapeCSVField(row.timestamp),
    escapeCSVField(row.user_email),
    escapeCSVField(row.user_role),
    escapeCSVField(row.patient_name),
    escapeCSVField(row.action_type),
    escapeCSVField(row.delivery_status),
    escapeCSVField(row.content_preview),
    escapeCSVField(row.content_hash),
    escapeCSVField(row.ai_model),
    escapeCSVField(String(row.tokens_consumed)),
    escapeCSVField(row.ip_address),
    escapeCSVField(row.review_status),
  ].join(',');
}

/**
 * Query audit logs with filters and joins
 */
async function queryAuditLogs(filters: ComplianceExportFilters) {
  try {
    // Build where conditions
    const conditions = [];
    
    if (filters.startDate) {
      conditions.push(gte(auditLogs.createdAt, new Date(filters.startDate)));
    }
    
    if (filters.endDate) {
      conditions.push(lte(auditLogs.createdAt, new Date(filters.endDate)));
    }
    
    if (filters.userId) {
      conditions.push(eq(auditLogs.userId, filters.userId));
    }
    
    if (filters.actionType) {
      conditions.push(eq(auditLogs.actionType, filters.actionType));
    }
    
    if (filters.deliveryStatus) {
      conditions.push(eq(auditLogs.deliveryStatus, filters.deliveryStatus));
    }
    
    if (filters.patientName) {
      conditions.push(sql`${auditLogs.patientName} LIKE ${'%' + filters.patientName + '%'}`);
    }

    // Build query with joins
    let query = drizzleDb
      .select({
        log: auditLogs,
        user: users,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .orderBy(desc(auditLogs.createdAt));

    // Apply where conditions
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Apply pagination
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    
    if (filters.offset) {
      query = query.offset(filters.offset);
    }

    const results = await query;
    
    Sentry.addBreadcrumb({
      category: 'export',
      message: 'Audit logs queried successfully',
      level: 'info',
      data: {
        resultCount: results.length,
        filters: JSON.stringify(filters),
      },
    });

    return results;
  } catch (error) {
    Sentry.captureException(error);
    console.error('[QUERY_AUDIT_LOGS] Error:', error);
    throw error;
  }
}

/**
 * Export audit logs as CSV with streaming support
 */
export async function exportAuditLogsAsCSV(
  filters: ComplianceExportFilters,
  userRole: string
): Promise<Response> {
  try {
    // RBAC check - only admin and auditor roles can export
    if (!['admin', 'auditor'].includes(userRole)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Insufficient permissions for audit export'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    Sentry.addBreadcrumb({
      category: 'export',
      message: 'Starting CSV export',
      level: 'info',
      data: {
        userRole,
        filters: JSON.stringify(filters),
      },
    });

    // Set reasonable defaults for pagination to prevent memory issues
    const safeFilters = {
      ...filters,
      limit: Math.min(filters.limit || 1000, 5000), // Max 5000 records per export
      offset: filters.offset || 0,
    };

    // Query audit logs
    const results = await queryAuditLogs(safeFilters);

    // Build CSV content
    const csvLines = [getCSVHeader()];
    
    for (const result of results) {
      const userEmail = result.user?.email || 'unknown';
      const userRoleStr = result.user?.role || 'unknown';
      const csvRow = formatAuditLogToCSV(result.log, userEmail, userRoleStr);
      csvLines.push(auditLogRowToCSV(csvRow));
    }

    const csvContent = csvLines.join('\n');
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const filename = `audit_logs_${timestamp}.csv`;

    Sentry.addBreadcrumb({
      category: 'export',
      message: 'CSV export completed successfully',
      level: 'info',
      data: {
        recordCount: results.length,
        filename,
      },
    });

    // Return CSV response with proper headers
    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });

  } catch (error) {
    Sentry.captureException(error);
    console.error('[CSV_EXPORT] Error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to export audit logs',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Get audit logs with pagination for UI display
 */
export async function getAuditLogsWithPagination(
  filters: ComplianceExportFilters,
  userRole: string
) {
  try {
    // RBAC check - staff+ can view audit logs
    if (!['staff', 'doctor', 'reviewer', 'admin', 'auditor'].includes(userRole)) {
      throw new Error('Insufficient permissions to view audit logs');
    }

    // Set pagination defaults
    const safeFilters = {
      ...filters,
      limit: Math.min(filters.limit || 50, 100), // Max 100 for UI
      offset: filters.offset || 0,
    };

    const results = await queryAuditLogs(safeFilters);
    
    // Transform for UI display
    const formattedResults = results.map(result => {
      const csvRow = formatAuditLogToCSV(
        result.log, 
        result.user?.email || 'unknown',
        result.user?.role || 'unknown'
      );
      
      return {
        id: result.log.id,
        timestamp: csvRow.timestamp,
        userEmail: csvRow.user_email,
        userRole: csvRow.user_role,
        patientName: csvRow.patient_name,
        actionType: csvRow.action_type,
        deliveryStatus: csvRow.delivery_status,
        contentPreview: csvRow.content_preview,
        contentHash: csvRow.content_hash,
        reviewStatus: csvRow.review_status,
        aiModel: csvRow.ai_model,
        tokensConsumed: csvRow.tokens_consumed,
      };
    });

    return {
      success: true,
      data: formattedResults,
      pagination: {
        offset: safeFilters.offset,
        limit: safeFilters.limit,
        hasMore: results.length === safeFilters.limit,
      },
    };

  } catch (error) {
    Sentry.captureException(error);
    console.error('[GET_AUDIT_LOGS] Error:', error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: [],
    };
  }
}
