/**
 * Server-side business logic functions for the AI Concierge MVP
 * These functions handle role-based data access and operations
 */

import { db, type User } from "@/db";
import { type UserRole } from "@/lib/auth";

// Patient Brief Operations
export async function getPatientBriefs(user: User) {
  if (user.role === "staff") {
    // Staff can only see briefs assigned to them (via doctorId for now)
    // In a real system, you'd have a separate assignment table
    return [];
  }
  
  if (user.role === "doctor" || user.role === "admin") {
    if (user.role === "doctor") {
      // Doctors can only see their own patient briefs
      return await db.patientBrief.findMany({
        where: { doctorId: user.id },
        include: { doctor: true },
        orderBy: { updatedAt: "desc" },
      });
    } else {
      // Admins can see all patient briefs
      return await db.patientBrief.findMany({
        include: { doctor: true },
        orderBy: { updatedAt: "desc" },
      });
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

  return await db.patientBrief.create({
    data: {
      ...data,
      doctorId: user.id,
    },
    include: { doctor: true },
  });
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
    const brief = await db.patientBrief.findUnique({
      where: { id: briefId },
    });
    
    if (!brief || brief.doctorId !== user.id) {
      throw new Error("Cannot update patient brief - not assigned to you");
    }
  }

  return await db.patientBrief.update({
    where: { id: briefId },
    data,
    include: { doctor: true },
  });
}

// Doctor Settings Operations
export async function getDoctorSettings(user: User) {
  if (user.role !== "doctor" && user.role !== "admin") {
    throw new Error("Only doctors can access doctor settings");
  }

  return await db.doctorSettings.findUnique({
    where: { doctorId: user.id },
    include: { doctor: true },
  });
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

  return await db.doctorSettings.upsert({
    where: { doctorId: user.id },
    update: data,
    create: {
      ...data,
      doctorId: user.id,
    },
    include: { doctor: true },
  });
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

  const where: any = {};

  // Apply role-based filtering
  if (user.role === "doctor") {
    // Doctors can only see audit logs for their patients
    const doctorBriefs = await db.patientBrief.findMany({
      where: { doctorId: user.id },
      select: { patientName: true },
    });
    
    const patientNames = doctorBriefs.map(brief => brief.patientName);
    where.patientName = { in: patientNames };
  }

  // Apply additional filters
  if (filters) {
    if (filters.patientName) {
      where.patientName = { contains: filters.patientName, mode: "insensitive" };
    }
    if (filters.actionType) {
      where.actionType = filters.actionType;
    }
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }
  }

  return await db.auditLog.findMany({
    where,
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 100, // Limit results for performance
  });
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
  return await db.auditLog.create({
    data: {
      ...data,
      userId: user.id,
      deliveryStatus: data.deliveryStatus || "pending",
    },
    include: { user: true },
  });
}

// Staff Assignment Operations (for draft workflow)
export async function getAssignedPatients(user: User) {
  // In a real system, you'd have a separate PatientAssignment table
  // For now, we'll use patient briefs from the database
  if (user.role === "staff" || user.role === "reviewer" || user.role === "doctor" || user.role === "admin") {
    try {
      // Get patient briefs from database and transform them for the draft workflow
      const patientBriefs = await db.patientBrief.findMany({
        orderBy: { updatedAt: 'desc' }
      });

      const transformedPatients = patientBriefs.map(brief => ({
        id: brief.id,
        name: brief.patientName,
        condition: brief.briefText,
        lastContact: brief.updatedAt,
        status: "active", // You could derive this from recent audit logs
      }));
      return transformedPatients;
    } catch (error) {
      console.error("Failed to fetch patient briefs:", error);
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
