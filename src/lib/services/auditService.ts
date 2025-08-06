import { db } from '@/db';
import { hasRole } from '@/lib/auth';
import type { User, AuditLog } from '@/db';

export interface AuditLogWithUser extends AuditLog {
  user: {
    id: string;
    email: string;
    username: string;
    role: string;
  };
}

export interface AuditLogFilters {
  dateRange?: {
    start: Date;
    end: Date;
  };
  userId?: string;
  actionType?: string;
  deliveryStatus?: string;
  patientName?: string;
}

export interface AuditLogPagination {
  page: number;
  limit: number;
}

export class AuditService {
  /**
   * Get audit logs with role-based filtering
   * - Auditors and above: Can view all audit logs
   * - Doctors: Can view audit logs for their own patients
   * - Staff/Reviewers: Can view their own audit logs only
   */
  static async getAuditLogs(
    filters: AuditLogFilters = {},
    pagination: AuditLogPagination = { page: 1, limit: 50 },
    user: User
  ): Promise<{ logs: AuditLogWithUser[]; total: number }> {
    if (!hasRole(user, 'staff')) {
      throw new Error('Insufficient permissions to view audit logs');
    }

    try {
      const whereClause: any = {};

      // Apply role-based filtering
      if (hasRole(user, 'auditor')) {
        // Auditors and admins can see all logs - no additional filtering
      } else if (hasRole(user, 'doctor')) {
        // Doctors can see logs for their patients or their own actions
        whereClause.OR = [
          { userId: user.id }, // Their own actions
          // In a real app, we'd filter by patient assignments here
        ];
      } else {
        // Staff and reviewers can only see their own audit logs
        whereClause.userId = user.id;
      }

      // Apply user-provided filters
      if (filters.dateRange) {
        whereClause.createdAt = {
          gte: filters.dateRange.start,
          lte: filters.dateRange.end,
        };
      }

      if (filters.userId) {
        // Only auditors and admins can filter by other users
        if (!hasRole(user, 'auditor')) {
          throw new Error('Insufficient permissions to filter by user');
        }
        whereClause.userId = filters.userId;
      }

      if (filters.actionType) {
        whereClause.actionType = filters.actionType;
      }

      if (filters.deliveryStatus) {
        whereClause.deliveryStatus = filters.deliveryStatus;
      }

      if (filters.patientName) {
        whereClause.patientName = {
          contains: filters.patientName,
          mode: 'insensitive',
        };
      }

      const [logs, total] = await Promise.all([
        db.auditLog.findMany({
          where: whereClause,
          include: {
            user: {
              select: {
                id: true,
                email: true,
                username: true,
                role: true,
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          skip: (pagination.page - 1) * pagination.limit,
          take: pagination.limit,
        }),
        db.auditLog.count({ where: whereClause })
      ]);

      return { logs, total };
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      throw new Error('Failed to fetch audit logs');
    }
  }

  /**
   * Get a specific audit log by ID
   * Same role-based access control as getAuditLogs
   */
  static async getAuditLog(logId: string, user: User): Promise<AuditLogWithUser | null> {
    if (!hasRole(user, 'staff')) {
      throw new Error('Insufficient permissions to view audit log');
    }

    try {
      const log = await db.auditLog.findUnique({
        where: { id: logId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              role: true,
            }
          }
        }
      });

      if (!log) {
        return null;
      }

      // Apply role-based access control
      if (hasRole(user, 'auditor')) {
        // Auditors and admins can see all logs
        return log;
      } else if (hasRole(user, 'doctor')) {
        // Doctors can see logs for their patients or their own actions
        if (log.userId === user.id) {
          return log;
        }
        // In a real app, we'd check if this log is for a patient assigned to this doctor
        return log; // For now, allow access
      } else {
        // Staff and reviewers can only see their own logs
        if (log.userId !== user.id) {
          throw new Error('You can only access your own audit logs');
        }
        return log;
      }
    } catch (error) {
      console.error('Error fetching audit log:', error);
      throw new Error('Failed to fetch audit log');
    }
  }

  /**
   * Create a new audit log entry
   * All authenticated users can create audit logs for their own actions
   */
  static async createAuditLog(
    data: {
      patientName: string;
      requestText: string;
      generatedDraft: string;
      finalMessage?: string;
      actionType: string;
      deliveryStatus?: string;
      deliveredAt?: Date;
    },
    user: User
  ): Promise<AuditLog> {
    if (!hasRole(user, 'staff')) {
      throw new Error('Insufficient permissions to create audit log');
    }

    try {
      const auditLog = await db.auditLog.create({
        data: {
          userId: user.id,
          patientName: data.patientName,
          requestText: data.requestText,
          generatedDraft: data.generatedDraft,
          finalMessage: data.finalMessage,
          actionType: data.actionType,
          deliveryStatus: data.deliveryStatus || 'pending',
          deliveredAt: data.deliveredAt,
        }
      });

      return auditLog;
    } catch (error) {
      console.error('Error creating audit log:', error);
      throw new Error('Failed to create audit log');
    }
  }

  /**
   * Update an audit log (for delivery status updates)
   * Only the creator or admins can update audit logs
   */
  static async updateAuditLog(
    logId: string,
    data: {
      finalMessage?: string;
      deliveryStatus?: string;
      deliveredAt?: Date;
    },
    user: User
  ): Promise<AuditLog> {
    if (!hasRole(user, 'staff')) {
      throw new Error('Insufficient permissions to update audit log');
    }

    try {
      const existingLog = await db.auditLog.findUnique({
        where: { id: logId }
      });

      if (!existingLog) {
        throw new Error('Audit log not found');
      }

      // Only the creator or admins can update
      if (!hasRole(user, 'admin') && existingLog.userId !== user.id) {
        throw new Error('You can only update your own audit logs');
      }

      const updatedLog = await db.auditLog.update({
        where: { id: logId },
        data
      });

      return updatedLog;
    } catch (error) {
      console.error('Error updating audit log:', error);
      throw new Error('Failed to update audit log');
    }
  }

  /**
   * Get audit statistics for compliance reporting
   * Only auditors and admins can access comprehensive stats
   */
  static async getAuditStats(
    dateRange?: { start: Date; end: Date },
    user: User
  ) {
    if (!hasRole(user, 'auditor')) {
      throw new Error('Only auditors and administrators can access audit statistics');
    }

    try {
      const whereClause: any = {};
      if (dateRange) {
        whereClause.createdAt = {
          gte: dateRange.start,
          lte: dateRange.end,
        };
      }

      const [
        totalLogs,
        deliveredCount,
        failedCount,
        pendingCount,
        uniqueUsers,
        actionTypeCounts
      ] = await Promise.all([
        db.auditLog.count({ where: whereClause }),
        db.auditLog.count({ 
          where: { ...whereClause, deliveryStatus: 'delivered' }
        }),
        db.auditLog.count({ 
          where: { ...whereClause, deliveryStatus: 'failed' }
        }),
        db.auditLog.count({ 
          where: { ...whereClause, deliveryStatus: 'pending' }
        }),
        db.auditLog.groupBy({
          by: ['userId'],
          where: whereClause,
          _count: true,
        }),
        db.auditLog.groupBy({
          by: ['actionType'],
          where: whereClause,
          _count: true,
        })
      ]);

      const successRate = totalLogs > 0 ? (deliveredCount / totalLogs) * 100 : 0;

      return {
        totalLogs,
        deliveredCount,
        failedCount,
        pendingCount,
        successRate: Math.round(successRate * 10) / 10, // Round to 1 decimal
        uniqueUserCount: uniqueUsers.length,
        actionTypeCounts: actionTypeCounts.map(item => ({
          actionType: item.actionType,
          count: item._count,
        })),
      };
    } catch (error) {
      console.error('Error fetching audit statistics:', error);
      throw new Error('Failed to fetch audit statistics');
    }
  }
}
