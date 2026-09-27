export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "blocks": {
                  Row: {
                    "blocked_user_id": string,"blocker_user_id": string,"created_at": string
                  }
                  Insert: {
                    "blocked_user_id": string,"blocker_user_id": string,"created_at"?: string
                  }
                  Update: {
                    "blocked_user_id"?: string,"blocker_user_id"?: string,"created_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "blocks_blocked_user_id_fkey"
      columns: ["blocked_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "blocks_blocker_user_id_fkey"
      columns: ["blocker_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "created_at": string,"href": string | null,"icon": string,"id": string,"name_ar": string,"name_en": string,"slug": string,"sort_order": number,"status": string,"tagline_ar": string,"tagline_en": string
                  }
                  Insert: {
                    "created_at"?: string,"href"?: string | null,"icon"?: string,"id"?: string,"name_ar": string,"name_en": string,"slug": string,"sort_order"?: number,"status"?: string,"tagline_ar"?: string,"tagline_en"?: string
                  }
                  Update: {
                    "created_at"?: string,"href"?: string | null,"icon"?: string,"id"?: string,"name_ar"?: string,"name_en"?: string,"slug"?: string,"sort_order"?: number,"status"?: string,"tagline_ar"?: string,"tagline_en"?: string
                  }
                  Relationships: [
                    
                  ]
                },"favorites": {
                  Row: {
                    "created_at": string,"generic_profile_id": string | null,"id": string,"nanny_profile_id": string | null,"parent_profile_id": string | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"generic_profile_id"?: string | null,"id"?: string,"nanny_profile_id"?: string | null,"parent_profile_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"generic_profile_id"?: string | null,"id"?: string,"nanny_profile_id"?: string | null,"parent_profile_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "favorites_generic_profile_id_fkey"
      columns: ["generic_profile_id"]
isOneToOne: false
      referencedRelation: "generic_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "favorites_nanny_profile_id_fkey"
      columns: ["nanny_profile_id"]
isOneToOne: false
      referencedRelation: "nanny_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "favorites_parent_profile_id_fkey"
      columns: ["parent_profile_id"]
isOneToOne: false
      referencedRelation: "parent_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "favorites_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"featured_grants": {
                  Row: {
                    "created_at": string,"expires_at": string,"granted_by": string | null,"id": string,"note": string | null,"plan": string,"starts_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"expires_at": string,"granted_by"?: string | null,"id"?: string,"note"?: string | null,"plan": string,"starts_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"granted_by"?: string | null,"id"?: string,"note"?: string | null,"plan"?: string,"starts_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscription_grants_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscription_grants_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"generic_matches": {
                  Row: {
                    "category_id": string,"created_at": string,"id": string,"initiated_by": string | null,"interest_expires_at": string | null,"provider_profile_id": string,"responded_at": string | null,"score": number,"score_breakdown": NonNullable<Json>,"seeker_profile_id": string,"status": string,"updated_at": string
                  }
                  Insert: {
                    "category_id": string,"created_at"?: string,"id"?: string,"initiated_by"?: string | null,"interest_expires_at"?: string | null,"provider_profile_id": string,"responded_at"?: string | null,"score": number,"score_breakdown": NonNullable<Json>,"seeker_profile_id": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "category_id"?: string,"created_at"?: string,"id"?: string,"initiated_by"?: string | null,"interest_expires_at"?: string | null,"provider_profile_id"?: string,"responded_at"?: string | null,"score"?: number,"score_breakdown"?: NonNullable<Json>,"seeker_profile_id"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "generic_matches_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "generic_matches_provider_profile_id_fkey"
      columns: ["provider_profile_id"]
isOneToOne: false
      referencedRelation: "generic_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "generic_matches_seeker_profile_id_fkey"
      columns: ["seeker_profile_id"]
isOneToOne: false
      referencedRelation: "generic_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"generic_messages": {
                  Row: {
                    "audio_duration_seconds": number | null,"audio_path": string | null,"body": string,"created_at": string,"id": string,"match_id": string,"read_at": string | null,"sender_id": string
                  }
                  Insert: {
                    "audio_duration_seconds"?: number | null,"audio_path"?: string | null,"body": string,"created_at"?: string,"id"?: string,"match_id": string,"read_at"?: string | null,"sender_id": string
                  }
                  Update: {
                    "audio_duration_seconds"?: number | null,"audio_path"?: string | null,"body"?: string,"created_at"?: string,"id"?: string,"match_id"?: string,"read_at"?: string | null,"sender_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "generic_messages_match_id_fkey"
      columns: ["match_id"]
isOneToOne: false
      referencedRelation: "generic_matches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "generic_messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"generic_profiles": {
                  Row: {
                    "attributes": NonNullable<Json>,"category_id": string,"created_at": string,"full_name": string,"id": string,"location_id": string | null,"moderation_status": string,"profile_photo_url": string | null,"role": string,"search_text": string | null,"status": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "attributes"?: NonNullable<Json>,"category_id": string,"created_at"?: string,"full_name": string,"id"?: string,"location_id"?: string | null,"moderation_status"?: string,"profile_photo_url"?: string | null,"role": string,"search_text"?: string | null,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "attributes"?: NonNullable<Json>,"category_id"?: string,"created_at"?: string,"full_name"?: string,"id"?: string,"location_id"?: string | null,"moderation_status"?: string,"profile_photo_url"?: string | null,"role"?: string,"search_text"?: string | null,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "generic_profiles_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "generic_profiles_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "generic_profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"generic_ratings": {
                  Row: {
                    "comment": string | null,"created_at": string,"id": string,"match_id": string,"ratee_user_id": string,"rater_user_id": string,"score": number,"updated_at": string
                  }
                  Insert: {
                    "comment"?: string | null,"created_at"?: string,"id"?: string,"match_id": string,"ratee_user_id": string,"rater_user_id": string,"score": number,"updated_at"?: string
                  }
                  Update: {
                    "comment"?: string | null,"created_at"?: string,"id"?: string,"match_id"?: string,"ratee_user_id"?: string,"rater_user_id"?: string,"score"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "generic_ratings_match_id_fkey"
      columns: ["match_id"]
isOneToOne: false
      referencedRelation: "generic_matches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "generic_ratings_ratee_user_id_fkey"
      columns: ["ratee_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "generic_ratings_rater_user_id_fkey"
      columns: ["rater_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"languages": {
                  Row: {
                    "code": string,"id": string,"name_ar": string,"name_en": string,"name_fr": string
                  }
                  Insert: {
                    "code": string,"id"?: string,"name_ar": string,"name_en": string,"name_fr": string
                  }
                  Update: {
                    "code"?: string,"id"?: string,"name_ar"?: string,"name_en"?: string,"name_fr"?: string
                  }
                  Relationships: [
                    
                  ]
                },"locations": {
                  Row: {
                    "id": string,"level": string,"name_ar": string,"name_en": string,"name_fr": string,"parent_location_id": string | null,"sort_order": number
                  }
                  Insert: {
                    "id"?: string,"level": string,"name_ar": string,"name_en": string,"name_fr": string,"parent_location_id"?: string | null,"sort_order"?: number
                  }
                  Update: {
                    "id"?: string,"level"?: string,"name_ar"?: string,"name_en"?: string,"name_fr"?: string,"parent_location_id"?: string | null,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "locations_parent_location_id_fkey"
      columns: ["parent_location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    }
                  ]
                },"login_events": {
                  Row: {
                    "city": string | null,"country": string | null,"country_code": string | null,"created_at": string,"id": string,"ip": string | null,"user_agent": string | null,"user_id": string | null
                  }
                  Insert: {
                    "city"?: string | null,"country"?: string | null,"country_code"?: string | null,"created_at"?: string,"id"?: string,"ip"?: string | null,"user_agent"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "city"?: string | null,"country"?: string | null,"country_code"?: string | null,"created_at"?: string,"id"?: string,"ip"?: string | null,"user_agent"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "login_events_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"matches": {
                  Row: {
                    "created_at": string,"id": string,"initiated_by": string | null,"interest_expires_at": string | null,"nanny_profile_id": string,"parent_profile_id": string,"responded_at": string | null,"score": number,"score_breakdown": NonNullable<Json>,"status": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"initiated_by"?: string | null,"interest_expires_at"?: string | null,"nanny_profile_id": string,"parent_profile_id": string,"responded_at"?: string | null,"score": number,"score_breakdown": NonNullable<Json>,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"initiated_by"?: string | null,"interest_expires_at"?: string | null,"nanny_profile_id"?: string,"parent_profile_id"?: string,"responded_at"?: string | null,"score"?: number,"score_breakdown"?: NonNullable<Json>,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "matches_nanny_profile_id_fkey"
      columns: ["nanny_profile_id"]
isOneToOne: false
      referencedRelation: "nanny_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "matches_parent_profile_id_fkey"
      columns: ["parent_profile_id"]
isOneToOne: false
      referencedRelation: "parent_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "audio_duration_seconds": number | null,"audio_path": string | null,"body": string,"created_at": string,"id": string,"match_id": string,"read_at": string | null,"sender_id": string
                  }
                  Insert: {
                    "audio_duration_seconds"?: number | null,"audio_path"?: string | null,"body": string,"created_at"?: string,"id"?: string,"match_id": string,"read_at"?: string | null,"sender_id": string
                  }
                  Update: {
                    "audio_duration_seconds"?: number | null,"audio_path"?: string | null,"body"?: string,"created_at"?: string,"id"?: string,"match_id"?: string,"read_at"?: string | null,"sender_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_match_id_fkey"
      columns: ["match_id"]
isOneToOne: false
      referencedRelation: "matches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"nanny_experience": {
                  Row: {
                    "age_group": string,"id": string,"nanny_profile_id": string,"years_experience": number
                  }
                  Insert: {
                    "age_group": string,"id"?: string,"nanny_profile_id": string,"years_experience": number
                  }
                  Update: {
                    "age_group"?: string,"id"?: string,"nanny_profile_id"?: string,"years_experience"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "nanny_experience_nanny_profile_id_fkey"
      columns: ["nanny_profile_id"]
isOneToOne: false
      referencedRelation: "nanny_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"nanny_profile_languages": {
                  Row: {
                    "language_id": string,"nanny_profile_id": string
                  }
                  Insert: {
                    "language_id": string,"nanny_profile_id": string
                  }
                  Update: {
                    "language_id"?: string,"nanny_profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "nanny_profile_languages_language_id_fkey"
      columns: ["language_id"]
isOneToOne: false
      referencedRelation: "languages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "nanny_profile_languages_nanny_profile_id_fkey"
      columns: ["nanny_profile_id"]
isOneToOne: false
      referencedRelation: "nanny_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"nanny_profiles": {
                  Row: {
                    "availability": NonNullable<Json>,"can_drive": boolean,"certifications": (string)[],"created_at": string,"employment_type": string,"full_name": string,"has_transportation": boolean,"id": string,"live_arrangement_pref": string,"location_detail": string | null,"location_id": string,"moderation_status": string,"nationality": string | null,"profile_completion_pct": number,"profile_photo_url": string | null,"short_intro": string | null,"status": string,"updated_at": string,"user_id": string,"work_radius_km": number,"years_experience": number
                  }
                  Insert: {
                    "availability": NonNullable<Json>,"can_drive"?: boolean,"certifications"?: (string)[],"created_at"?: string,"employment_type": string,"full_name": string,"has_transportation"?: boolean,"id"?: string,"live_arrangement_pref": string,"location_detail"?: string | null,"location_id": string,"moderation_status"?: string,"nationality"?: string | null,"profile_completion_pct"?: number,"profile_photo_url"?: string | null,"short_intro"?: string | null,"status"?: string,"updated_at"?: string,"user_id": string,"work_radius_km": number,"years_experience": number
                  }
                  Update: {
                    "availability"?: NonNullable<Json>,"can_drive"?: boolean,"certifications"?: (string)[],"created_at"?: string,"employment_type"?: string,"full_name"?: string,"has_transportation"?: boolean,"id"?: string,"live_arrangement_pref"?: string,"location_detail"?: string | null,"location_id"?: string,"moderation_status"?: string,"nationality"?: string | null,"profile_completion_pct"?: number,"profile_photo_url"?: string | null,"short_intro"?: string | null,"status"?: string,"updated_at"?: string,"user_id"?: string,"work_radius_km"?: number,"years_experience"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "nanny_profiles_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "nanny_profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "created_at": string,"id": string,"payload": NonNullable<Json>,"read_at": string | null,"type": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"payload": NonNullable<Json>,"read_at"?: string | null,"type": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"payload"?: NonNullable<Json>,"read_at"?: string | null,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"parent_profile_languages": {
                  Row: {
                    "language_id": string,"parent_profile_id": string
                  }
                  Insert: {
                    "language_id": string,"parent_profile_id": string
                  }
                  Update: {
                    "language_id"?: string,"parent_profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "parent_profile_languages_language_id_fkey"
      columns: ["language_id"]
isOneToOne: false
      referencedRelation: "languages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "parent_profile_languages_parent_profile_id_fkey"
      columns: ["parent_profile_id"]
isOneToOne: false
      referencedRelation: "parent_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"parent_profiles": {
                  Row: {
                    "additional_duties": (string)[],"children_age_ranges": (string)[],"created_at": string,"desired_start_date": string,"family_description": string | null,"full_name": string,"id": string,"live_arrangement": string,"location_detail": string | null,"location_id": string,"moderation_status": string,"nationality": string | null,"needed_days": (string)[],"num_children": number,"profile_completion_pct": number,"profile_photo_url": string | null,"schedule_type": string,"status": string,"transportation_required": boolean,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "additional_duties"?: (string)[],"children_age_ranges": (string)[],"created_at"?: string,"desired_start_date": string,"family_description"?: string | null,"full_name": string,"id"?: string,"live_arrangement": string,"location_detail"?: string | null,"location_id": string,"moderation_status"?: string,"nationality"?: string | null,"needed_days"?: (string)[],"num_children": number,"profile_completion_pct"?: number,"profile_photo_url"?: string | null,"schedule_type": string,"status"?: string,"transportation_required"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "additional_duties"?: (string)[],"children_age_ranges"?: (string)[],"created_at"?: string,"desired_start_date"?: string,"family_description"?: string | null,"full_name"?: string,"id"?: string,"live_arrangement"?: string,"location_detail"?: string | null,"location_id"?: string,"moderation_status"?: string,"nationality"?: string | null,"needed_days"?: (string)[],"num_children"?: number,"profile_completion_pct"?: number,"profile_photo_url"?: string | null,"schedule_type"?: string,"status"?: string,"transportation_required"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "parent_profiles_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "parent_profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"post_likes": {
                  Row: {
                    "created_at": string,"post_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"post_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"post_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_likes_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_likes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"post_replies": {
                  Row: {
                    "body": string,"created_at": string,"id": string,"parent_reply_id": string | null,"post_id": string,"user_id": string
                  }
                  Insert: {
                    "body": string,"created_at"?: string,"id"?: string,"parent_reply_id"?: string | null,"post_id": string,"user_id": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"id"?: string,"parent_reply_id"?: string | null,"post_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_replies_parent_reply_id_fkey"
      columns: ["parent_reply_id"]
isOneToOne: false
      referencedRelation: "post_replies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_replies_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_replies_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"posts": {
                  Row: {
                    "caption": string,"created_at": string,"expires_at": string,"id": string,"kind": string,"posted_as_generic_profile_id": string | null,"posted_as_nanny_profile_id": string | null,"posted_as_parent_profile_id": string | null,"status": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "caption": string,"created_at"?: string,"expires_at"?: string,"id"?: string,"kind": string,"posted_as_generic_profile_id"?: string | null,"posted_as_nanny_profile_id"?: string | null,"posted_as_parent_profile_id"?: string | null,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "caption"?: string,"created_at"?: string,"expires_at"?: string,"id"?: string,"kind"?: string,"posted_as_generic_profile_id"?: string | null,"posted_as_nanny_profile_id"?: string | null,"posted_as_parent_profile_id"?: string | null,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "posts_posted_as_generic_profile_id_fkey"
      columns: ["posted_as_generic_profile_id"]
isOneToOne: false
      referencedRelation: "generic_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_posted_as_nanny_profile_id_fkey"
      columns: ["posted_as_nanny_profile_id"]
isOneToOne: false
      referencedRelation: "nanny_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_posted_as_parent_profile_id_fkey"
      columns: ["posted_as_parent_profile_id"]
isOneToOne: false
      referencedRelation: "parent_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"ratings": {
                  Row: {
                    "comment": string | null,"created_at": string,"id": string,"match_id": string,"ratee_user_id": string,"rater_user_id": string,"score": number,"updated_at": string
                  }
                  Insert: {
                    "comment"?: string | null,"created_at"?: string,"id"?: string,"match_id": string,"ratee_user_id": string,"rater_user_id": string,"score": number,"updated_at"?: string
                  }
                  Update: {
                    "comment"?: string | null,"created_at"?: string,"id"?: string,"match_id"?: string,"ratee_user_id"?: string,"rater_user_id"?: string,"score"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ratings_match_id_fkey"
      columns: ["match_id"]
isOneToOne: false
      referencedRelation: "matches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ratings_ratee_user_id_fkey"
      columns: ["ratee_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ratings_rater_user_id_fkey"
      columns: ["rater_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"references": {
                  Row: {
                    "contact_email": string | null,"contact_phone": string | null,"created_at": string,"id": string,"nanny_profile_id": string,"reference_name": string,"relationship": string,"verified_at": string | null,"verified_by_admin_id": string | null
                  }
                  Insert: {
                    "contact_email"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"id"?: string,"nanny_profile_id": string,"reference_name": string,"relationship": string,"verified_at"?: string | null,"verified_by_admin_id"?: string | null
                  }
                  Update: {
                    "contact_email"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"id"?: string,"nanny_profile_id"?: string,"reference_name"?: string,"relationship"?: string,"verified_at"?: string | null,"verified_by_admin_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "references_nanny_profile_id_fkey"
      columns: ["nanny_profile_id"]
isOneToOne: false
      referencedRelation: "nanny_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "references_verified_by_admin_id_fkey"
      columns: ["verified_by_admin_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"reports": {
                  Row: {
                    "created_at": string,"details": string | null,"id": string,"match_id": string | null,"match_source": string | null,"post_id": string | null,"reason": string,"reported_user_id": string | null,"reporter_user_id": string | null,"resolution_notes": string | null,"resolved_at": string | null,"resolved_by_admin_id": string | null,"status": string
                  }
                  Insert: {
                    "created_at"?: string,"details"?: string | null,"id"?: string,"match_id"?: string | null,"match_source"?: string | null,"post_id"?: string | null,"reason": string,"reported_user_id"?: string | null,"reporter_user_id"?: string | null,"resolution_notes"?: string | null,"resolved_at"?: string | null,"resolved_by_admin_id"?: string | null,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"details"?: string | null,"id"?: string,"match_id"?: string | null,"match_source"?: string | null,"post_id"?: string | null,"reason"?: string,"reported_user_id"?: string | null,"reporter_user_id"?: string | null,"resolution_notes"?: string | null,"resolved_at"?: string | null,"resolved_by_admin_id"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reported_user_id_fkey"
      columns: ["reported_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reporter_user_id_fkey"
      columns: ["reporter_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_resolved_by_admin_id_fkey"
      columns: ["resolved_by_admin_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"users": {
                  Row: {
                    "contact_phone": string | null,"created_at": string,"email": string | null,"email_verified_at": string | null,"featured_until": string | null,"id": string,"last_login_at": string | null,"notify_new_profiles": boolean,"phone": string | null,"phone_verified_at": string | null,"preferred_language": string,"role": string | null,"status": string,"updated_at": string
                  }
                  Insert: {
                    "contact_phone"?: string | null,"created_at"?: string,"email"?: string | null,"email_verified_at"?: string | null,"featured_until"?: string | null,"id": string,"last_login_at"?: string | null,"notify_new_profiles"?: boolean,"phone"?: string | null,"phone_verified_at"?: string | null,"preferred_language"?: string,"role"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "contact_phone"?: string | null,"created_at"?: string,"email"?: string | null,"email_verified_at"?: string | null,"featured_until"?: string | null,"id"?: string,"last_login_at"?: string | null,"notify_new_profiles"?: boolean,"phone"?: string | null,"phone_verified_at"?: string | null,"preferred_language"?: string,"role"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"verification": {
                  Row: {
                    "created_at": string,"document_ref": string | null,"id": string,"status": string,"type": string,"user_id": string,"verified_at": string | null,"verified_by_admin_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"document_ref"?: string | null,"id"?: string,"status"?: string,"type": string,"user_id": string,"verified_at"?: string | null,"verified_by_admin_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"document_ref"?: string | null,"id"?: string,"status"?: string,"type"?: string,"user_id"?: string,"verified_at"?: string | null,"verified_by_admin_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "verification_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "verification_verified_by_admin_id_fkey"
      columns: ["verified_by_admin_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "account_is_suspended":
{ Args: { "check_user_id": string }; Returns: boolean
                           },
"create_nanny_profile":
{ Args: { "p_availability": Json,"p_can_drive": boolean,"p_certifications": (string)[],"p_employment_type": string,"p_experience": Json,"p_full_name": string,"p_has_transportation": boolean,"p_language_ids": (string)[],"p_live_arrangement_pref": string,"p_location_detail": string,"p_location_id": string,"p_profile_photo_url": string,"p_short_intro": string,"p_work_radius_km": number,"p_years_experience": number }; Returns: {
              "availability": NonNullable<Json>,
"can_drive": boolean,
"certifications": (string)[],
"created_at": string,
"employment_type": string,
"full_name": string,
"has_transportation": boolean,
"id": string,
"live_arrangement_pref": string,
"location_detail": string | null,
"location_id": string,
"moderation_status": string,
"nationality": string | null,
"profile_completion_pct": number,
"profile_photo_url": string | null,
"short_intro": string | null,
"status": string,
"updated_at": string,
"user_id": string,
"work_radius_km": number,
"years_experience": number
            }
                          SetofOptions: {
        from: "*"
        to: "nanny_profiles"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_parent_profile":
{ Args: { "p_additional_duties": (string)[],"p_children_age_ranges": (string)[],"p_desired_start_date": string,"p_family_description": string,"p_full_name": string,"p_language_ids": (string)[],"p_live_arrangement": string,"p_location_detail": string,"p_location_id": string,"p_needed_days": (string)[],"p_num_children": number,"p_schedule_type": string,"p_transportation_required": boolean }; Returns: {
              "additional_duties": (string)[],
"children_age_ranges": (string)[],
"created_at": string,
"desired_start_date": string,
"family_description": string | null,
"full_name": string,
"id": string,
"live_arrangement": string,
"location_detail": string | null,
"location_id": string,
"moderation_status": string,
"nationality": string | null,
"needed_days": (string)[],
"num_children": number,
"profile_completion_pct": number,
"profile_photo_url": string | null,
"schedule_type": string,
"status": string,
"transportation_required": boolean,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "parent_profiles"
        isOneToOne: true
        isSetofReturn: false
      } },
"current_user_is_active":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"generic_message_summaries_for_matches":
{ Args: { "p_match_ids": (string)[],"p_user_id": string }; Returns: {
              "last_body": string,"last_created_at": string,"match_id": string,"unread_count": number
            }[]
                           },
"is_generic_profile_mutual_counterpart":
{ Args: { "p_caller_user_id": string,"p_profile_id": string }; Returns: boolean
                           },
"is_nanny_profile_mutual_counterpart":
{ Args: { "p_caller_user_id": string,"p_nanny_profile_id": string }; Returns: boolean
                           },
"is_parent_profile_mutual_counterpart":
{ Args: { "p_caller_user_id": string,"p_parent_profile_id": string }; Returns: boolean
                           },
"list_profile_matches":
{ Args: { "p_day"?: string,"p_governorate_id"?: string,"p_limit"?: number,"p_match_id"?: string,"p_min_years"?: number,"p_offset"?: number,"p_profile_id": string,"p_words"?: (string)[] }; Returns: {
              "featured": boolean,"match_id": string,"other_profile_id": string,"total": number
            }[]
                           },
"list_saved_favorites":
{ Args: { "p_category": string,"p_cursor_created_at": string,"p_cursor_id": string,"p_limit": number,"p_role": string,"p_user_id": string }; Returns: {
              "created_at": string,"generic_profile_id": string,"id": string
            }[]
                           },
"message_summaries_for_matches":
{ Args: { "p_match_ids": (string)[],"p_user_id": string }; Returns: {
              "last_body": string,"last_created_at": string,"match_id": string,"unread_count": number
            }[]
                           },
"report_match_participants_valid":
{ Args: { "p_match_id": string,"p_match_source": string,"p_reported_user_id": string,"p_reporter_user_id": string }; Returns: boolean
                           },
"update_nanny_profile":
{ Args: { "p_availability": Json,"p_can_drive": boolean,"p_certifications": (string)[],"p_employment_type": string,"p_experience": Json,"p_full_name": string,"p_has_transportation": boolean,"p_language_ids": (string)[],"p_live_arrangement_pref": string,"p_location_detail": string,"p_location_id": string,"p_profile_photo_url": string,"p_short_intro": string,"p_work_radius_km": number,"p_years_experience": number }; Returns: {
              "availability": NonNullable<Json>,
"can_drive": boolean,
"certifications": (string)[],
"created_at": string,
"employment_type": string,
"full_name": string,
"has_transportation": boolean,
"id": string,
"live_arrangement_pref": string,
"location_detail": string | null,
"location_id": string,
"moderation_status": string,
"nationality": string | null,
"profile_completion_pct": number,
"profile_photo_url": string | null,
"short_intro": string | null,
"status": string,
"updated_at": string,
"user_id": string,
"work_radius_km": number,
"years_experience": number
            }
                          SetofOptions: {
        from: "*"
        to: "nanny_profiles"
        isOneToOne: true
        isSetofReturn: false
      } },
"update_parent_profile":
{ Args: { "p_additional_duties": (string)[],"p_children_age_ranges": (string)[],"p_desired_start_date": string,"p_family_description": string,"p_full_name": string,"p_language_ids": (string)[],"p_live_arrangement": string,"p_location_detail": string,"p_location_id": string,"p_needed_days": (string)[],"p_num_children": number,"p_schedule_type": string,"p_transportation_required": boolean }; Returns: {
              "additional_duties": (string)[],
"children_age_ranges": (string)[],
"created_at": string,
"desired_start_date": string,
"family_description": string | null,
"full_name": string,
"id": string,
"live_arrangement": string,
"location_detail": string | null,
"location_id": string,
"moderation_status": string,
"nationality": string | null,
"needed_days": (string)[],
"num_children": number,
"profile_completion_pct": number,
"profile_photo_url": string | null,
"schedule_type": string,
"status": string,
"transportation_required": boolean,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "parent_profiles"
        isOneToOne: true
        isSetofReturn: false
      } },
"user_is_featured":
{ Args: { "p_user_id": string }; Returns: boolean
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const

