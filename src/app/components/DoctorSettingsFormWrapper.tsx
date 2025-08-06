"use client";

import React from 'react';
import { AppContext } from '@/worker';
import { DoctorSettingsForm } from './DoctorSettingsForm';
import { DoctorSettingsFormData, updateDoctorSettingsAction } from '@/app/actions/doctorSettingsActions';

interface DoctorSettingsFormWrapperProps {
  ctx: AppContext;
  initialSettings?: any;
}

export function DoctorSettingsFormWrapper({ ctx, initialSettings }: DoctorSettingsFormWrapperProps) {
  const handleSave = async (formData: DoctorSettingsFormData) => {
    try {
      const result = await updateDoctorSettingsAction(ctx, formData);
      
      if (result.success) {
        // Optionally trigger a page refresh to show updated data
        // window.location.reload();
        console.log('Settings updated successfully:', result.data);
      }
    } catch (error) {
      console.error('Error in wrapper:', error);
      throw error; // Re-throw to let the form component handle the error
    }
  };

  // Set default sign-off if not present
  const settingsWithDefaults = {
    ...initialSettings,
    signOff: initialSettings?.signOff || `Best regards,\n${ctx.user?.email}\nInternal Medicine`
  };

  return (
    <DoctorSettingsForm 
      initialSettings={settingsWithDefaults}
      onSave={handleSave}
    />
  );
}
