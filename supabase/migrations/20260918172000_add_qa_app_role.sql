-- Add 'qa' to app_role enum for Quality Assurance reviewers
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'qa';
