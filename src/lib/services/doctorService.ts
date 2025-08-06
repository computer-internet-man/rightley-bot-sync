import { db } from '@/db';
import { hasRole } from '@/lib/auth';
import type { User, DoctorSettings } from '@/db';

export interface DoctorSettingsData {
  communicationTone: string;
  signOff: string;
  maxWords: number;
  readingLevel: string;
  specialtyFocus: string;
}

export class DoctorService {
  /**
   * Get doctor settings for a specific doctor
   * Only the doctor themselves or admins can access settings
   */
  static async getDoctorSettings(doctorId: string, user: User): Promise<DoctorSettings | null> {
    if (!hasRole(user, 'doctor')) {
      throw new Error('Insufficient permissions to view doctor settings');
    }

    // Non-admins can only access their own settings
    if (!hasRole(user, 'admin') && user.id !== doctorId) {
      throw new Error('You can only access your own doctor settings');
    }

    try {
      const settings = await db.doctorSettings.findUnique({
        where: { doctorId }
      });

      return settings;
    } catch (error) {
      console.error('Error fetching doctor settings:', error);
      throw new Error('Failed to fetch doctor settings');
    }
  }

  /**
   * Create or update doctor settings
   * Only doctors can modify their own settings, admins can modify any
   */
  static async upsertDoctorSettings(
    doctorId: string,
    data: DoctorSettingsData,
    user: User
  ): Promise<DoctorSettings> {
    if (!hasRole(user, 'doctor')) {
      throw new Error('Insufficient permissions to modify doctor settings');
    }

    // Non-admins can only modify their own settings
    if (!hasRole(user, 'admin') && user.id !== doctorId) {
      throw new Error('You can only modify your own doctor settings');
    }

    // Verify the target user is actually a doctor
    const targetDoctor = await db.user.findUnique({
      where: { id: doctorId }
    });

    if (!targetDoctor || !hasRole(targetDoctor, 'doctor')) {
      throw new Error('Target user is not a doctor');
    }

    try {
      const settings = await db.doctorSettings.upsert({
        where: { doctorId },
        update: {
          communicationTone: data.communicationTone,
          signOff: data.signOff,
          maxWords: data.maxWords,
          readingLevel: data.readingLevel,
          specialtyFocus: data.specialtyFocus,
          updatedAt: new Date(),
        },
        create: {
          doctorId,
          communicationTone: data.communicationTone,
          signOff: data.signOff,
          maxWords: data.maxWords,
          readingLevel: data.readingLevel,
          specialtyFocus: data.specialtyFocus,
        }
      });

      return settings;
    } catch (error) {
      console.error('Error upserting doctor settings:', error);
      throw new Error('Failed to save doctor settings');
    }
  }

  /**
   * Get all doctors for admin purposes
   * Only admins can access this
   */
  static async getAllDoctors(user: User) {
    if (!hasRole(user, 'admin')) {
      throw new Error('Only administrators can view all doctors');
    }

    try {
      const doctors = await db.user.findMany({
        where: {
          role: {
            in: ['doctor', 'admin'] // Include admins who might also be doctors
          }
        },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          createdAt: true,
        },
        orderBy: {
          email: 'asc'
        }
      });

      return doctors;
    } catch (error) {
      console.error('Error fetching doctors:', error);
      throw new Error('Failed to fetch doctors');
    }
  }

  /**
   * Get doctor's patient count and activity stats
   * Only the doctor themselves or admins can access stats
   */
  static async getDoctorStats(doctorId: string, user: User) {
    if (!hasRole(user, 'doctor')) {
      throw new Error('Insufficient permissions to view doctor statistics');
    }

    // Non-admins can only access their own stats
    if (!hasRole(user, 'admin') && user.id !== doctorId) {
      throw new Error('You can only access your own statistics');
    }

    try {
      const [patientCount, recentActivity] = await Promise.all([
        // Count of patient briefs for this doctor
        db.patientBrief.count({
          where: { doctorId }
        }),
        // Recent audit logs for this doctor's patients
        db.auditLog.count({
          where: {
            userId: doctorId,
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
            }
          }
        })
      ]);

      return {
        patientCount,
        recentActivityCount: recentActivity,
      };
    } catch (error) {
      console.error('Error fetching doctor stats:', error);
      throw new Error('Failed to fetch doctor statistics');
    }
  }
}
