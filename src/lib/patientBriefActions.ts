/**
 * Server functions for Patient Brief CRUD operations
 * These functions handle form submissions and database operations
 */

import { drizzleDb, users, patientBriefs, type User } from "@/db";
import { eq, like, or, and, gte, lte, desc } from "drizzle-orm";
import { canEditPatientBriefs } from "@/lib/server-functions";
import { z } from "zod";

// Schema for patient brief form validation
const PatientBriefSchema = z.object({
  patientName: z.string().min(1, "Patient name is required").max(100),
  briefText: z.string().min(1, "Brief text is required").max(1000),
  medicalHistory: z.string().max(2000).default(""),
  currentMedications: z.string().max(1000).default(""),
  allergies: z.string().max(500).default(""),
  doctorNotes: z.string().max(1000).default(""),
  patientInquiry: z.string().max(2000).default(""),
});

// In-memory store for brief locks (in production, use Redis or database)
const briefLocks = new Map<string, { userId: string; lockedAt: Date; email: string }>();

// Clean up expired locks (older than 30 minutes)
function cleanupExpiredLocks() {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  for (const [briefId, lock] of briefLocks.entries()) {
    if (lock.lockedAt < thirtyMinutesAgo) {
      briefLocks.delete(briefId);
    }
  }
}

export async function createPatientBrief(user: User, data: {
  patientName: string;
  briefText: string;
  medicalHistory?: string;
  currentMedications?: string;
  allergies?: string;
  doctorNotes?: string;
  patientInquiry?: string;
}) {
  try {
    if (!canEditPatientBriefs(user)) {
      return { error: "Insufficient permissions to create patient briefs" };
    }

    const validatedData = PatientBriefSchema.parse(data);

    const [brief] = await drizzleDb
      .insert(patientBriefs)
      .values({
        ...validatedData,
        doctorId: user.id,
      })
      .returning();

    // Get brief with doctor information
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
      .where(eq(patientBriefs.id, brief.id));

    const briefResult = briefWithDoctor[0];

    return { success: true, brief: briefResult };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.errors[0].message };
    }
    console.error("Error creating patient brief:", error);
    return { error: "Failed to create patient brief" };
  }
}

export async function updatePatientBrief(user: User, briefId: string, data: {
  patientName?: string;
  briefText?: string;
  medicalHistory?: string;
  currentMedications?: string;
  allergies?: string;
  doctorNotes?: string;
  patientInquiry?: string;
}) {
  try {
    if (!canEditPatientBriefs(user)) {
      return { error: "Insufficient permissions to update patient briefs" };
    }

    // Check if brief is locked by another user
    cleanupExpiredLocks();
    const lock = briefLocks.get(briefId);
    if (lock && lock.userId !== user.id) {
      return { error: `Brief is currently being edited by ${lock.email}` };
    }

    const validatedData = PatientBriefSchema.partial().parse(data);

    // If user is a doctor, ensure they can only update their own briefs
    if (user.role === "doctor") {
      const [brief] = await drizzleDb
        .select()
        .from(patientBriefs)
        .where(eq(patientBriefs.id, briefId))
        .limit(1);
      
      if (!brief || brief.doctorId !== user.id) {
        return { error: "Cannot update patient brief - not assigned to you" };
      }
    }

    await drizzleDb
      .update(patientBriefs)
      .set({
        ...validatedData,
        updatedAt: new Date(),
      })
      .where(eq(patientBriefs.id, briefId));

    // Get updated brief with doctor information
    const updatedBriefWithDoctor = await drizzleDb
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

    const updatedBrief = updatedBriefWithDoctor[0];

    // Release lock after successful update
    briefLocks.delete(briefId);

    return { success: true, brief: updatedBrief };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.errors[0].message };
    }
    console.error("Error updating patient brief:", error);
    return { error: "Failed to update patient brief" };
  }
}

export async function deletePatientBrief(user: User, briefId: string) {
  try {
    if (user.role !== "admin") {
      return { error: "Only administrators can delete patient briefs" };
    }

    await drizzleDb
      .delete(patientBriefs)
      .where(eq(patientBriefs.id, briefId));

    // Remove any locks
    briefLocks.delete(briefId);

    return { success: true };
  } catch (error) {
    console.error("Error deleting patient brief:", error);
    return { error: "Failed to delete patient brief" };
  }
}

export async function toggleBriefLock(user: User, briefId: string, action: "lock" | "unlock") {
  try {
    if (!canEditPatientBriefs(user)) {
      return { error: "Insufficient permissions" };
    }

    cleanupExpiredLocks();

    if (action === "lock") {
      const existingLock = briefLocks.get(briefId);
      if (existingLock && existingLock.userId !== user.id) {
        return { 
          error: `Brief is already locked by ${existingLock.email}`,
          lockedBy: existingLock.email 
        };
      }

      briefLocks.set(briefId, {
        userId: user.id,
        lockedAt: new Date(),
        email: user.email,
      });

      return { 
        success: true, 
        locked: true,
        lockedBy: user.email 
      };
    } else {
      const lock = briefLocks.get(briefId);
      if (lock && lock.userId === user.id) {
        briefLocks.delete(briefId);
      }

      return { 
        success: true, 
        locked: false 
      };
    }
  } catch (error) {
    console.error("Error toggling brief lock:", error);
    return { error: "Failed to toggle brief lock" };
  }
}

export async function getBriefLockStatus(briefId: string) {
  try {
    cleanupExpiredLocks();
    const lock = briefLocks.get(briefId);
    
    return {
      locked: !!lock,
      lockedBy: lock?.email,
      lockedAt: lock?.lockedAt,
    };
  } catch (error) {
    console.error("Error getting brief lock status:", error);
    return { locked: false };
  }
}

export async function searchPatientBriefs(user: User, query: string, filters: {
  status?: string;
  doctorId?: string;
  startDate?: string;
  endDate?: string;
}) {
  try {
    let whereConditions: any[] = [];

    // Role-based access control
    if (user.role === "doctor") {
      whereConditions.push(eq(patientBriefs.doctorId, user.id));
    }

    // Search query
    if (query) {
      const searchConditions = [
        like(patientBriefs.patientName, `%${query}%`),
        like(patientBriefs.briefText, `%${query}%`),
        like(patientBriefs.currentMedications, `%${query}%`),
        like(patientBriefs.allergies, `%${query}%`),
      ];
      whereConditions.push(or(...searchConditions));
    }

    // Filters
    if (filters.doctorId && user.role === "admin") {
      whereConditions.push(eq(patientBriefs.doctorId, filters.doctorId));
    }

    if (filters.startDate) {
      whereConditions.push(gte(patientBriefs.updatedAt, new Date(filters.startDate)));
    }

    if (filters.endDate) {
      whereConditions.push(lte(patientBriefs.updatedAt, new Date(filters.endDate)));
    }

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
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(desc(patientBriefs.updatedAt))
      .limit(50); // Limit results

    return { success: true, briefs };
  } catch (error) {
    console.error("Error searching patient briefs:", error);
    return { error: "Failed to search patient briefs" };
  }
}

export async function getAvailableDoctors() {
  try {
    const doctors = await drizzleDb
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
      })
      .from(users)
      .where(eq(users.role, "doctor"))
      .orderBy(users.email);

    return { success: true, doctors };
  } catch (error) {
    console.error("Error fetching doctors:", error);
    return { error: "Failed to fetch doctors" };
  }
}
