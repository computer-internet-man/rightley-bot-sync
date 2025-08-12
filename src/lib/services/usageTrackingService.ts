import { drizzleDb, auditLogs, users } from '@/db';
import { eq, and, gte, count, sum, desc } from 'drizzle-orm';
import type { User } from '@/db';
import { hasRole } from '@/lib/auth';

export interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  averageTokensPerRequest: number;
  requestsByModel: Record<string, number>;
  dailyUsage: Array<{
    date: string;
    requests: number;
    tokens: number;
    cost: number;
  }>;
}

export interface UserUsageStats extends UsageStats {
  userId: string;
  userEmail: string;
  userRole: string;
  dailyLimit: number;
  currentDailyUsage: number;
  remainingDailyRequests: number;
}

export interface DoctorUsageConfig {
  maxWordsPerDraft: number;
  maxDailyRequests: number;
  preferredModel: string;
  costBudgetDaily: number;
  costBudgetMonthly: number;
}

export class UsageTrackingService {
  /**
   * Get daily usage limits based on user role
   */
  static getDailyLimitForRole(role: string): number {
    switch (role) {
      case 'admin':
        return 1000;
      case 'doctor':
        return 100;
      case 'reviewer':
        return 75;
      case 'staff':
      default:
        return 50;
    }
  }

  /**
   * Calculate cost based on model and tokens
   */
  static calculateCost(model: string, tokens: number): number {
    // Cost per 1M tokens
    const pricing: Record<string, number> = {
      'gpt-4o-mini': 0.15,
      'gpt-4o': 2.50,
      'gpt-3.5-turbo': 0.50,
      'mock': 0.00
    };

    const rate = pricing[model] || pricing['gpt-4o-mini'];
    return (tokens / 1000000) * rate;
  }

  /**
   * Check if user can make a request based on daily limits
   */
  static async canUserMakeRequest(userId: string): Promise<{
    canMake: boolean;
    currentUsage: number;
    dailyLimit: number;
    remainingRequests: number;
    error?: string;
  }> {
    try {
      // Get user info
      const [user] = await drizzleDb
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return {
          canMake: false,
          currentUsage: 0,
          dailyLimit: 0,
          remainingRequests: 0,
          error: 'User not found'
        };
      }

      const dailyLimit = this.getDailyLimitForRole(user.role);

      // Get today's usage
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [usageResult] = await drizzleDb
        .select({ count: count() })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.userId, userId),
            eq(auditLogs.actionType, 'draft_generated'),
            gte(auditLogs.createdAt, today)
          )
        );

      const currentUsage = usageResult?.count || 0;
      const remainingRequests = Math.max(0, dailyLimit - currentUsage);

      return {
        canMake: currentUsage < dailyLimit,
        currentUsage,
        dailyLimit,
        remainingRequests
      };

    } catch (error) {
      console.error('Error checking user request limits:', error);
      return {
        canMake: false,
        currentUsage: 0,
        dailyLimit: 0,
        remainingRequests: 0,
        error: 'Error checking limits'
      };
    }
  }

  /**
   * Get usage statistics for a specific user
   */
  static async getUserUsageStats(
    userId: string,
    dateRange?: { start: Date; end: Date }
  ): Promise<UserUsageStats | null> {
    try {
      // Get user info
      const [user] = await drizzleDb
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return null;
      }

      const whereClause = [
        eq(auditLogs.userId, userId),
        eq(auditLogs.actionType, 'draft_generated')
      ];

      if (dateRange) {
        whereClause.push(gte(auditLogs.createdAt, dateRange.start));
        whereClause.push(gte(auditLogs.createdAt, dateRange.end));
      }

      // Get all audit logs for this user in the date range
      const logs = await drizzleDb
        .select({
          tokensConsumed: auditLogs.tokensConsumed,
          aiModelUsed: auditLogs.aiModelUsed,
          createdAt: auditLogs.createdAt
        })
        .from(auditLogs)
        .where(and(...whereClause))
        .orderBy(desc(auditLogs.createdAt));

      const totalRequests = logs.length;
      const totalTokens = logs.reduce((sum, log) => sum + (log.tokensConsumed || 0), 0);
      
      // Calculate costs
      let totalCost = 0;
      const requestsByModel: Record<string, number> = {};

      logs.forEach(log => {
        const model = log.aiModelUsed || 'gpt-4o-mini';
        const tokens = log.tokensConsumed || 0;
        
        totalCost += this.calculateCost(model, tokens);
        requestsByModel[model] = (requestsByModel[model] || 0) + 1;
      });

      const averageTokensPerRequest = totalRequests > 0 ? totalTokens / totalRequests : 0;

      // Get current daily usage
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const [dailyUsageResult] = await drizzleDb
        .select({ count: count() })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.userId, userId),
            eq(auditLogs.actionType, 'draft_generated'),
            gte(auditLogs.createdAt, today)
          )
        );

      const currentDailyUsage = dailyUsageResult?.count || 0;
      const dailyLimit = this.getDailyLimitForRole(user.role);

      // Generate daily usage array (last 30 days)
      const dailyUsage = this.generateDailyUsageArray(logs, 30);

      return {
        userId,
        userEmail: user.email,
        userRole: user.role,
        totalRequests,
        totalTokens,
        totalCost: Math.round(totalCost * 10000) / 10000, // Round to 4 decimal places
        averageTokensPerRequest: Math.round(averageTokensPerRequest),
        requestsByModel,
        dailyUsage,
        dailyLimit,
        currentDailyUsage,
        remainingDailyRequests: Math.max(0, dailyLimit - currentDailyUsage)
      };

    } catch (error) {
      console.error('Error getting user usage stats:', error);
      return null;
    }
  }

  /**
   * Get system-wide usage statistics (admin only)
   */
  static async getSystemUsageStats(
    requestingUser: User,
    dateRange?: { start: Date; end: Date }
  ): Promise<UsageStats & {
    userStats: Array<{
      userId: string;
      email: string;
      role: string;
      requests: number;
      tokens: number;
      cost: number;
    }>;
  }> {
    if (!hasRole(requestingUser, 'admin')) {
      throw new Error('Only administrators can access system-wide usage statistics');
    }

    try {
      const whereClause = [eq(auditLogs.actionType, 'draft_generated')];

      if (dateRange) {
        whereClause.push(gte(auditLogs.createdAt, dateRange.start));
        whereClause.push(gte(auditLogs.createdAt, dateRange.end));
      }

      // Get all audit logs with user info
      const logs = await drizzleDb
        .select({
          tokensConsumed: auditLogs.tokensConsumed,
          aiModelUsed: auditLogs.aiModelUsed,
          createdAt: auditLogs.createdAt,
          userId: auditLogs.userId,
          userEmail: users.email,
          userRole: users.role
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.userId, users.id))
        .where(and(...whereClause))
        .orderBy(desc(auditLogs.createdAt));

      const totalRequests = logs.length;
      const totalTokens = logs.reduce((sum, log) => sum + (log.tokensConsumed || 0), 0);
      
      // Calculate costs and model usage
      let totalCost = 0;
      const requestsByModel: Record<string, number> = {};
      const userStatsMap: Record<string, any> = {};

      logs.forEach(log => {
        const model = log.aiModelUsed || 'gpt-4o-mini';
        const tokens = log.tokensConsumed || 0;
        const cost = this.calculateCost(model, tokens);
        
        totalCost += cost;
        requestsByModel[model] = (requestsByModel[model] || 0) + 1;

        // Track per-user stats
        const userId = log.userId;
        if (userId && !userStatsMap[userId]) {
          userStatsMap[userId] = {
            userId,
            email: log.userEmail || 'Unknown',
            role: log.userRole || 'Unknown',
            requests: 0,
            tokens: 0,
            cost: 0
          };
        }
        
        if (userId) {
          userStatsMap[userId].requests += 1;
          userStatsMap[userId].tokens += tokens;
          userStatsMap[userId].cost += cost;
        }
      });

      const averageTokensPerRequest = totalRequests > 0 ? totalTokens / totalRequests : 0;
      const dailyUsage = this.generateDailyUsageArray(logs, 30);

      // Round costs for all users
      const userStats = Object.values(userStatsMap).map((user: any) => ({
        ...user,
        cost: Math.round(user.cost * 10000) / 10000
      }));

      return {
        totalRequests,
        totalTokens,
        totalCost: Math.round(totalCost * 10000) / 10000,
        averageTokensPerRequest: Math.round(averageTokensPerRequest),
        requestsByModel,
        dailyUsage,
        userStats
      };

    } catch (error) {
      console.error('Error getting system usage stats:', error);
      throw new Error('Failed to fetch system usage statistics');
    }
  }

  /**
   * Track a new AI request
   */
  static async trackAIRequest(data: {
    userId: string;
    patientId: string;
    patientName: string;
    requestText: string;
    generatedDraft: string;
    model: string;
    tokensUsed: number;
    processingTimeMs: number;
  }): Promise<void> {
    try {
      await drizzleDb
        .insert(auditLogs)
        .values({
          userId: data.userId,
          patientId: data.patientId,
          patientName: data.patientName,
          requestText: data.requestText,
          generatedDraft: data.generatedDraft,
          finalMessage: '',
          actionType: 'draft_generated',
          deliveryStatus: 'draft',
          aiModelUsed: data.model,
          tokensConsumed: data.tokensUsed
        });

    } catch (error) {
      console.error('Error tracking AI request:', error);
      // Don't throw - tracking failure shouldn't break the main functionality
    }
  }

  /**
   * Generate daily usage array for charting
   */
  private static generateDailyUsageArray(
    logs: Array<{ createdAt: Date; tokensConsumed?: number | null; aiModelUsed?: string | null }>,
    days: number
  ): Array<{ date: string; requests: number; tokens: number; cost: number }> {
    const dailyMap: Record<string, { requests: number; tokens: number; cost: number }> = {};

    // Initialize all days with zero values
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dailyMap[dateStr] = { requests: 0, tokens: 0, cost: 0 };
    }

    // Populate with actual data
    logs.forEach(log => {
      const dateStr = log.createdAt.toISOString().split('T')[0];
      if (dailyMap[dateStr]) {
        const tokens = log.tokensConsumed || 0;
        const cost = this.calculateCost(log.aiModelUsed || 'gpt-4o-mini', tokens);
        
        dailyMap[dateStr].requests += 1;
        dailyMap[dateStr].tokens += tokens;
        dailyMap[dateStr].cost += cost;
      }
    });

    // Convert to array and sort by date
    return Object.entries(dailyMap)
      .map(([date, stats]) => ({
        date,
        requests: stats.requests,
        tokens: stats.tokens,
        cost: Math.round(stats.cost * 10000) / 10000
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Get cost alerts for users exceeding thresholds
   */
  static async getCostAlerts(requestingUser: User): Promise<Array<{
    userId: string;
    email: string;
    role: string;
    dailyCost: number;
    monthlyCost: number;
    dailyThreshold: number;
    monthlyThreshold: number;
    alertType: 'warning' | 'critical';
  }>> {
    if (!hasRole(requestingUser, 'admin')) {
      throw new Error('Only administrators can access cost alerts');
    }

    try {
      // Define cost thresholds by role
      const thresholds = {
        admin: { daily: 10.0, monthly: 200.0 },
        doctor: { daily: 5.0, monthly: 100.0 },
        reviewer: { daily: 2.0, monthly: 50.0 },
        staff: { daily: 1.0, monthly: 20.0 }
      };

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);

      // Get all users with their usage
      const allUsers = await drizzleDb
        .select({
          id: users.id,
          email: users.email,
          role: users.role
        })
        .from(users);

      const alerts: any[] = [];

      for (const user of allUsers) {
        const roleThresholds = thresholds[user.role as keyof typeof thresholds] || thresholds.staff;

        // Get daily usage
        const dailyLogs = await drizzleDb
          .select({
            tokensConsumed: auditLogs.tokensConsumed,
            aiModelUsed: auditLogs.aiModelUsed
          })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.userId, user.id),
              eq(auditLogs.actionType, 'draft_generated'),
              gte(auditLogs.createdAt, today)
            )
          );

        // Get monthly usage
        const monthlyLogs = await drizzleDb
          .select({
            tokensConsumed: auditLogs.tokensConsumed,
            aiModelUsed: auditLogs.aiModelUsed
          })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.userId, user.id),
              eq(auditLogs.actionType, 'draft_generated'),
              gte(auditLogs.createdAt, thisMonth)
            )
          );

        // Calculate costs
        const dailyCost = dailyLogs.reduce((sum, log) => {
          return sum + this.calculateCost(log.aiModelUsed || 'gpt-4o-mini', log.tokensConsumed || 0);
        }, 0);

        const monthlyCost = monthlyLogs.reduce((sum, log) => {
          return sum + this.calculateCost(log.aiModelUsed || 'gpt-4o-mini', log.tokensConsumed || 0);
        }, 0);

        // Check thresholds
        const dailyExceeded = dailyCost > roleThresholds.daily;
        const monthlyExceeded = monthlyCost > roleThresholds.monthly;

        if (dailyExceeded || monthlyExceeded) {
          const alertType = (dailyCost > roleThresholds.daily * 2 || monthlyCost > roleThresholds.monthly * 2) 
            ? 'critical' 
            : 'warning';

          alerts.push({
            userId: user.id,
            email: user.email,
            role: user.role,
            dailyCost: Math.round(dailyCost * 10000) / 10000,
            monthlyCost: Math.round(monthlyCost * 10000) / 10000,
            dailyThreshold: roleThresholds.daily,
            monthlyThreshold: roleThresholds.monthly,
            alertType
          });
        }
      }

      return alerts;

    } catch (error) {
      console.error('Error getting cost alerts:', error);
      throw new Error('Failed to fetch cost alerts');
    }
  }
}
