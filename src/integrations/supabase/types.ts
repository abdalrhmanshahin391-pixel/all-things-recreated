export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      about_blocks: {
        Row: {
          body_ar: string
          body_en: string
          created_at: string
          extra: Json
          id: string
          image_url: string
          kind: string
          link_url: string
          sort_order: number
          title_ar: string
          title_en: string
          updated_at: string
          visible: boolean
        }
        Insert: {
          body_ar?: string
          body_en?: string
          created_at?: string
          extra?: Json
          id?: string
          image_url?: string
          kind?: string
          link_url?: string
          sort_order?: number
          title_ar?: string
          title_en?: string
          updated_at?: string
          visible?: boolean
        }
        Update: {
          body_ar?: string
          body_en?: string
          created_at?: string
          extra?: Json
          id?: string
          image_url?: string
          kind?: string
          link_url?: string
          sort_order?: number
          title_ar?: string
          title_en?: string
          updated_at?: string
          visible?: boolean
        }
        Relationships: []
      }
      ad_creatives: {
        Row: {
          created_at: string
          design: Json
          id: string
          owner: string
          preview_path: string | null
          template: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          design?: Json
          id?: string
          owner: string
          preview_path?: string | null
          template?: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          design?: Json
          id?: string
          owner?: string
          preview_path?: string | null
          template?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_ai_keys: {
        Row: {
          api_key: string
          preferred_model: string | null
          provider: string
          slot: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          api_key: string
          preferred_model?: string | null
          provider: string
          slot?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          api_key?: string
          preferred_model?: string | null
          provider?: string
          slot?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      admin_ai_model_limits: {
        Row: {
          api_model_id: string | null
          cooldown_seconds: number
          created_at: string
          enabled: boolean
          label: string
          last_error: string | null
          last_error_at: string | null
          max_concurrent: number
          model_id: string
          rpd: number
          rpm: number
          smooth_pacing: boolean
          sort_order: number
          supports_vision: boolean
          updated_at: string
          updated_by: string | null
          use_json_mime: boolean
        }
        Insert: {
          api_model_id?: string | null
          cooldown_seconds?: number
          created_at?: string
          enabled?: boolean
          label: string
          last_error?: string | null
          last_error_at?: string | null
          max_concurrent?: number
          model_id: string
          rpd?: number
          rpm?: number
          smooth_pacing?: boolean
          sort_order?: number
          supports_vision?: boolean
          updated_at?: string
          updated_by?: string | null
          use_json_mime?: boolean
        }
        Update: {
          api_model_id?: string | null
          cooldown_seconds?: number
          created_at?: string
          enabled?: boolean
          label?: string
          last_error?: string | null
          last_error_at?: string | null
          max_concurrent?: number
          model_id?: string
          rpd?: number
          rpm?: number
          smooth_pacing?: boolean
          sort_order?: number
          supports_vision?: boolean
          updated_at?: string
          updated_by?: string | null
          use_json_mime?: boolean
        }
        Relationships: []
      }
      admin_data_exports: {
        Row: {
          action: string
          actor_id: string | null
          actor_label: string | null
          created_at: string
          details: Json | null
          id: string
          record_count: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          record_count?: number
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          record_count?: number
        }
        Relationships: []
      }
      admin_hub_layout: {
        Row: {
          created_at: string
          id: boolean
          layout: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: boolean
          layout?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: boolean
          layout?: Json
          updated_at?: string
        }
        Relationships: []
      }
      announcement_audiences: {
        Row: {
          announcement_id: string
          group_id: string
        }
        Insert: {
          announcement_id: string
          group_id: string
        }
        Update: {
          announcement_id?: string
          group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_audiences_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "site_announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_audiences_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "user_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      aquavision_items: {
        Row: {
          answer_letter: string | null
          concept: string | null
          created_at: string
          error: string | null
          explanation: string | null
          id: string
          imported: boolean
          item_index: number
          job_id: string
          number: string | null
          options: Json
          page_id: string | null
          solved: boolean
          status: string
          stem: string
          summary_table: string | null
        }
        Insert: {
          answer_letter?: string | null
          concept?: string | null
          created_at?: string
          error?: string | null
          explanation?: string | null
          id?: string
          imported?: boolean
          item_index?: number
          job_id: string
          number?: string | null
          options?: Json
          page_id?: string | null
          solved?: boolean
          status?: string
          stem: string
          summary_table?: string | null
        }
        Update: {
          answer_letter?: string | null
          concept?: string | null
          created_at?: string
          error?: string | null
          explanation?: string | null
          id?: string
          imported?: boolean
          item_index?: number
          job_id?: string
          number?: string | null
          options?: Json
          page_id?: string | null
          solved?: boolean
          status?: string
          stem?: string
          summary_table?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aquavision_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "aquavision_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aquavision_items_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "aquavision_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      aquavision_jobs: {
        Row: {
          answer_batch_id: string | null
          course_id: string | null
          created_at: string
          error: string | null
          group_id: string | null
          id: string
          imported_count: number
          pdf_name: string
          read_batch_id: string | null
          reference_book: string | null
          stage: string
          status: string
          subject_id: string | null
          total_pages: number
          updated_at: string
          user_id: string
        }
        Insert: {
          answer_batch_id?: string | null
          course_id?: string | null
          created_at?: string
          error?: string | null
          group_id?: string | null
          id?: string
          imported_count?: number
          pdf_name: string
          read_batch_id?: string | null
          reference_book?: string | null
          stage?: string
          status?: string
          subject_id?: string | null
          total_pages?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          answer_batch_id?: string | null
          course_id?: string | null
          created_at?: string
          error?: string | null
          group_id?: string | null
          id?: string
          imported_count?: number
          pdf_name?: string
          read_batch_id?: string | null
          reference_book?: string | null
          stage?: string
          status?: string
          subject_id?: string | null
          total_pages?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      aquavision_pages: {
        Row: {
          created_at: string
          error: string | null
          id: string
          job_id: string
          page_number: number
          pdf_b64: string | null
          question_count: number
          raw_json: Json | null
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          job_id: string
          page_number: number
          pdf_b64?: string | null
          question_count?: number
          raw_json?: Json | null
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          job_id?: string
          page_number?: number
          pdf_b64?: string | null
          question_count?: number
          raw_json?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "aquavision_pages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "aquavision_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      committee_activity_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_label: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_label: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      committee_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          section: string
          sort_order: number
          subject_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          section?: string
          sort_order?: number
          subject_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          section?: string
          sort_order?: number
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "committee_categories_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "committee_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      committee_members: {
        Row: {
          accent: number
          country_code: string
          country_label: string
          created_at: string
          description_ar: string
          description_en: string
          id: string
          is_founder: boolean
          name_ar: string
          name_en: string
          photo_url: string
          role_label: string
          sort_order: number
          updated_at: string
          year_label: string
        }
        Insert: {
          accent?: number
          country_code?: string
          country_label?: string
          created_at?: string
          description_ar?: string
          description_en?: string
          id?: string
          is_founder?: boolean
          name_ar?: string
          name_en?: string
          photo_url?: string
          role_label?: string
          sort_order?: number
          updated_at?: string
          year_label?: string
        }
        Update: {
          accent?: number
          country_code?: string
          country_label?: string
          created_at?: string
          description_ar?: string
          description_en?: string
          id?: string
          is_founder?: boolean
          name_ar?: string
          name_en?: string
          photo_url?: string
          role_label?: string
          sort_order?: number
          updated_at?: string
          year_label?: string
        }
        Relationships: []
      }
      committee_modules: {
        Row: {
          closed_color: string
          closed_note: string | null
          closed_style: string
          created_at: string
          icon_key: string
          id: string
          is_closed: boolean
          name: string
          semester_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          closed_color?: string
          closed_note?: string | null
          closed_style?: string
          created_at?: string
          icon_key?: string
          id?: string
          is_closed?: boolean
          name: string
          semester_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          closed_color?: string
          closed_note?: string | null
          closed_style?: string
          created_at?: string
          icon_key?: string
          id?: string
          is_closed?: boolean
          name?: string
          semester_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "committee_modules_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "committee_semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      committee_resources: {
        Row: {
          allow_preview: boolean
          category_id: string
          created_at: string
          description: string | null
          drive_download_link: string | null
          drive_file_id: string | null
          drive_web_link: string | null
          file_path: string | null
          file_size: number | null
          id: string
          is_protected: boolean
          kind: string
          parent_resource_id: string | null
          sort_order: number
          storage_provider: string
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          allow_preview?: boolean
          category_id: string
          created_at?: string
          description?: string | null
          drive_download_link?: string | null
          drive_file_id?: string | null
          drive_web_link?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          is_protected?: boolean
          kind: string
          parent_resource_id?: string | null
          sort_order?: number
          storage_provider?: string
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          allow_preview?: boolean
          category_id?: string
          created_at?: string
          description?: string | null
          drive_download_link?: string | null
          drive_file_id?: string | null
          drive_web_link?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          is_protected?: boolean
          kind?: string
          parent_resource_id?: string | null
          sort_order?: number
          storage_provider?: string
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "committee_resources_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "committee_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_resources_parent_resource_id_fkey"
            columns: ["parent_resource_id"]
            isOneToOne: false
            referencedRelation: "committee_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      committee_semesters: {
        Row: {
          closed_color: string
          closed_note: string | null
          closed_style: string
          created_at: string
          id: string
          is_closed: boolean
          name: string
          number: number
          sort_order: number
          updated_at: string
          year_id: string
        }
        Insert: {
          closed_color?: string
          closed_note?: string | null
          closed_style?: string
          created_at?: string
          id?: string
          is_closed?: boolean
          name: string
          number?: number
          sort_order?: number
          updated_at?: string
          year_id: string
        }
        Update: {
          closed_color?: string
          closed_note?: string | null
          closed_style?: string
          created_at?: string
          id?: string
          is_closed?: boolean
          name?: string
          number?: number
          sort_order?: number
          updated_at?: string
          year_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "committee_semesters_year_id_fkey"
            columns: ["year_id"]
            isOneToOne: false
            referencedRelation: "committee_years"
            referencedColumns: ["id"]
          },
        ]
      }
      committee_subject_courses: {
        Row: {
          course_id: string
          created_at: string
          id: string
          note: string | null
          offer_label: string | null
          original_price: number | null
          promo_price: number | null
          sort_order: number
          subject_id: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          note?: string | null
          offer_label?: string | null
          original_price?: number | null
          promo_price?: number | null
          sort_order?: number
          subject_id: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          note?: string | null
          offer_label?: string | null
          original_price?: number | null
          promo_price?: number | null
          sort_order?: number
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "committee_subject_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_subject_courses_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "committee_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      committee_subjects: {
        Row: {
          closed_color: string
          closed_note: string | null
          closed_style: string
          color_key: string
          created_at: string
          icon_key: string
          id: string
          image_url: string | null
          is_closed: boolean
          module_id: string | null
          name: string
          semester_id: string | null
          sort_order: number
          tag_color: string
          tag_label: string | null
          updated_at: string
          year_id: string
        }
        Insert: {
          closed_color?: string
          closed_note?: string | null
          closed_style?: string
          color_key?: string
          created_at?: string
          icon_key?: string
          id?: string
          image_url?: string | null
          is_closed?: boolean
          module_id?: string | null
          name: string
          semester_id?: string | null
          sort_order?: number
          tag_color?: string
          tag_label?: string | null
          updated_at?: string
          year_id: string
        }
        Update: {
          closed_color?: string
          closed_note?: string | null
          closed_style?: string
          color_key?: string
          created_at?: string
          icon_key?: string
          id?: string
          image_url?: string | null
          is_closed?: boolean
          module_id?: string | null
          name?: string
          semester_id?: string | null
          sort_order?: number
          tag_color?: string
          tag_label?: string | null
          updated_at?: string
          year_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "committee_subjects_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "committee_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_subjects_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "committee_semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_subjects_year_id_fkey"
            columns: ["year_id"]
            isOneToOne: false
            referencedRelation: "committee_years"
            referencedColumns: ["id"]
          },
        ]
      }
      committee_years: {
        Row: {
          closed_color: string
          closed_note: string | null
          closed_style: string
          color_key: string
          created_at: string
          display_name: string
          icon_key: string
          id: string
          is_closed: boolean
          shape_key: string
          sort_order: number
          university_id: string
          updated_at: string
          year_number: number
        }
        Insert: {
          closed_color?: string
          closed_note?: string | null
          closed_style?: string
          color_key?: string
          created_at?: string
          display_name: string
          icon_key?: string
          id?: string
          is_closed?: boolean
          shape_key?: string
          sort_order?: number
          university_id: string
          updated_at?: string
          year_number: number
        }
        Update: {
          closed_color?: string
          closed_note?: string | null
          closed_style?: string
          color_key?: string
          created_at?: string
          display_name?: string
          icon_key?: string
          id?: string
          is_closed?: boolean
          shape_key?: string
          sort_order?: number
          university_id?: string
          updated_at?: string
          year_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "committee_years_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      content_consents: {
        Row: {
          accepted_at: string
          ip: string | null
          scope: string
          ua: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          ip?: string | null
          scope?: string
          ua?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          ip?: string | null
          scope?: string
          ua?: string | null
          user_id?: string
        }
        Relationships: []
      }
      content_events: {
        Row: {
          context: string | null
          created_at: string
          id: string
          ip: string | null
          kind: string
          meta: Json
          ua: string | null
          user_id: string
        }
        Insert: {
          context?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          kind: string
          meta?: Json
          ua?: string | null
          user_id: string
        }
        Update: {
          context?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          kind?: string
          meta?: Json
          ua?: string | null
          user_id?: string
        }
        Relationships: []
      }
      coupon_courses: {
        Row: {
          coupon_id: string
          course_id: string
        }
        Insert: {
          coupon_id: string
          course_id: string
        }
        Update: {
          coupon_id?: string
          course_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_courses_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          amount_after: number | null
          amount_before: number | null
          coupon_id: string
          course_id: string | null
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          amount_after?: number | null
          amount_before?: number | null
          coupon_id: string
          course_id?: string | null
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          amount_after?: number | null
          amount_before?: number | null
          coupon_id?: string
          course_id?: string | null
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          discount_type: Database["public"]["Enums"]["coupon_discount_type"]
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          starts_at: string | null
          updated_at: string
          used_count: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          discount_type?: Database["public"]["Enums"]["coupon_discount_type"]
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          starts_at?: string | null
          updated_at?: string
          used_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          discount_type?: Database["public"]["Enums"]["coupon_discount_type"]
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          starts_at?: string | null
          updated_at?: string
          used_count?: number
        }
        Relationships: []
      }
      course_options: {
        Row: {
          created_at: string
          id: string
          kind: string
          label: string
          sort_order: number
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          label: string
          sort_order?: number
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          label?: string
          sort_order?: number
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      courses: {
        Row: {
          admin_only: boolean
          badge: string | null
          badge_color: string | null
          badge_expires_at: string | null
          category: string
          compare_at_price: number | null
          created_at: string
          created_by: string | null
          currency: string
          discount_active: boolean
          discount_ends_at: string | null
          exam_type: string
          id: string
          image_url: string | null
          intro_free: boolean
          intro_video_storage_path: string | null
          intro_video_url: string | null
          kind: string
          paddle_price_id: string | null
          price: number
          published: boolean
          questions_count_final: number
          questions_count_mid: number
          show_on_home: boolean
          subjects_count: number
          title: string
          university_id: string
          updated_at: string
          year: number
        }
        Insert: {
          admin_only?: boolean
          badge?: string | null
          badge_color?: string | null
          badge_expires_at?: string | null
          category?: string
          compare_at_price?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_active?: boolean
          discount_ends_at?: string | null
          exam_type?: string
          id?: string
          image_url?: string | null
          intro_free?: boolean
          intro_video_storage_path?: string | null
          intro_video_url?: string | null
          kind?: string
          paddle_price_id?: string | null
          price?: number
          published?: boolean
          questions_count_final?: number
          questions_count_mid?: number
          show_on_home?: boolean
          subjects_count?: number
          title: string
          university_id: string
          updated_at?: string
          year: number
        }
        Update: {
          admin_only?: boolean
          badge?: string | null
          badge_color?: string | null
          badge_expires_at?: string | null
          category?: string
          compare_at_price?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_active?: boolean
          discount_ends_at?: string | null
          exam_type?: string
          id?: string
          image_url?: string | null
          intro_free?: boolean
          intro_video_storage_path?: string | null
          intro_video_url?: string | null
          kind?: string
          paddle_price_id?: string | null
          price?: number
          published?: boolean
          questions_count_final?: number
          questions_count_mid?: number
          show_on_home?: boolean
          subjects_count?: number
          title?: string
          university_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "courses_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      device_security_settings: {
        Row: {
          created_at: string
          default_device_limit: number
          id: boolean
          support_url: string
          telegram_url: string
          unlock_code: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_device_limit?: number
          id?: boolean
          support_url?: string
          telegram_url?: string
          unlock_code: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_device_limit?: number
          id?: boolean
          support_url?: string
          telegram_url?: string
          unlock_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      device_unlock_attempts: {
        Row: {
          code_used: string | null
          created_at: string
          id: string
          ip: string | null
          success: boolean
          user_agent: string | null
          user_id: string
        }
        Insert: {
          code_used?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          success?: boolean
          user_agent?: string | null
          user_id: string
        }
        Update: {
          code_used?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      german_attempts: {
        Row: {
          created_at: string
          entry_id: string
          id: string
          is_correct: boolean
          item_id: string
          mode: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entry_id: string
          id?: string
          is_correct: boolean
          item_id: string
          mode: string
          user_id: string
        }
        Update: {
          created_at?: string
          entry_id?: string
          id?: string
          is_correct?: boolean
          item_id?: string
          mode?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "german_attempts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "german_items"
            referencedColumns: ["id"]
          },
        ]
      }
      german_courses: {
        Row: {
          content_type: string
          created_at: string
          id: string
          image_path: string | null
          position: number
          published: boolean
          title: string
          updated_at: string
        }
        Insert: {
          content_type?: string
          created_at?: string
          id?: string
          image_path?: string | null
          position?: number
          published?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          content_type?: string
          created_at?: string
          id?: string
          image_path?: string | null
          position?: number
          published?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      german_flags: {
        Row: {
          course_id: string | null
          created_at: string
          english: string
          entry_id: string
          german: string
          id: string
          kind: string
          user_id: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          english: string
          entry_id: string
          german: string
          id?: string
          kind: string
          user_id: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          english?: string
          entry_id?: string
          german?: string
          id?: string
          kind?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "german_flags_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "german_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      german_items: {
        Row: {
          created_at: string
          id: string
          is_free: boolean
          kind: string
          position: number
          subject_id: string
          title: string
          video_storage_path: string | null
          video_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_free?: boolean
          kind: string
          position?: number
          subject_id: string
          title: string
          video_storage_path?: string | null
          video_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_free?: boolean
          kind?: string
          position?: number
          subject_id?: string
          title?: string
          video_storage_path?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "german_items_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "german_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      german_quiz_options: {
        Row: {
          body: string
          id: string
          is_correct: boolean
          position: number
          question_id: string
        }
        Insert: {
          body: string
          id?: string
          is_correct?: boolean
          position?: number
          question_id: string
        }
        Update: {
          body?: string
          id?: string
          is_correct?: boolean
          position?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "german_quiz_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "german_quiz_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      german_quiz_questions: {
        Row: {
          created_at: string
          explanation: string | null
          id: string
          position: number
          prompt: string
          published: boolean
          quiz_id: string
        }
        Insert: {
          created_at?: string
          explanation?: string | null
          id?: string
          position?: number
          prompt: string
          published?: boolean
          quiz_id: string
        }
        Update: {
          created_at?: string
          explanation?: string | null
          id?: string
          position?: number
          prompt?: string
          published?: boolean
          quiz_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "german_quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "german_quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      german_quizzes: {
        Row: {
          id: string
          item_id: string
        }
        Insert: {
          id?: string
          item_id: string
        }
        Update: {
          id?: string
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "german_quizzes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "german_items"
            referencedColumns: ["id"]
          },
        ]
      }
      german_sentence_entries: {
        Row: {
          created_at: string
          english: string
          german: string
          id: string
          item_id: string
          notes: string | null
          position: number
        }
        Insert: {
          created_at?: string
          english: string
          german: string
          id?: string
          item_id: string
          notes?: string | null
          position?: number
        }
        Update: {
          created_at?: string
          english?: string
          german?: string
          id?: string
          item_id?: string
          notes?: string | null
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "german_sentence_entries_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "german_items"
            referencedColumns: ["id"]
          },
        ]
      }
      german_shadowing_sessions: {
        Row: {
          course_id: string
          created_at: string
          details: Json
          id: string
          kind: string
          score_avg: number
          subject_ids: string[]
          total_items: number
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          details?: Json
          id?: string
          kind: string
          score_avg?: number
          subject_ids?: string[]
          total_items?: number
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          details?: Json
          id?: string
          kind?: string
          score_avg?: number
          subject_ids?: string[]
          total_items?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "german_shadowing_sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "german_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      german_subjects: {
        Row: {
          content_type: string
          course_id: string
          created_at: string
          id: string
          parent_id: string | null
          position: number
          title: string
        }
        Insert: {
          content_type?: string
          course_id: string
          created_at?: string
          id?: string
          parent_id?: string | null
          position?: number
          title: string
        }
        Update: {
          content_type?: string
          course_id?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "german_subjects_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "german_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "german_subjects_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "german_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      german_voice_attempts: {
        Row: {
          created_at: string
          entry_id: string | null
          id: string
          item_id: string | null
          mode: string
          score: number | null
          subject_id: string | null
          target_text: string
          transcript: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          entry_id?: string | null
          id?: string
          item_id?: string | null
          mode?: string
          score?: number | null
          subject_id?: string | null
          target_text: string
          transcript?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          entry_id?: string | null
          id?: string
          item_id?: string | null
          mode?: string
          score?: number | null
          subject_id?: string | null
          target_text?: string
          transcript?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "german_voice_attempts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "german_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "german_voice_attempts_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "german_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      german_word_entries: {
        Row: {
          created_at: string
          english: string
          example: string | null
          german: string
          id: string
          item_id: string
          position: number
        }
        Insert: {
          created_at?: string
          english: string
          example?: string | null
          german: string
          id?: string
          item_id: string
          position?: number
        }
        Update: {
          created_at?: string
          english?: string
          example?: string | null
          german?: string
          id?: string
          item_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "german_word_entries_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "german_items"
            referencedColumns: ["id"]
          },
        ]
      }
      guides: {
        Row: {
          body_en: string
          body_hy: string
          body_ru: string
          course_id: string | null
          created_at: string
          id: string
          position: number
          published: boolean
          slug: string
          summary_en: string
          summary_hy: string
          summary_ru: string
          title_en: string
          title_hy: string
          title_ru: string
          updated_at: string
        }
        Insert: {
          body_en?: string
          body_hy?: string
          body_ru?: string
          course_id?: string | null
          created_at?: string
          id?: string
          position?: number
          published?: boolean
          slug: string
          summary_en?: string
          summary_hy?: string
          summary_ru?: string
          title_en?: string
          title_hy?: string
          title_ru?: string
          updated_at?: string
        }
        Update: {
          body_en?: string
          body_hy?: string
          body_ru?: string
          course_id?: string | null
          created_at?: string
          id?: string
          position?: number
          published?: boolean
          slug?: string
          summary_en?: string
          summary_hy?: string
          summary_ru?: string
          title_en?: string
          title_hy?: string
          title_ru?: string
          updated_at?: string
        }
        Relationships: []
      }
      jarvis_batch_german_ipad_chunks: {
        Row: {
          created_at: string
          error: string | null
          id: string
          image_index: number
          imported_count: number
          job_id: string
          page_number: number | null
          pairs_json: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          image_index: number
          imported_count?: number
          job_id: string
          page_number?: number | null
          pairs_json?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          image_index?: number
          imported_count?: number
          job_id?: string
          page_number?: number | null
          pairs_json?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jarvis_batch_german_ipad_chunks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jarvis_batch_german_ipad_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jarvis_batch_german_ipad_jobs: {
        Row: {
          batch_name: string | null
          batch_status: string | null
          course_id: string
          created_at: string
          error: string | null
          id: string
          imported_pairs: number
          kind: string
          pdf_name: string
          processed_images: number
          queue_order: number
          status: string
          subject_id: string
          total_images: number
          updated_at: string
          user_id: string
        }
        Insert: {
          batch_name?: string | null
          batch_status?: string | null
          course_id: string
          created_at?: string
          error?: string | null
          id?: string
          imported_pairs?: number
          kind?: string
          pdf_name: string
          processed_images?: number
          queue_order?: number
          status?: string
          subject_id: string
          total_images?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          batch_name?: string | null
          batch_status?: string | null
          course_id?: string
          created_at?: string
          error?: string | null
          id?: string
          imported_pairs?: number
          kind?: string
          pdf_name?: string
          processed_images?: number
          queue_order?: number
          status?: string
          subject_id?: string
          total_images?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      jarvis_batch_jobs: {
        Row: {
          auto_sort: boolean
          batch_id: string | null
          classifier_batch_id: string | null
          classifier_status: string | null
          created_at: string
          id: string
          last_error: string | null
          mode: string
          pdf_name: string
          pending_review: Json | null
          result_summary: Json | null
          slice_map: Json
          status: string
          subject_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_sort?: boolean
          batch_id?: string | null
          classifier_batch_id?: string | null
          classifier_status?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          mode?: string
          pdf_name: string
          pending_review?: Json | null
          result_summary?: Json | null
          slice_map?: Json
          status?: string
          subject_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_sort?: boolean
          batch_id?: string | null
          classifier_batch_id?: string | null
          classifier_status?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          mode?: string
          pdf_name?: string
          pending_review?: Json | null
          result_summary?: Json | null
          slice_map?: Json
          status?: string
          subject_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      jarvis_batch_v2_chunks: {
        Row: {
          batch_id: string | null
          chunk_index: number
          chunk_text: string | null
          created_at: string
          error: string | null
          id: string
          imported_count: number
          job_id: string
          page_from: number
          page_to: number
          question_blocks: Json | null
          results: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          batch_id?: string | null
          chunk_index: number
          chunk_text?: string | null
          created_at?: string
          error?: string | null
          id?: string
          imported_count?: number
          job_id: string
          page_from: number
          page_to: number
          question_blocks?: Json | null
          results?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          batch_id?: string | null
          chunk_index?: number
          chunk_text?: string | null
          created_at?: string
          error?: string | null
          id?: string
          imported_count?: number
          job_id?: string
          page_from?: number
          page_to?: number
          question_blocks?: Json | null
          results?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jarvis_batch_v2_chunks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jarvis_batch_v2_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jarvis_batch_v2_ipad_chunks: {
        Row: {
          batch_id: string | null
          chunk_index: number
          chunk_text: string | null
          created_at: string
          error: string | null
          id: string
          imported_count: number
          job_id: string
          page_from: number
          page_to: number
          question_blocks: Json | null
          results: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          batch_id?: string | null
          chunk_index: number
          chunk_text?: string | null
          created_at?: string
          error?: string | null
          id?: string
          imported_count?: number
          job_id: string
          page_from: number
          page_to: number
          question_blocks?: Json | null
          results?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          batch_id?: string | null
          chunk_index?: number
          chunk_text?: string | null
          created_at?: string
          error?: string | null
          id?: string
          imported_count?: number
          job_id?: string
          page_from?: number
          page_to?: number
          question_blocks?: Json | null
          results?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jarvis_batch_v2_ipad_chunks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jarvis_batch_v2_ipad_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jarvis_batch_v2_ipad_jobs: {
        Row: {
          course_id: string
          created_at: string
          group_id: string
          id: string
          pdf_name: string
          queue_order: number
          reference_book: string | null
          status: string
          subject_candidates: Json
          subject_id: string | null
          total_pages: number
          updated_at: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          group_id: string
          id?: string
          pdf_name: string
          queue_order?: number
          reference_book?: string | null
          status?: string
          subject_candidates?: Json
          subject_id?: string | null
          total_pages: number
          updated_at?: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          group_id?: string
          id?: string
          pdf_name?: string
          queue_order?: number
          reference_book?: string | null
          status?: string
          subject_candidates?: Json
          subject_id?: string | null
          total_pages?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      jarvis_batch_v2_jobs: {
        Row: {
          course_id: string
          created_at: string
          group_id: string
          id: string
          pdf_name: string
          status: string
          subject_candidates: Json
          subject_id: string | null
          total_pages: number
          updated_at: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          group_id: string
          id?: string
          pdf_name: string
          status?: string
          subject_candidates?: Json
          subject_id?: string | null
          total_pages: number
          updated_at?: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          group_id?: string
          id?: string
          pdf_name?: string
          status?: string
          subject_candidates?: Json
          subject_id?: string | null
          total_pages?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lecture_items: {
        Row: {
          created_at: string
          duration_seconds: number | null
          id: string
          is_free: boolean
          kind: string
          position: number
          subject_id: string
          title: string
          updated_at: string
          video_storage_path: string | null
          video_url: string | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_free?: boolean
          kind: string
          position?: number
          subject_id: string
          title: string
          updated_at?: string
          video_storage_path?: string | null
          video_url?: string | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_free?: boolean
          kind?: string
          position?: number
          subject_id?: string
          title?: string
          updated_at?: string
          video_storage_path?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lecture_items_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "lecture_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      lecture_quiz_attempts: {
        Row: {
          answers: Json | null
          finished_at: string
          id: string
          quiz_id: string
          score: number
          total: number
          user_id: string
        }
        Insert: {
          answers?: Json | null
          finished_at?: string
          id?: string
          quiz_id: string
          score: number
          total: number
          user_id: string
        }
        Update: {
          answers?: Json | null
          finished_at?: string
          id?: string
          quiz_id?: string
          score?: number
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lecture_quiz_attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "lecture_quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      lecture_quiz_options: {
        Row: {
          body: string
          id: string
          is_correct: boolean
          position: number
          question_id: string
        }
        Insert: {
          body: string
          id?: string
          is_correct?: boolean
          position?: number
          question_id: string
        }
        Update: {
          body?: string
          id?: string
          is_correct?: boolean
          position?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lecture_quiz_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "lecture_quiz_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      lecture_quiz_questions: {
        Row: {
          created_at: string
          explanation: string | null
          id: string
          position: number
          prompt: string
          published: boolean
          quiz_id: string
        }
        Insert: {
          created_at?: string
          explanation?: string | null
          id?: string
          position?: number
          prompt: string
          published?: boolean
          quiz_id: string
        }
        Update: {
          created_at?: string
          explanation?: string | null
          id?: string
          position?: number
          prompt?: string
          published?: boolean
          quiz_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lecture_quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "lecture_quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      lecture_quizzes: {
        Row: {
          created_at: string
          id: string
          item_id: string
          pass_score: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          pass_score?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          pass_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lecture_quizzes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "lecture_items"
            referencedColumns: ["id"]
          },
        ]
      }
      lecture_subjects: {
        Row: {
          course_id: string
          created_at: string
          id: string
          position: number
          title: string
          university_id: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          position?: number
          title: string
          university_id: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          position?: number
          title?: string
          university_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lecture_subjects_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lecture_subjects_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_categories: {
        Row: {
          created_at: string
          id: string
          kind: string
          sort_order: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          sort_order?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          sort_order?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mentor_entries: {
        Row: {
          body: string
          category_id: string
          created_at: string
          id: string
          sort_order: number
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          category_id: string
          created_at?: string
          id?: string
          sort_order?: number
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          category_id?: string
          created_at?: string
          id?: string
          sort_order?: number
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentor_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "mentor_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_journal: {
        Row: {
          created_at: string
          did_well: string | null
          entry_date: string
          fell_short: string | null
          id: string
          intention: string | null
          tomorrow: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          did_well?: string | null
          entry_date?: string
          fell_short?: string | null
          id?: string
          intention?: string | null
          tomorrow?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          did_well?: string | null
          entry_date?: string
          fell_short?: string | null
          id?: string
          intention?: string | null
          tomorrow?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mentor_task_completions: {
        Row: {
          completed_on: string
          created_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          completed_on?: string
          created_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          completed_on?: string
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentor_task_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "mentor_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_tasks: {
        Row: {
          created_at: string
          id: string
          is_daily: boolean
          kind: string
          sort_order: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_daily?: boolean
          kind: string
          sort_order?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_daily?: boolean
          kind?: string
          sort_order?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mentor_treasures: {
        Row: {
          body: string
          created_at: string
          id: string
          is_pinned_today: boolean
          kind: string
          pinned_on: string | null
          sort_order: number
          source: string | null
          tags: string[]
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_pinned_today?: boolean
          kind: string
          pinned_on?: string | null
          sort_order?: number
          source?: string | null
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_pinned_today?: boolean
          kind?: string
          pinned_on?: string | null
          sort_order?: number
          source?: string | null
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          course_id: string
          created_at: string
          id: string
          question_id: string | null
          snippet_html: string
          snippet_text: string
          subject_id: string | null
          updated_at: string
          user_id: string
          user_note: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          question_id?: string | null
          snippet_html: string
          snippet_text?: string
          subject_id?: string | null
          updated_at?: string
          user_id: string
          user_note?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          question_id?: string | null
          snippet_html?: string
          snippet_text?: string
          subject_id?: string | null
          updated_at?: string
          user_id?: string
          user_note?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      package_courses: {
        Row: {
          course_id: string
          created_at: string
          id: string
          note: string | null
          package_id: string
          sort_order: number
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          note?: string | null
          package_id: string
          sort_order?: number
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          note?: string | null
          package_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "package_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_courses_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_purchases: {
        Row: {
          amount_cents: number | null
          buyer_id: string
          created_at: string
          currency: string | null
          environment: string
          id: string
          member_user_ids: string[]
          package_id: string
          paddle_event_id: string | null
          paddle_transaction_id: string | null
        }
        Insert: {
          amount_cents?: number | null
          buyer_id: string
          created_at?: string
          currency?: string | null
          environment?: string
          id?: string
          member_user_ids?: string[]
          package_id: string
          paddle_event_id?: string | null
          paddle_transaction_id?: string | null
        }
        Update: {
          amount_cents?: number | null
          buyer_id?: string
          created_at?: string
          currency?: string | null
          environment?: string
          id?: string
          member_user_ids?: string[]
          package_id?: string
          paddle_event_id?: string | null
          paddle_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "package_purchases_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          group_size: number
          id: string
          name: string
          package_type: Database["public"]["Enums"]["package_type"]
          paddle_price_id: string | null
          price: number
          published: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          group_size?: number
          id?: string
          name: string
          package_type?: Database["public"]["Enums"]["package_type"]
          paddle_price_id?: string | null
          price?: number
          published?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          group_size?: number
          id?: string
          name?: string
          package_type?: Database["public"]["Enums"]["package_type"]
          paddle_price_id?: string | null
          price?: number
          published?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      patch_prox_items: {
        Row: {
          correct_letter: string | null
          created_at: string
          error: string | null
          explanation: string | null
          id: string
          image_path: string
          item_index: number
          job_id: string
          letters: Json
          page_number: number
          status: string
          stem: string | null
          subject_index: number | null
        }
        Insert: {
          correct_letter?: string | null
          created_at?: string
          error?: string | null
          explanation?: string | null
          id?: string
          image_path: string
          item_index: number
          job_id: string
          letters?: Json
          page_number: number
          status?: string
          stem?: string | null
          subject_index?: number | null
        }
        Update: {
          correct_letter?: string | null
          created_at?: string
          error?: string | null
          explanation?: string | null
          id?: string
          image_path?: string
          item_index?: number
          job_id?: string
          letters?: Json
          page_number?: number
          status?: string
          stem?: string | null
          subject_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "patch_prox_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "patch_prox_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      patch_prox_jobs: {
        Row: {
          course_id: string | null
          created_at: string
          cut_batch_ids: Json
          error: string | null
          group_id: string | null
          id: string
          imported_count: number
          pdf_name: string
          phase: string
          reference_book: string | null
          solve_batch_ids: Json
          subject_candidates: Json
          subject_id: string | null
          total_pages: number
          updated_at: string
          user_id: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          cut_batch_ids?: Json
          error?: string | null
          group_id?: string | null
          id?: string
          imported_count?: number
          pdf_name: string
          phase?: string
          reference_book?: string | null
          solve_batch_ids?: Json
          subject_candidates?: Json
          subject_id?: string | null
          total_pages?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          cut_batch_ids?: Json
          error?: string | null
          group_id?: string | null
          id?: string
          imported_count?: number
          pdf_name?: string
          phase?: string
          reference_book?: string | null
          solve_batch_ids?: Json
          subject_candidates?: Json
          subject_id?: string | null
          total_pages?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      patch_prox_pages: {
        Row: {
          created_at: string
          crops: Json
          error: string | null
          id: string
          job_id: string
          page_image_path: string | null
          page_number: number
          regions: Json
          status: string
        }
        Insert: {
          created_at?: string
          crops?: Json
          error?: string | null
          id?: string
          job_id: string
          page_image_path?: string | null
          page_number: number
          regions?: Json
          status?: string
        }
        Update: {
          created_at?: string
          crops?: Json
          error?: string | null
          id?: string
          job_id?: string
          page_image_path?: string | null
          page_number?: number
          regions?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "patch_prox_pages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "patch_prox_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          amount_cents: number | null
          course_id: string | null
          created_at: string
          currency: string | null
          environment: string
          id: string
          paddle_event_id: string | null
          paddle_transaction_id: string | null
          raw: Json | null
          status: string
          user_id: string | null
        }
        Insert: {
          amount_cents?: number | null
          course_id?: string | null
          created_at?: string
          currency?: string | null
          environment?: string
          id?: string
          paddle_event_id?: string | null
          paddle_transaction_id?: string | null
          raw?: Json | null
          status: string
          user_id?: string | null
        }
        Update: {
          amount_cents?: number | null
          course_id?: string | null
          created_at?: string
          currency?: string | null
          environment?: string
          id?: string
          paddle_event_id?: string | null
          paddle_transaction_id?: string | null
          raw?: Json | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          device_limit: number | null
          email: string
          full_name: string
          id: string
          lock_kind: string | null
          lock_message: string | null
          lock_reason: string | null
          lock_until: string | null
          locked_at: string | null
          phone: string | null
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          device_limit?: number | null
          email: string
          full_name: string
          id: string
          lock_kind?: string | null
          lock_message?: string | null
          lock_reason?: string | null
          lock_until?: string | null
          locked_at?: string | null
          phone?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          device_limit?: number | null
          email?: string
          full_name?: string
          id?: string
          lock_kind?: string | null
          lock_message?: string | null
          lock_reason?: string | null
          lock_until?: string | null
          locked_at?: string | null
          phone?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      question_attempts: {
        Row: {
          attempted_at: string
          id: string
          is_correct: boolean
          mode: string
          question_id: string
          selected_label: string | null
          user_id: string
        }
        Insert: {
          attempted_at?: string
          id?: string
          is_correct?: boolean
          mode: string
          question_id: string
          selected_label?: string | null
          user_id: string
        }
        Update: {
          attempted_at?: string
          id?: string
          is_correct?: boolean
          mode?: string
          question_id?: string
          selected_label?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_attempts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_flags: {
        Row: {
          created_at: string
          question_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          question_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_flags_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_gen_batches: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          items: Json
          mode: string
          notes: string | null
          subject_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          mode?: string
          notes?: string | null
          subject_id?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          mode?: string
          notes?: string | null
          subject_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      question_options: {
        Row: {
          created_at: string
          id: string
          is_correct: boolean
          label: string
          question_id: string
          sort_order: number
          text: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_correct?: boolean
          label: string
          question_id: string
          sort_order?: number
          text?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_correct?: boolean
          label?: string
          question_id?: string
          sort_order?: number
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          created_at: string
          explanation: string | null
          id: string
          image_url: string | null
          sort_order: number
          stem: string
          stem_hash: string | null
          subject_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          explanation?: string | null
          id?: string
          image_url?: string | null
          sort_order?: number
          stem: string
          stem_hash?: string | null
          subject_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          explanation?: string | null
          id?: string
          image_url?: string | null
          sort_order?: number
          stem?: string
          stem_hash?: string | null
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      site_announcements: {
        Row: {
          accent: string
          active: boolean
          body: string
          created_at: string
          ends_at: string | null
          href: string | null
          href_label: string | null
          id: string
          pinned: boolean
          sort: number
          starts_at: string | null
          style: string
          title: string
          updated_at: string
          urgent: boolean
        }
        Insert: {
          accent?: string
          active?: boolean
          body?: string
          created_at?: string
          ends_at?: string | null
          href?: string | null
          href_label?: string | null
          id?: string
          pinned?: boolean
          sort?: number
          starts_at?: string | null
          style?: string
          title?: string
          updated_at?: string
          urgent?: boolean
        }
        Update: {
          accent?: string
          active?: boolean
          body?: string
          created_at?: string
          ends_at?: string | null
          href?: string | null
          href_label?: string | null
          id?: string
          pinned?: boolean
          sort?: number
          starts_at?: string | null
          style?: string
          title?: string
          updated_at?: string
          urgent?: boolean
        }
        Relationships: []
      }
      site_blocks: {
        Row: {
          content: Json
          created_at: string
          id: string
          kind: string
          section_id: string
          sort_order: number
          updated_at: string
          visible: boolean
        }
        Insert: {
          content?: Json
          created_at?: string
          id?: string
          kind: string
          section_id: string
          sort_order?: number
          updated_at?: string
          visible?: boolean
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          kind?: string
          section_id?: string
          sort_order?: number
          updated_at?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "site_blocks_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "site_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      site_content: {
        Row: {
          created_at: string
          default_ar: string
          default_en: string
          group_key: string
          group_label: string
          key: string
          kind: string
          label: string
          sort_order: number
          updated_at: string
          value_ar: string
          value_en: string
        }
        Insert: {
          created_at?: string
          default_ar?: string
          default_en?: string
          group_key: string
          group_label: string
          key: string
          kind?: string
          label: string
          sort_order?: number
          updated_at?: string
          value_ar?: string
          value_en?: string
        }
        Update: {
          created_at?: string
          default_ar?: string
          default_en?: string
          group_key?: string
          group_label?: string
          key?: string
          kind?: string
          label?: string
          sort_order?: number
          updated_at?: string
          value_ar?: string
          value_en?: string
        }
        Relationships: []
      }
      site_nav_items: {
        Row: {
          coming_soon: boolean
          created_at: string
          id: string
          label_ar: string
          label_en: string
          placement: string
          sort_order: number
          style: string
          target_kind: string
          target_value: string
          updated_at: string
          visibility: string
          visible: boolean
        }
        Insert: {
          coming_soon?: boolean
          created_at?: string
          id?: string
          label_ar?: string
          label_en?: string
          placement?: string
          sort_order?: number
          style?: string
          target_kind?: string
          target_value?: string
          updated_at?: string
          visibility?: string
          visible?: boolean
        }
        Update: {
          coming_soon?: boolean
          created_at?: string
          id?: string
          label_ar?: string
          label_en?: string
          placement?: string
          sort_order?: number
          style?: string
          target_kind?: string
          target_value?: string
          updated_at?: string
          visibility?: string
          visible?: boolean
        }
        Relationships: []
      }
      site_pages: {
        Row: {
          created_at: string
          id: string
          is_system: boolean
          published: boolean
          seo_description_ar: string
          seo_description_en: string
          slug: string
          sort_order: number
          title_ar: string
          title_en: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_system?: boolean
          published?: boolean
          seo_description_ar?: string
          seo_description_en?: string
          slug: string
          sort_order?: number
          title_ar?: string
          title_en?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_system?: boolean
          published?: boolean
          seo_description_ar?: string
          seo_description_en?: string
          slug?: string
          sort_order?: number
          title_ar?: string
          title_en?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_secrets: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      site_sections: {
        Row: {
          builtin_key: string | null
          created_at: string
          description_ar: string
          description_en: string
          id: string
          layout: string
          page_id: string
          parent_section_id: string | null
          sort_order: number
          title_ar: string
          title_en: string
          updated_at: string
          visible: boolean
        }
        Insert: {
          builtin_key?: string | null
          created_at?: string
          description_ar?: string
          description_en?: string
          id?: string
          layout?: string
          page_id: string
          parent_section_id?: string | null
          sort_order?: number
          title_ar?: string
          title_en?: string
          updated_at?: string
          visible?: boolean
        }
        Update: {
          builtin_key?: string | null
          created_at?: string
          description_ar?: string
          description_en?: string
          id?: string
          layout?: string
          page_id?: string
          parent_section_id?: string | null
          sort_order?: number
          title_ar?: string
          title_en?: string
          updated_at?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "site_sections_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "site_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_sections_parent_section_id_fkey"
            columns: ["parent_section_id"]
            isOneToOne: false
            referencedRelation: "site_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          brand_style: string
          committee_default_storage: string
          header_style: string
          id: boolean
          logo_url: string | null
          privacy_ar: string | null
          privacy_en: string | null
          protect_auto_lock_threshold: number
          protect_block_copy: boolean
          protect_block_print: boolean
          protect_blur_on_blur: boolean
          protect_consent_required: boolean
          protect_devtools_guard: boolean
          protect_enabled: boolean
          protect_terms_ar: string | null
          protect_terms_en: string | null
          protect_watermark_opacity: number
          refund_ar: string | null
          refund_en: string | null
          show_signature: boolean
          site_name: string
          study_hub_subtitle: string | null
          study_hub_subtitle_ar: string | null
          study_hub_title: string | null
          study_hub_title_ar: string | null
          study_plan_path: string | null
          study_plan_subtitle: string | null
          study_plan_title: string | null
          tagline: string
          terms_ar: string | null
          terms_en: string | null
          theme: string
          updated_at: string
        }
        Insert: {
          brand_style?: string
          committee_default_storage?: string
          header_style?: string
          id?: boolean
          logo_url?: string | null
          privacy_ar?: string | null
          privacy_en?: string | null
          protect_auto_lock_threshold?: number
          protect_block_copy?: boolean
          protect_block_print?: boolean
          protect_blur_on_blur?: boolean
          protect_consent_required?: boolean
          protect_devtools_guard?: boolean
          protect_enabled?: boolean
          protect_terms_ar?: string | null
          protect_terms_en?: string | null
          protect_watermark_opacity?: number
          refund_ar?: string | null
          refund_en?: string | null
          show_signature?: boolean
          site_name?: string
          study_hub_subtitle?: string | null
          study_hub_subtitle_ar?: string | null
          study_hub_title?: string | null
          study_hub_title_ar?: string | null
          study_plan_path?: string | null
          study_plan_subtitle?: string | null
          study_plan_title?: string | null
          tagline?: string
          terms_ar?: string | null
          terms_en?: string | null
          theme?: string
          updated_at?: string
        }
        Update: {
          brand_style?: string
          committee_default_storage?: string
          header_style?: string
          id?: boolean
          logo_url?: string | null
          privacy_ar?: string | null
          privacy_en?: string | null
          protect_auto_lock_threshold?: number
          protect_block_copy?: boolean
          protect_block_print?: boolean
          protect_blur_on_blur?: boolean
          protect_consent_required?: boolean
          protect_devtools_guard?: boolean
          protect_enabled?: boolean
          protect_terms_ar?: string | null
          protect_terms_en?: string | null
          protect_watermark_opacity?: number
          refund_ar?: string | null
          refund_en?: string | null
          show_signature?: boolean
          site_name?: string
          study_hub_subtitle?: string | null
          study_hub_subtitle_ar?: string | null
          study_hub_title?: string | null
          study_hub_title_ar?: string | null
          study_plan_path?: string | null
          study_plan_subtitle?: string | null
          study_plan_title?: string | null
          tagline?: string
          terms_ar?: string | null
          terms_en?: string | null
          theme?: string
          updated_at?: string
        }
        Relationships: []
      }
      sonic_chunks: {
        Row: {
          chunk_index: number
          chunk_text: string | null
          created_at: string
          error: string | null
          id: string
          imported_count: number
          page_from: number
          page_to: number
          pdf_id: string
          question_blocks: Json | null
          results: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          chunk_index: number
          chunk_text?: string | null
          created_at?: string
          error?: string | null
          id?: string
          imported_count?: number
          page_from: number
          page_to: number
          pdf_id: string
          question_blocks?: Json | null
          results?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          chunk_index?: number
          chunk_text?: string | null
          created_at?: string
          error?: string | null
          id?: string
          imported_count?: number
          page_from?: number
          page_to?: number
          pdf_id?: string
          question_blocks?: Json | null
          results?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sonic_chunks_pdf_id_fkey"
            columns: ["pdf_id"]
            isOneToOne: false
            referencedRelation: "sonic_pdfs"
            referencedColumns: ["id"]
          },
        ]
      }
      sonic_jobs: {
        Row: {
          auto_retry: boolean
          created_at: string
          hint: string | null
          id: string
          model: string
          provider: string
          skip_duplicates: boolean
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_retry?: boolean
          created_at?: string
          hint?: string | null
          id?: string
          model?: string
          provider?: string
          skip_duplicates?: boolean
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_retry?: boolean
          created_at?: string
          hint?: string | null
          id?: string
          model?: string
          provider?: string
          skip_duplicates?: boolean
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sonic_pdfs: {
        Row: {
          course_id: string
          created_at: string
          error: string | null
          file_name: string
          group_id: string
          id: string
          imported_count: number
          job_id: string
          sort_order: number
          status: string
          subject_candidates: Json
          subject_id: string | null
          total_pages: number
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          error?: string | null
          file_name: string
          group_id: string
          id?: string
          imported_count?: number
          job_id: string
          sort_order?: number
          status?: string
          subject_candidates?: Json
          subject_id?: string | null
          total_pages?: number
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          error?: string | null
          file_name?: string
          group_id?: string
          id?: string
          imported_count?: number
          job_id?: string
          sort_order?: number
          status?: string
          subject_candidates?: Json
          subject_id?: string | null
          total_pages?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sonic_pdfs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "sonic_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      study_exams: {
        Row: {
          created_at: string
          id: string
          location: string | null
          notes: string | null
          starts_at: string
          subject: string | null
          subject_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string | null
          notes?: string | null
          starts_at: string
          subject?: string | null
          subject_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location?: string | null
          notes?: string | null
          starts_at?: string
          subject?: string | null
          subject_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_exams_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "study_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      study_focus_sessions: {
        Row: {
          created_at: string
          ended_at: string
          id: string
          minutes: number
          mode: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string
          id?: string
          minutes?: number
          mode?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string
          id?: string
          minutes?: number
          mode?: string
          user_id?: string
        }
        Relationships: []
      }
      study_hub_tiles: {
        Row: {
          created_at: string
          description: string | null
          description_ar: string | null
          external: boolean
          hidden: boolean
          href: string
          icon: string
          id: string
          label: string
          label_ar: string | null
          sort: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          description_ar?: string | null
          external?: boolean
          hidden?: boolean
          href?: string
          icon?: string
          id?: string
          label: string
          label_ar?: string | null
          sort?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          description_ar?: string | null
          external?: boolean
          hidden?: boolean
          href?: string
          icon?: string
          id?: string
          label?: string
          label_ar?: string | null
          sort?: number
          updated_at?: string
        }
        Relationships: []
      }
      study_plan_stages: {
        Row: {
          created_at: string
          has_finals: boolean
          has_semesters: boolean
          id: string
          slug: string
          sort_order: number
          subtitle_ar: string | null
          subtitle_en: string | null
          title_ar: string | null
          title_en: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          has_finals?: boolean
          has_semesters?: boolean
          id?: string
          slug: string
          sort_order?: number
          subtitle_ar?: string | null
          subtitle_en?: string | null
          title_ar?: string | null
          title_en: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          has_finals?: boolean
          has_semesters?: boolean
          id?: string
          slug?: string
          sort_order?: number
          subtitle_ar?: string | null
          subtitle_en?: string | null
          title_ar?: string | null
          title_en?: string
          updated_at?: string
        }
        Relationships: []
      }
      study_plan_subjects: {
        Row: {
          assessment: string
          created_at: string
          id: string
          is_final: boolean
          name: string
          note: string | null
          semester: number | null
          sort_order: number
          stage_id: string
          updated_at: string
        }
        Insert: {
          assessment?: string
          created_at?: string
          id?: string
          is_final?: boolean
          name: string
          note?: string | null
          semester?: number | null
          sort_order?: number
          stage_id: string
          updated_at?: string
        }
        Update: {
          assessment?: string
          created_at?: string
          id?: string
          is_final?: boolean
          name?: string
          note?: string | null
          semester?: number | null
          sort_order?: number
          stage_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_plan_subjects_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "study_plan_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      study_subjects: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          sort: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          sort?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          sort?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      study_topics: {
        Row: {
          created_at: string
          due_date: string | null
          id: string
          note: string | null
          sort: number
          status: string
          subject_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          due_date?: string | null
          id?: string
          note?: string | null
          sort?: number
          status?: string
          subject_id: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          due_date?: string | null
          id?: string
          note?: string | null
          sort?: number
          status?: string
          subject_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_topics_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "study_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_groups: {
        Row: {
          course_id: string
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_groups_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          access_level: Database["public"]["Enums"]["subject_access"]
          created_at: string
          group_id: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["subject_access"]
          created_at?: string
          group_id: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          access_level?: Database["public"]["Enums"]["subject_access"]
          created_at?: string
          group_id?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "subject_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      summaries: {
        Row: {
          author_name: string | null
          content: Json
          cover_scheme: string
          created_at: string
          id: string
          is_public: boolean
          length_preset: string
          share_slug: string | null
          source_ref: Json
          source_type: string
          subtitle: string | null
          title: string
          tone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          author_name?: string | null
          content?: Json
          cover_scheme?: string
          created_at?: string
          id?: string
          is_public?: boolean
          length_preset?: string
          share_slug?: string | null
          source_ref?: Json
          source_type: string
          subtitle?: string | null
          title: string
          tone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          author_name?: string | null
          content?: Json
          cover_scheme?: string
          created_at?: string
          id?: string
          is_public?: boolean
          length_preset?: string
          share_slug?: string | null
          source_ref?: Json
          source_type?: string
          subtitle?: string | null
          title?: string
          tone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      support_channels: {
        Row: {
          created_at: string
          href: string
          icon: string
          id: string
          kind: string
          label_ar: string
          label_en: string
          sort_order: number
          updated_at: string
          value: string
          visible: boolean
        }
        Insert: {
          created_at?: string
          href?: string
          icon?: string
          id?: string
          kind?: string
          label_ar?: string
          label_en?: string
          sort_order?: number
          updated_at?: string
          value?: string
          visible?: boolean
        }
        Update: {
          created_at?: string
          href?: string
          icon?: string
          id?: string
          kind?: string
          label_ar?: string
          label_en?: string
          sort_order?: number
          updated_at?: string
          value?: string
          visible?: boolean
        }
        Relationships: []
      }
      support_requests: {
        Row: {
          admin_notes: string
          category: string
          created_at: string
          email: string
          id: string
          message: string
          name: string
          status: string
          subject: string
          ticket_no: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_notes?: string
          category?: string
          created_at?: string
          email?: string
          id?: string
          message: string
          name?: string
          status?: string
          subject?: string
          ticket_no?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_notes?: string
          category?: string
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          status?: string
          subject?: string
          ticket_no?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      support_settings: {
        Row: {
          categories: Json
          channels_enabled: boolean
          created_at: string
          form_enabled: boolean
          id: boolean
          intro_text_ar: string
          intro_text_en: string
          intro_title_ar: string
          intro_title_en: string
          notify_email: string
          notify_enabled: boolean
          page_enabled: boolean
          response_note_ar: string
          response_note_en: string
          updated_at: string
        }
        Insert: {
          categories?: Json
          channels_enabled?: boolean
          created_at?: string
          form_enabled?: boolean
          id?: boolean
          intro_text_ar?: string
          intro_text_en?: string
          intro_title_ar?: string
          intro_title_en?: string
          notify_email?: string
          notify_enabled?: boolean
          page_enabled?: boolean
          response_note_ar?: string
          response_note_en?: string
          updated_at?: string
        }
        Update: {
          categories?: Json
          channels_enabled?: boolean
          created_at?: string
          form_enabled?: boolean
          id?: boolean
          intro_text_ar?: string
          intro_text_en?: string
          intro_title_ar?: string
          intro_title_en?: string
          notify_email?: string
          notify_enabled?: boolean
          page_enabled?: boolean
          response_note_ar?: string
          response_note_en?: string
          updated_at?: string
        }
        Relationships: []
      }
      universities: {
        Row: {
          city: string | null
          closed_note_ar: string | null
          closed_note_en: string | null
          country: string | null
          cover_path: string | null
          created_at: string
          description: string | null
          home_badge: string | null
          home_order: number
          home_tagline: string | null
          home_visible: boolean
          id: string
          is_active: boolean
          is_closed: boolean
          is_visible: boolean
          lectures_visible: boolean
          logo_url: string
          name: string
          short_name: string | null
          slug: string
          sort_order: number
          storage_path: string | null
          tags: Json
          updated_at: string
        }
        Insert: {
          city?: string | null
          closed_note_ar?: string | null
          closed_note_en?: string | null
          country?: string | null
          cover_path?: string | null
          created_at?: string
          description?: string | null
          home_badge?: string | null
          home_order?: number
          home_tagline?: string | null
          home_visible?: boolean
          id?: string
          is_active?: boolean
          is_closed?: boolean
          is_visible?: boolean
          lectures_visible?: boolean
          logo_url: string
          name: string
          short_name?: string | null
          slug: string
          sort_order?: number
          storage_path?: string | null
          tags?: Json
          updated_at?: string
        }
        Update: {
          city?: string | null
          closed_note_ar?: string | null
          closed_note_en?: string | null
          country?: string | null
          cover_path?: string | null
          created_at?: string
          description?: string | null
          home_badge?: string | null
          home_order?: number
          home_tagline?: string | null
          home_visible?: boolean
          id?: string
          is_active?: boolean
          is_closed?: boolean
          is_visible?: boolean
          lectures_visible?: boolean
          logo_url?: string
          name?: string
          short_name?: string | null
          slug?: string
          sort_order?: number
          storage_path?: string | null
          tags?: Json
          updated_at?: string
        }
        Relationships: []
      }
      universities_settings: {
        Row: {
          background_color: string
          id: boolean
          is_enabled: boolean
          scroll_speed_seconds: number
          updated_at: string
        }
        Insert: {
          background_color?: string
          id?: boolean
          is_enabled?: boolean
          scroll_speed_seconds?: number
          updated_at?: string
        }
        Update: {
          background_color?: string
          id?: boolean
          is_enabled?: boolean
          scroll_speed_seconds?: number
          updated_at?: string
        }
        Relationships: []
      }
      university_tiles: {
        Row: {
          badge_ar: string
          badge_en: string
          created_at: string
          highlighted: boolean
          href: string
          icon: string
          id: string
          kind: string
          lock_color: string
          lock_note_ar: string
          lock_note_en: string
          locked: boolean
          sort_order: number
          subtitle_ar: string
          subtitle_en: string
          title_ar: string
          title_en: string
          university_id: string
          updated_at: string
          visible: boolean
        }
        Insert: {
          badge_ar?: string
          badge_en?: string
          created_at?: string
          highlighted?: boolean
          href?: string
          icon?: string
          id?: string
          kind?: string
          lock_color?: string
          lock_note_ar?: string
          lock_note_en?: string
          locked?: boolean
          sort_order?: number
          subtitle_ar?: string
          subtitle_en?: string
          title_ar?: string
          title_en?: string
          university_id: string
          updated_at?: string
          visible?: boolean
        }
        Update: {
          badge_ar?: string
          badge_en?: string
          created_at?: string
          highlighted?: boolean
          href?: string
          icon?: string
          id?: string
          kind?: string
          lock_color?: string
          lock_note_ar?: string
          lock_note_en?: string
          locked?: boolean
          sort_order?: number
          subtitle_ar?: string
          subtitle_en?: string
          title_ar?: string
          title_en?: string
          university_id?: string
          updated_at?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "university_tiles_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      user_courses: {
        Row: {
          course_id: string
          created_at: string
          granted_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          granted_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          granted_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_devices: {
        Row: {
          device_id: string
          first_seen_at: string
          id: string
          ip: string | null
          last_seen_at: string
          nickname: string | null
          platform: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          device_id: string
          first_seen_at?: string
          id?: string
          ip?: string | null
          last_seen_at?: string
          nickname?: string | null
          platform?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          device_id?: string
          first_seen_at?: string
          id?: string
          ip?: string | null
          last_seen_at?: string
          nickname?: string | null
          platform?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_group_members: {
        Row: {
          created_at: string
          group_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "user_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      user_groups: {
        Row: {
          color: string
          course_id: string | null
          created_at: string
          id: string
          kind: string
          name: string
          package_id: string | null
          updated_at: string
        }
        Insert: {
          color?: string
          course_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          name: string
          package_id?: string | null
          updated_at?: string
        }
        Update: {
          color?: string
          course_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          name?: string
          package_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_groups_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_groups_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      user_lecture_courses: {
        Row: {
          course_id: string
          granted_at: string
          user_id: string
        }
        Insert: {
          course_id: string
          granted_at?: string
          user_id: string
        }
        Update: {
          course_id?: string
          granted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_lecture_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_login_events: {
        Row: {
          id: string
          occurred_at: string
          user_id: string
        }
        Insert: {
          id?: string
          occurred_at?: string
          user_id: string
        }
        Update: {
          id?: string
          occurred_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          last_seen_at: string
          started_at: string
          user_id: string
        }
        Insert: {
          last_seen_at?: string
          started_at?: string
          user_id: string
        }
        Update: {
          last_seen_at?: string
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_active: { Args: { _user_id: string }; Returns: boolean }
      admin_get_user_roles: {
        Args: { _user_id: string }
        Returns: {
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      admin_grant_committee_role: {
        Args: { _username: string }
        Returns: undefined
      }
      admin_grant_lecture_course: {
        Args: { _course_id: string; _user_id: string }
        Returns: undefined
      }
      admin_grant_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      admin_group_counts: {
        Args: never
        Returns: {
          group_id: string
          member_count: number
        }[]
      }
      admin_list_all_users: {
        Args: never
        Returns: {
          created_at: string
          device_limit: number
          email: string
          full_name: string
          id: string
          phone: string
          roles: string[]
          username: string
        }[]
      }
      admin_list_committee_members: {
        Args: never
        Returns: {
          email: string
          full_name: string
          user_id: string
          username: string
        }[]
      }
      admin_list_group_members: {
        Args: { _group_id: string }
        Returns: {
          email: string
          full_name: string
          user_id: string
          username: string
        }[]
      }
      admin_list_lecture_course_users: {
        Args: { _course_id: string }
        Returns: {
          email: string
          full_name: string
          user_id: string
          username: string
        }[]
      }
      admin_list_role_members: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: {
          email: string
          full_name: string
          user_id: string
          username: string
        }[]
      }
      admin_marketing_stats: { Args: never; Returns: Json }
      admin_people_course_stats: {
        Args: never
        Returns: {
          course_id: string
          owners: number
          price: number
          revenue_cents: number
          title: string
        }[]
      }
      admin_people_directory: {
        Args: never
        Returns: {
          courses: number
          created_at: string
          email: string
          full_name: string
          id: string
          last_seen: string
          lock_reason: string
          lock_until: string
          locked_at: string
          login_count: number
          paid_cents: number
          phone: string
          roles: string[]
          username: string
          verified: boolean
        }[]
      }
      admin_people_insights: { Args: never; Returns: Json }
      admin_people_overview: { Args: never; Returns: Json }
      admin_people_retention: {
        Args: never
        Returns: {
          cohort: string
          size: number
          w0: number
          w1: number
          w2: number
          w3: number
        }[]
      }
      admin_people_timeseries: {
        Args: { _days?: number }
        Returns: {
          active_users: number
          day: string
          logins: number
          signups: number
        }[]
      }
      admin_revoke_committee_role: {
        Args: { _username: string }
        Returns: undefined
      }
      admin_revoke_lecture_course: {
        Args: { _course_id: string; _user_id: string }
        Returns: undefined
      }
      admin_revoke_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      admin_server_stats: { Args: never; Returns: Json }
      admin_support_notify: {
        Args: never
        Returns: {
          notify_email: string
          notify_enabled: boolean
        }[]
      }
      apply_coupon: {
        Args: { _code: string; _course_id: string }
        Returns: Json
      }
      can_access_committee_subject: {
        Args: { _subject_id: string }
        Returns: boolean
      }
      can_manage_committee: { Args: { _user_id: string }; Returns: boolean }
      get_course_real_counts: {
        Args: { _course_ids: string[] }
        Returns: {
          course_id: string
          questions_count: number
          subjects_count: number
        }[]
      }
      get_email_by_username: { Args: { _username: string }; Returns: string }
      get_subject_question_counts: {
        Args: { _subject_ids: string[] }
        Returns: {
          cnt: number
          subject_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      identity_taken: {
        Args: { _phone: string; _username: string }
        Returns: Json
      }
      my_announcements: {
        Args: never
        Returns: {
          accent: string
          active: boolean
          body: string
          created_at: string
          ends_at: string | null
          href: string | null
          href_label: string | null
          id: string
          pinned: boolean
          sort: number
          starts_at: string | null
          style: string
          title: string
          updated_at: string
          urgent: boolean
        }[]
        SetofOptions: {
          from: "*"
          to: "site_announcements"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_users_for_group: {
        Args: { _exclude: string; _query: string }
        Returns: {
          email: string
          full_name: string
          id: string
          username: string
        }[]
      }
      university_id_by_slug: { Args: { _slug: string }; Returns: string }
      user_in_group: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      user_owns_any_german_course: {
        Args: { _user_id: string }
        Returns: boolean
      }
      user_owns_lecture_course: {
        Args: { _course_id: string }
        Returns: boolean
      }
      validate_coupon: {
        Args: { _code: string; _course_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "user" | "committee"
      coupon_discount_type: "percent" | "fixed"
      package_type: "individual" | "group"
      subject_access: "paid" | "free_logged_in" | "free_public"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "committee"],
      coupon_discount_type: ["percent", "fixed"],
      package_type: ["individual", "group"],
      subject_access: ["paid", "free_logged_in", "free_public"],
    },
  },
} as const
