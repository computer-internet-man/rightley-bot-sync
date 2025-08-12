/**
 * Server-side business logic functions for the AI Concierge MVP
 * These functions handle role-based data access and operations
 */

import { drizzleDb, users, patientBriefs, doctorSettings, auditLogs, type User } from "@/db";
import { type UserRole } from "@/lib/auth";
import { eq, desc, inArray, like, and, gte, lte } from "drizzle-orm";
import * as Sentry from "@sentry/cloudflare";

// Patient Brief Operations
export async function getPatientBriefs(user: User) {
  Sentry.addBreadcrumb({
    message: `Getting patient briefs for user ${user.id}`,
    category: "database",
    data: { userId: user.id, userRole: user.role }
  });

  if (user.role === "staff") {
    // Staff can only see briefs assigned to them (via doctorId for now)
    // In a real system, you'd have a separate assignment table
    return [];
  }
  
  if (user.role === "doctor" || user.role === "admin") {
    if (user.role === "doctor") {
      // Doctors can only see their own patient briefs
      const briefs = await drizzleDb
        .select({
          id: patientBriefs.id,
          patientName: patientBriefs.patientName,
          briefText: patientBriefs.briefText,
          medicalHistory: patientBriefs.medicalHistory,
          currentMedications: patientBriefs.currentMedications,
          allergies: patientBriefs.allergies,
          doctorNotes: patientBriefs.doctorNotes,
          patientInquiry: patientBriefs.patientInquiry,
          createdAt: patientBriefs.createdAt,
          updatedAt: patientBriefs.updatedAt,
          doctorId: patientBriefs.doctorId,
          doctor: {
            id: users.id,
            username: users.username,
            email: users.email,
            role: users.role,
            createdAt: users.createdAt,
          }
        })
        .from(patientBriefs)
        .leftJoin(users, eq(patientBriefs.doctorId, users.id))
        .where(eq(patientBriefs.doctorId, user.id))
        .orderBy(desc(patientBriefs.updatedAt));
      
      return briefs;
    } else {
      // Admins can see all patient briefs
      const briefs = await drizzleDb
        .select({
          id: patientBriefs.id,
          patientName: patientBriefs.patientName,
          briefText: patientBriefs.briefText,
          medicalHistory: patientBriefs.medicalHistory,
          currentMedications: patientBriefs.currentMedications,
          allergies: patientBriefs.allergies,
          doctorNotes: patientBriefs.doctorNotes,
          patientInquiry: patientBriefs.patientInquiry,
          createdAt: patientBriefs.createdAt,
          updatedAt: patientBriefs.updatedAt,
          doctorId: patientBriefs.doctorId,
          doctor: {
            id: users.id,
            username: users.username,
            email: users.email,
            role: users.role,
            createdAt: users.createdAt,
          }
        })
        .from(patientBriefs)
        .leftJoin(users, eq(patientBriefs.doctorId, users.id))
        .orderBy(desc(patientBriefs.updatedAt));
      
      return briefs;
    }
  }
  
  return [];
}

export async function createPatientBrief(
  user: User,
  data: {
    patientName: string;
    briefText: string;
    medicalHistory: string;
    currentMedications: string;
    allergies: string;
    doctorNotes?: string;
  }
) {
  // Only doctors and admins can create patient briefs
  if (user.role !== "doctor" && user.role !== "admin") {
    throw new Error("Insufficient permissions to create patient briefs");
  }

  Sentry.addBreadcrumb({
    message: `Creating patient brief for ${data.patientName}`,
    category: "database",
    data: { userId: user.id, patientName: data.patientName }
  });

  const [newBrief] = await drizzleDb
    .insert(patientBriefs)
    .values({
      ...data,
      doctorId: user.id,
    })
    .returning();

  // Get the brief with doctor information
  const briefWithDoctor = await drizzleDb
    .select({
      id: patientBriefs.id,
      patientName: patientBriefs.patientName,
      briefText: patientBriefs.briefText,
      medicalHistory: patientBriefs.medicalHistory,
      currentMedications: patientBriefs.currentMedications,
      allergies: patientBriefs.allergies,
      doctorNotes: patientBriefs.doctorNotes,
      patientInquiry: patientBriefs.patientInquiry,
      createdAt: patientBriefs.createdAt,
      updatedAt: patientBriefs.updatedAt,
      doctorId: patientBriefs.doctorId,
      doctor: {
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
      }
    })
    .from(patientBriefs)
    .leftJoin(users, eq(patientBriefs.doctorId, users.id))
    .where(eq(patientBriefs.id, newBrief.id));

  return briefWithDoctor[0];
}

export async function updatePatientBrief(
  user: User,
  briefId: string,
  data: Partial<{
    patientName: string;
    briefText: string;
    medicalHistory: string;
    currentMedications: string;
    allergies: string;
    doctorNotes: string;
  }>
) {
  // Only doctors and admins can update patient briefs
  if (user.role !== "doctor" && user.role !== "admin") {
    throw new Error("Insufficient permissions to update patient briefs");
  }

  // If user is a doctor, ensure they can only update their own briefs
  if (user.role === "doctor") {
    const [brief] = await drizzleDb
      .select()
      .from(patientBriefs)
      .where(eq(patientBriefs.id, briefId));
    
    if (!brief || brief.doctorId !== user.id) {
      throw new Error("Cannot update patient brief - not assigned to you");
    }
  }

  Sentry.addBreadcrumb({
    message: `Updating patient brief ${briefId}`,
    category: "database",
    data: { userId: user.id, briefId }
  });

  await drizzleDb
    .update(patientBriefs)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(patientBriefs.id, briefId));

  // Get the updated brief with doctor information
  const briefWithDoctor = await drizzleDb
    .select({
      id: patientBriefs.id,
      patientName: patientBriefs.patientName,
      briefText: patientBriefs.briefText,
      medicalHistory: patientBriefs.medicalHistory,
      currentMedications: patientBriefs.currentMedications,
      allergies: patientBriefs.allergies,
      doctorNotes: patientBriefs.doctorNotes,
      patientInquiry: patientBriefs.patientInquiry,
      createdAt: patientBriefs.createdAt,
      updatedAt: patientBriefs.updatedAt,
      doctorId: patientBriefs.doctorId,
      doctor: {
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
      }
    })
    .from(patientBriefs)
    .leftJoin(users, eq(patientBriefs.doctorId, users.id))
    .where(eq(patientBriefs.id, briefId));

  return briefWithDoctor[0];
}

// Doctor Settings Operations
export async function getDoctorSettings(user: User) {
  if (user.role !== "doctor" && user.role !== "admin") {
    throw new Error("Only doctors can access doctor settings");
  }

  Sentry.addBreadcrumb({
    message: `Getting doctor settings for user ${user.id}`,
    category: "database",
    data: { userId: user.id }
  });

  const settings = await drizzleDb
    .select({
      id: doctorSettings.id,
      doctorId: doctorSettings.doctorId,
      communicationTone: doctorSettings.communicationTone,
      signOff: doctorSettings.signOff,
      maxWords: doctorSettings.maxWords,
      readingLevel: doctorSettings.readingLevel,
      specialtyFocus: doctorSettings.specialtyFocus,
      createdAt: doctorSettings.createdAt,
      updatedAt: doctorSettings.updatedAt,
      doctor: {
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
      }
    })
    .from(doctorSettings)
    .leftJoin(users, eq(doctorSettings.doctorId, users.id))
    .where(eq(doctorSettings.doctorId, user.id));

  return settings[0] || null;
}

export async function updateDoctorSettings(
  user: User,
  data: {
    communicationTone: string;
    signOff: string;
    maxWords: number;
    readingLevel?: string;
    specialtyFocus?: string;
  }
) {
  if (user.role !== "doctor") {
    throw new Error("Only doctors can update their settings");
  }

  Sentry.addBreadcrumb({
    message: `Updating doctor settings for user ${user.id}`,
    category: "database",
    data: { userId: user.id }
  });

  // Check if settings exist
  const [existingSettings] = await drizzleDb
    .select()
    .from(doctorSettings)
    .where(eq(doctorSettings.doctorId, user.id));

  if (existingSettings) {
    // Update existing settings
    await drizzleDb
      .update(doctorSettings)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(doctorSettings.doctorId, user.id));
  } else {
    // Create new settings
    await drizzleDb
      .insert(doctorSettings)
      .values({
        ...data,
        doctorId: user.id,
      });
  }

  // Return updated settings with doctor info
  const settings = await drizzleDb
    .select({
      id: doctorSettings.id,
      doctorId: doctorSettings.doctorId,
      communicationTone: doctorSettings.communicationTone,
      signOff: doctorSettings.signOff,
      maxWords: doctorSettings.maxWords,
      readingLevel: doctorSettings.readingLevel,
      specialtyFocus: doctorSettings.specialtyFocus,
      createdAt: doctorSettings.createdAt,
      updatedAt: doctorSettings.updatedAt,
      doctor: {
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
      }
    })
    .from(doctorSettings)
    .leftJoin(users, eq(doctorSettings.doctorId, users.id))
    .where(eq(doctorSettings.doctorId, user.id));

  return settings[0];
}

// Audit Log Operations
export async function getAuditLogs(user: User, filters?: {
  patientName?: string;
  actionType?: string;
  startDate?: Date;
  endDate?: Date;
}) {
  if (user.role !== "auditor" && user.role !== "admin" && user.role !== "doctor") {
    throw new Error("Insufficient permissions to view audit logs");
  }

  Sentry.addBreadcrumb({
    message: `Getting audit logs for user ${user.id}`,
    category: "database",
    data: { userId: user.id, userRole: user.role, filters }
  });

  let whereConditions: any[] = [];

  // Apply role-based filtering
  if (user.role === "doctor") {
    // Doctors can only see audit logs for their patients
    const doctorBriefs = await drizzleDb
      .select({ patientName: patientBriefs.patientName })
      .from(patientBriefs)
      .where(eq(patientBriefs.doctorId, user.id));
    
    const patientNames = doctorBriefs.map(brief => brief.patientName);
    if (patientNames.length > 0) {
      whereConditions.push(inArray(auditLogs.patientName, patientNames));
    } else {
      // If doctor has no patients, return empty array
      return [];
    }
  }

  // Apply additional filters
  if (filters) {
    if (filters.patientName) {
      whereConditions.push(like(auditLogs.patientName, `%${filters.patientName}%`));
    }
    if (filters.actionType) {
      whereConditions.push(eq(auditLogs.actionType, filters.actionType));
    }
    if (filters.startDate) {
      whereConditions.push(gte(auditLogs.createdAt, filters.startDate));
    }
    if (filters.endDate) {
      whereConditions.push(lte(auditLogs.createdAt, filters.endDate));
    }
  }

  const logs = await drizzleDb
    .select({
      id: auditLogs.id,
      userId: auditLogs.userId,
      patientName: auditLogs.patientName,
      patientId: auditLogs.patientId,
      requestText: auditLogs.requestText,
      generatedDraft: auditLogs.generatedDraft,
      finalMessage: auditLogs.finalMessage,
      actionType: auditLogs.actionType,
      deliveryStatus: auditLogs.deliveryStatus,
      deliveredAt: auditLogs.deliveredAt,
      reviewerId: auditLogs.reviewerId,
      reviewNotes: auditLogs.reviewNotes,
      reviewedAt: auditLogs.reviewedAt,
      ipAddress: auditLogs.ipAddress,
      userAgent: auditLogs.userAgent,
      editHistory: auditLogs.editHistory,
      retryCount: auditLogs.retryCount,
      lastRetryAt: auditLogs.lastRetryAt,
      failureReason: auditLogs.failureReason,
      contentHash: auditLogs.contentHash,
      aiModelUsed: auditLogs.aiModelUsed,
      tokensConsumed: auditLogs.tokensConsumed,
      createdAt: auditLogs.createdAt,
      updatedAt: auditLogs.updatedAt,
      user: {
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
      }
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(100); // Limit results for performance

  return logs;
}

export async function createAuditLog(
  user: User,
  data: {
    patientName: string;
    requestText: string;
    generatedDraft: string;
    finalMessage: string;
    actionType: string;
    deliveryStatus?: string;
  }
) {
  Sentry.addBreadcrumb({
    message: `Creating audit log for patient ${data.patientName}`,
    category: "database",
    data: { userId: user.id, patientName: data.patientName, actionType: data.actionType }
  });

  const [newLog] = await drizzleDb
    .insert(auditLogs)
    .values({
      ...data,
      userId: user.id,
      deliveryStatus: data.deliveryStatus || "pending",
    })
    .returning();

  // Get the log with user information
  const logWithUser = await drizzleDb
    .select({
      id: auditLogs.id,
      userId: auditLogs.userId,
      patientName: auditLogs.patientName,
      patientId: auditLogs.patientId,
      requestText: auditLogs.requestText,
      generatedDraft: auditLogs.generatedDraft,
      finalMessage: auditLogs.finalMessage,
      actionType: auditLogs.actionType,
      deliveryStatus: auditLogs.deliveryStatus,
      deliveredAt: auditLogs.deliveredAt,
      reviewerId: auditLogs.reviewerId,
      reviewNotes: auditLogs.reviewNotes,
      reviewedAt: auditLogs.reviewedAt,
      ipAddress: auditLogs.ipAddress,
      userAgent: auditLogs.userAgent,
      editHistory: auditLogs.editHistory,
      retryCount: auditLogs.retryCount,
      lastRetryAt: auditLogs.lastRetryAt,
      failureReason: auditLogs.failureReason,
      contentHash: auditLogs.contentHash,
      aiModelUsed: auditLogs.aiModelUsed,
      tokensConsumed: auditLogs.tokensConsumed,
      createdAt: auditLogs.createdAt,
      updatedAt: auditLogs.updatedAt,
      user: {
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
      }
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(eq(auditLogs.id, newLog.id));

  return logWithUser[0];
}

// Staff Assignment Operations (for draft workflow)
export async function getAssignedPatients(user: User) {
  // In a real system, you'd have a separate PatientAssignment table
  // For now, we'll use patient briefs from the database
  if (user.role === "staff" || user.role === "reviewer" || user.role === "doctor" || user.role === "admin") {
    try {
      Sentry.addBreadcrumb({
        message: `Getting assigned patients for user ${user.id}`,
        category: "database",
        data: { userId: user.id, userRole: user.role }
      });

      // Get patient briefs from database and transform them for the draft workflow
      const patientBriefResults = await drizzleDb
        .select()
        .from(patientBriefs)
        .orderBy(desc(patientBriefs.updatedAt));

      const transformedPatients = patientBriefResults.map(brief => ({
        id: brief.id,
        name: brief.patientName,
        condition: brief.briefText,
        lastContact: brief.updatedAt,
        status: "active", // You could derive this from recent audit logs
      }));
      return transformedPatients;
    } catch (error) {
      console.error("Failed to fetch patient briefs:", error);
      Sentry.captureException(error);
      // Fallback to empty array if database query fails
      return [];
    }
  }
  
  return [];
}

// User role and permission utilities
export function canAccessPatientBriefs(user: User): boolean {
  return ["doctor", "admin"].includes(user.role);
}

export function canEditPatientBriefs(user: User): boolean {
  return ["doctor", "admin"].includes(user.role);
}

export function canAccessDoctorSettings(user: User): boolean {
  return user.role === "doctor";
}

export function canAccessAuditLogs(user: User): boolean {
  return ["auditor", "admin", "doctor"].includes(user.role);
}

export function canAccessDraftWorkflow(user: User): boolean {
  return ["staff", "reviewer", "doctor", "admin"].includes(user.role);
}

export function canSendMessages(user: User): boolean {
  return ["reviewer", "doctor", "admin"].includes(user.role);
}
