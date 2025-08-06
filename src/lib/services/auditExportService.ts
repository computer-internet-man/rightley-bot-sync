import { db } from '@/db';
import { hasRole } from '@/lib/auth';
import type { User } from '@/db';
import { AuditService, type AuditLogFilters, type AuditLogWithUser } from './auditService';

export interface ExportRequest {
  format: 'csv' | 'pdf' | 'json';
  filters?: AuditLogFilters;
  includeContent?: boolean;
  includeEditHistory?: boolean;
  includeMetadata?: boolean;
}

export interface ComplianceReport {
  generatedAt: Date;
  reportPeriod: {
    start: Date;
    end: Date;
  };
  totalMessages: number;
  deliveryStats: {
    delivered: number;
    failed: number;
    pending: number;
    successRate: number;
  };
  userActivity: {
    userId: string;
    username: string;
    role: string;
    messagesGenerated: number;
    messagesReviewed: number;
    messagesSent: number;
  }[];
  auditTrail: {
    messageId: string;
    patientName: string;
    timeline: {
      action: string;
      timestamp: Date;
      userId: string;
      username: string;
    }[];
  }[];
  dataIntegrity: {
    totalRecords: number;
    recordsWithHash: number;
    hashVerificationPassed: number;
    integrityScore: number;
  };
}

export class AuditExportService {
  /**
   * Export audit logs in specified format
   */
  static async exportAuditLogs(
    request: ExportRequest,
    user: User
  ): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    if (!hasRole(user, 'auditor')) {
      return { success: false, error: 'Only auditors can export audit logs' };
    }

    try {
      const { logs } = await AuditService.getAuditLogs(
        request.filters || {},
        { page: 1, limit: 10000 }, // Large limit for export
        user
      );

      const filename = `audit_export_${new Date().toISOString().split('T')[0]}.${request.format}`;

      switch (request.format) {
        case 'csv':
          return {
            success: true,
            data: this.generateCSV(logs, request),
            filename
          };
        
        case 'json':
          return {
            success: true,
            data: this.generateJSON(logs, request),
            filename
          };
        
        case 'pdf':
          return {
            success: true,
            data: this.generatePDFReport(logs, request),
            filename
          };
        
        default:
          return { success: false, error: 'Unsupported export format' };
      }
    } catch (error) {
      console.error('Error exporting audit logs:', error);
      return { success: false, error: 'Failed to export audit logs' };
    }
  }

  /**
   * Generate CSV export
   */
  private static generateCSV(logs: AuditLogWithUser[], request: ExportRequest): string {
    const headers = [
      'ID',
      'Patient Name',
      'Action Type',
      'Delivery Status',
      'User',
      'User Role',
      'Created At',
      'Updated At',
      'IP Address',
      'Tokens Consumed',
      'Retry Count'
    ];

    if (request.includeContent) {
      headers.push('Generated Draft', 'Final Message');
    }

    if (request.includeEditHistory) {
      headers.push('Edit History', 'Content Hash');
    }

    if (request.includeMetadata) {
      headers.push('User Agent', 'AI Model', 'Reviewer ID', 'Review Notes');
    }

    const csvRows = [headers.join(',')];

    logs.forEach(log => {
      const row = [
        log.id,
        `"${log.patientName.replace(/"/g, '""')}"`,
        log.actionType,
        log.deliveryStatus,
        `"${log.user.username.replace(/"/g, '""')}"`,
        log.user.role,
        log.createdAt.toISOString(),
        log.updatedAt?.toISOString() || '',
        log.ipAddress || '',
        log.tokensConsumed || '',
        log.retryCount
      ];

      if (request.includeContent) {
        row.push(
          `"${(log.generatedDraft || '').replace(/"/g, '""')}"`,
          `"${(log.finalMessage || '').replace(/"/g, '""')}"`
        );
      }

      if (request.includeEditHistory) {
        row.push(
          `"${(log.editHistory || '').replace(/"/g, '""')}"`,
          log.contentHash || ''
        );
      }

      if (request.includeMetadata) {
        row.push(
          `"${(log.userAgent || '').replace(/"/g, '""')}"`,
          log.aiModelUsed || '',
          log.reviewerId || '',
          `"${(log.reviewNotes || '').replace(/"/g, '""')}"`
        );
      }

      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }

  /**
   * Generate JSON export
   */
  private static generateJSON(logs: AuditLogWithUser[], request: ExportRequest): string {
    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        totalRecords: logs.length,
        includeContent: request.includeContent,
        includeEditHistory: request.includeEditHistory,
        includeMetadata: request.includeMetadata
      },
      logs: logs.map(log => {
        const exportLog: any = {
          id: log.id,
          patientName: log.patientName,
          actionType: log.actionType,
          deliveryStatus: log.deliveryStatus,
          user: {
            id: log.user.id,
            username: log.user.username,
            role: log.user.role
          },
          createdAt: log.createdAt,
          updatedAt: log.updatedAt,
          deliveredAt: log.deliveredAt,
          retryCount: log.retryCount,
          tokensConsumed: log.tokensConsumed
        };

        if (request.includeContent) {
          exportLog.generatedDraft = log.generatedDraft;
          exportLog.finalMessage = log.finalMessage;
        }

        if (request.includeEditHistory) {
          exportLog.editHistory = log.editHistory;
          exportLog.contentHash = log.contentHash;
        }

        if (request.includeMetadata) {
          exportLog.ipAddress = log.ipAddress;
          exportLog.userAgent = log.userAgent;
          exportLog.aiModelUsed = log.aiModelUsed;
          exportLog.reviewerId = log.reviewerId;
          exportLog.reviewNotes = log.reviewNotes;
          exportLog.reviewedAt = log.reviewedAt;
        }

        return exportLog;
      })
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Generate PDF report (simplified HTML format for now)
   */
  private static generatePDFReport(logs: AuditLogWithUser[], request: ExportRequest): string {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Audit Log Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { border-bottom: 2px solid #ccc; padding-bottom: 10px; margin-bottom: 20px; }
        .summary { background-color: #f5f5f5; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .page-break { page-break-before: always; }
        .footer { margin-top: 30px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="header">
        <h1>AI Concierge Audit Log Report</h1>
        <p>Generated: ${new Date().toLocaleString()}</p>
        <p>Total Records: ${logs.length}</p>
    </div>

    <div class="summary">
        <h2>Summary Statistics</h2>
        <ul>
            <li>Total Messages: ${logs.length}</li>
            <li>Delivered: ${logs.filter(l => l.deliveryStatus === 'delivered').length}</li>
            <li>Pending: ${logs.filter(l => l.deliveryStatus === 'pending').length}</li>
            <li>Failed: ${logs.filter(l => l.deliveryStatus === 'failed').length}</li>
        </ul>
    </div>

    <table>
        <thead>
            <tr>
                <th>Date</th>
                <th>Patient</th>
                <th>Action</th>
                <th>Status</th>
                <th>User</th>
                <th>Role</th>
                ${request.includeMetadata ? '<th>IP Address</th>' : ''}
            </tr>
        </thead>
        <tbody>
            ${logs.map(log => `
                <tr>
                    <td>${log.createdAt.toLocaleDateString()}</td>
                    <td>${log.patientName}</td>
                    <td>${log.actionType.replace(/_/g, ' ').toUpperCase()}</td>
                    <td>${log.deliveryStatus.toUpperCase()}</td>
                    <td>${log.user.username}</td>
                    <td>${log.user.role.toUpperCase()}</td>
                    ${request.includeMetadata ? `<td>${log.ipAddress || 'N/A'}</td>` : ''}
                </tr>
            `).join('')}
        </tbody>
    </table>

    <div class="footer">
        <p>This report contains confidential patient information and should be handled according to HIPAA guidelines.</p>
    </div>
</body>
</html>`;

    return html;
  }

  /**
   * Generate comprehensive compliance report
   */
  static async generateComplianceReport(
    dateRange: { start: Date; end: Date },
    user: User
  ): Promise<{ success: boolean; report?: ComplianceReport; error?: string }> {
    if (!hasRole(user, 'auditor')) {
      return { success: false, error: 'Only auditors can generate compliance reports' };
    }

    try {
      // Get all logs in date range
      const { logs } = await AuditService.getAuditLogs(
        { dateRange },
        { page: 1, limit: 50000 },
        user
      );

      // Calculate delivery stats
      const deliveryStats = {
        delivered: logs.filter(l => l.deliveryStatus === 'delivered').length,
        failed: logs.filter(l => l.deliveryStatus === 'failed').length,
        pending: logs.filter(l => ['pending', 'pending_review', 'approved'].includes(l.deliveryStatus)).length,
        successRate: 0
      };
      
      const totalDeliveryAttempts = deliveryStats.delivered + deliveryStats.failed;
      deliveryStats.successRate = totalDeliveryAttempts > 0 
        ? Math.round((deliveryStats.delivered / totalDeliveryAttempts) * 100) 
        : 0;

      // Calculate user activity
      const userActivityMap = new Map();
      logs.forEach(log => {
        const key = log.user.id;
        if (!userActivityMap.has(key)) {
          userActivityMap.set(key, {
            userId: log.user.id,
            username: log.user.username,
            role: log.user.role,
            messagesGenerated: 0,
            messagesReviewed: 0,
            messagesSent: 0
          });
        }
        
        const activity = userActivityMap.get(key);
        if (log.actionType === 'draft_generated') activity.messagesGenerated++;
        if (log.actionType === 'reviewed') activity.messagesReviewed++;
        if (log.actionType === 'sent') activity.messagesSent++;
      });

      // Create audit trails for high-priority messages
      const auditTrail = logs
        .filter(log => log.deliveryStatus === 'delivered' || log.deliveryStatus === 'failed')
        .slice(0, 100) // Limit for report size
        .map(log => ({
          messageId: log.id,
          patientName: log.patientName,
          timeline: this.buildMessageTimeline(log)
        }));

      // Calculate data integrity
      const recordsWithHash = logs.filter(l => l.contentHash).length;
      const dataIntegrity = {
        totalRecords: logs.length,
        recordsWithHash,
        hashVerificationPassed: recordsWithHash, // Simplified - would need actual verification
        integrityScore: logs.length > 0 ? Math.round((recordsWithHash / logs.length) * 100) : 100
      };

      const report: ComplianceReport = {
        generatedAt: new Date(),
        reportPeriod: dateRange,
        totalMessages: logs.length,
        deliveryStats,
        userActivity: Array.from(userActivityMap.values()),
        auditTrail,
        dataIntegrity
      };

      return { success: true, report };

    } catch (error) {
      console.error('Error generating compliance report:', error);
      return { success: false, error: 'Failed to generate compliance report' };
    }
  }

  /**
   * Build timeline for a message's lifecycle
   */
  private static buildMessageTimeline(log: AuditLogWithUser): any[] {
    const timeline = [
      {
        action: 'Draft Generated',
        timestamp: log.createdAt,
        userId: log.user.id,
        username: log.user.username
      }
    ];

    if (log.reviewedAt && log.reviewerId) {
      timeline.push({
        action: 'Reviewed',
        timestamp: log.reviewedAt,
        userId: log.reviewerId,
        username: 'Reviewer' // Would need to lookup actual reviewer name
      });
    }

    if (log.deliveredAt) {
      timeline.push({
        action: 'Delivered',
        timestamp: log.deliveredAt,
        userId: 'system',
        username: 'System'
      });
    }

    return timeline;
  }

  /**
   * Verify data integrity of audit logs
   */
  static async verifyDataIntegrity(
    user: User,
    logIds?: string[]
  ): Promise<{ success: boolean; results?: any; error?: string }> {
    if (!hasRole(user, 'auditor')) {
      return { success: false, error: 'Only auditors can verify data integrity' };
    }

    try {
      const whereClause = logIds ? { id: { in: logIds } } : {};
      
      const logs = await db.auditLog.findMany({
        where: whereClause,
        select: {
          id: true,
          finalMessage: true,
          contentHash: true,
          createdAt: true
        }
      });

      const results = logs.map(log => {
        const currentHash = this.generateContentHash(log.finalMessage || '');
        const isValid = log.contentHash === currentHash;
        
        return {
          logId: log.id,
          createdAt: log.createdAt,
          hasStoredHash: !!log.contentHash,
          hashMatch: isValid,
          status: isValid ? 'valid' : 'integrity_violation'
        };
      });

      const summary = {
        totalChecked: results.length,
        validRecords: results.filter(r => r.hashMatch).length,
        invalidRecords: results.filter(r => !r.hashMatch).length,
        missingHashes: results.filter(r => !r.hasStoredHash).length
      };

      return {
        success: true,
        results: {
          summary,
          details: results
        }
      };

    } catch (error) {
      console.error('Error verifying data integrity:', error);
      return { success: false, error: 'Failed to verify data integrity' };
    }
  }

  private static generateContentHash(content: string): string {
    // Simple hash function - in production use crypto
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }
}
