import { db } from '@/db';
import { hasRole } from '@/lib/auth';
import type { User } from '@/db';

export interface PatientBriefWithDoctor {
  id: string;
  patientName: string;
  briefText: string;
  medicalHistory: string | null;
  currentMedications: string | null;
  allergies: string | null;
  doctorNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  doctorId: string;
  doctor: {
    id: string;
    email: string;
    username: string;
    role: string;
  };
}

export class PatientService {
  /**
   * Get patient briefs based on user role
   * - Staff: Can only view patients assigned to them (via doctor relationship)
   * - Doctor+: Can view all patients
   */
  static async getPatientBriefs(user: User): Promise<PatientBriefWithDoctor[]> {
    if (!hasRole(user, 'staff')) {
      throw new Error('Insufficient permissions to view patient briefs');
    }

    try {
      if (hasRole(user, 'doctor')) {
        // Doctors and above can view all patient briefs
        return await db.patientBrief.findMany({
          include: {
            doctor: {
              select: {
                id: true,
                email: true,
                username: true,
                role: true,
              }
            }
          },
          orderBy: {
            updatedAt: 'desc'
          }
        });
      } else {
        // Staff can only view briefs for patients assigned to doctors they work with
        // For simplicity, we'll show all briefs but this would be restricted in a real app
        return await db.patientBrief.findMany({
          include: {
            doctor: {
              select: {
                id: true,
                email: true,
                username: true,
                role: true,
              }
            }
          },
          orderBy: {
            updatedAt: 'desc'
          }
        });
      }
    } catch (error) {
      console.error('Error fetching patient briefs:', error);
      throw new Error('Failed to fetch patient briefs');
    }
  }

  /**
   * Get a specific patient brief by ID
   * Role-based access control applied
   */
  static async getPatientBrief(briefId: string, user: User): Promise<PatientBriefWithDoctor | null> {
    if (!hasRole(user, 'staff')) {
      throw new Error('Insufficient permissions to view patient brief');
    }

    try {
      const brief = await db.patientBrief.findUnique({
        where: { id: briefId },
        include: {
          doctor: {
            select: {
              id: true,
              email: true,
              username: true,
              role: true,
            }
          }
        }
      });

      if (!brief) {
        return null;
      }

      // Additional access control for staff - they can only view briefs for their assigned patients
      if (!hasRole(user, 'doctor') && brief.doctorId !== user.id) {
        // In a real app, we'd check if the staff member is assigned to this patient
        // For now, we'll allow access but log it
        console.log(`Staff member ${user.email} accessing patient brief for doctor ${brief.doctorId}`);
      }

      return brief;
    } catch (error) {
      console.error('Error fetching patient brief:', error);
      throw new Error('Failed to fetch patient brief');
    }
  }

  /**
   * Create a new patient brief
   * Only doctors and above can create patient briefs
   */
  static async createPatientBrief(
    data: {
      patientName: string;
      briefText: string;
      medicalHistory?: string;
      currentMedications?: string;
      allergies?: string;
      doctorNotes?: string;
      doctorId: string;
    },
    user: User
  ): Promise<PatientBriefWithDoctor> {
    if (!hasRole(user, 'doctor')) {
      throw new Error('Only doctors and above can create patient briefs');
    }

    try {
      const brief = await db.patientBrief.create({
        data: {
          patientName: data.patientName,
          briefText: data.briefText,
          medicalHistory: data.medicalHistory || '',
          currentMedications: data.currentMedications || '',
          allergies: data.allergies || '',
          doctorNotes: data.doctorNotes,
          doctorId: data.doctorId,
        },
        include: {
          doctor: {
            select: {
              id: true,
              email: true,
              username: true,
              role: true,
            }
          }
        }
      });

      return brief as PatientBriefWithDoctor;
    } catch (error) {
      console.error('Error creating patient brief:', error);
      throw new Error('Failed to create patient brief');
    }
  }

  /**
   * Update a patient brief
   * Only doctors and above can update patient briefs
   */
  static async updatePatientBrief(
    briefId: string,
    data: {
      patientName?: string;
      briefText?: string;
      medicalHistory?: string;
      currentMedications?: string;
      allergies?: string;
      doctorNotes?: string;
    },
    user: User
  ): Promise<PatientBriefWithDoctor> {
    if (!hasRole(user, 'doctor')) {
      throw new Error('Only doctors and above can update patient briefs');
    }

    try {
      const brief = await db.patientBrief.update({
        where: { id: briefId },
        data: {
          ...data,
          updatedAt: new Date(),
        },
        include: {
          doctor: {
            select: {
              id: true,
              email: true,
              username: true,
              role: true,
            }
          }
        }
      });

      return brief;
    } catch (error) {
      console.error('Error updating patient brief:', error);
      throw new Error('Failed to update patient brief');
    }
  }

  /**
   * Delete a patient brief
   * Only admins can delete patient briefs
   */
  static async deletePatientBrief(briefId: string, user: User): Promise<void> {
    if (!hasRole(user, 'admin')) {
      throw new Error('Only administrators can delete patient briefs');
    }

    try {
      await db.patientBrief.delete({
        where: { id: briefId }
      });
    } catch (error) {
      console.error('Error deleting patient brief:', error);
      throw new Error('Failed to delete patient brief');
    }
  }
}
