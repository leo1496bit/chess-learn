// Généré depuis Supabase (projet chess-learn). Ne pas modifier à la main :
// régénérer après chaque migration.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_usage: {
        Row: {
          cache_read_tokens: number
          cache_write_tokens: number
          cost_usd: number
          created_at: string
          error: string | null
          id: number
          input_tokens: number
          model: string
          output_tokens: number
          purpose: string
          status: string
          user_id: string
        }
        Insert: {
          cache_read_tokens?: number
          cache_write_tokens?: number
          cost_usd?: number
          created_at?: string
          error?: string | null
          id?: never
          input_tokens?: number
          model: string
          output_tokens?: number
          purpose: string
          status: string
          user_id?: string
        }
        Update: {
          cache_read_tokens?: number
          cache_write_tokens?: number
          cost_usd?: number
          created_at?: string
          error?: string | null
          id?: never
          input_tokens?: number
          model?: string
          output_tokens?: number
          purpose?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      chesscom_archives: {
        Row: {
          etag: string | null
          game_count: number
          last_modified: string | null
          last_synced_at: string
          url: string
          user_id: string
        }
        Insert: {
          etag?: string | null
          game_count?: number
          last_modified?: string | null
          last_synced_at?: string
          url: string
          user_id?: string
        }
        Update: {
          etag?: string | null
          game_count?: number
          last_modified?: string | null
          last_synced_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      exercise_attempts: {
        Row: {
          answer_san: string | null
          answer_uci: string
          correct: boolean
          created_at: string
          exercise_id: string
          id: number
          loss: number | null
          user_id: string
        }
        Insert: {
          answer_san?: string | null
          answer_uci: string
          correct: boolean
          created_at?: string
          exercise_id: string
          id?: never
          loss?: number | null
          user_id?: string
        }
        Update: {
          answer_san?: string | null
          answer_uci?: string
          correct?: boolean
          created_at?: string
          exercise_id?: string
          id?: never
          loss?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_attempts_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          accepted_uci: string[]
          attempts: number
          created_at: string
          difficulty: string
          due_at: string
          fen: string
          game_id: string
          id: string
          interval_days: number
          last_result: string | null
          phase: string
          played_uci: string
          side_to_move: string
          solution_line: Json
          solution_san: string
          solution_uci: string
          source_move_id: number
          successes: number
          themes: string[]
          user_id: string
        }
        Insert: {
          accepted_uci?: string[]
          attempts?: number
          created_at?: string
          difficulty: string
          due_at?: string
          fen: string
          game_id: string
          id?: string
          interval_days?: number
          last_result?: string | null
          phase: string
          played_uci: string
          side_to_move: string
          solution_line?: Json
          solution_san: string
          solution_uci: string
          source_move_id: number
          successes?: number
          themes?: string[]
          user_id?: string
        }
        Update: {
          accepted_uci?: string[]
          attempts?: number
          created_at?: string
          difficulty?: string
          due_at?: string
          fen?: string
          game_id?: string
          id?: string
          interval_days?: number
          last_result?: string | null
          phase?: string
          played_uci?: string
          side_to_move?: string
          solution_line?: Json
          solution_san?: string
          solution_uci?: string
          source_move_id?: number
          successes?: number
          themes?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercises_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_source_move_id_fkey"
            columns: ["source_move_id"]
            isOneToOne: true
            referencedRelation: "move_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      explanations: {
        Row: {
          content: Json
          created_at: string
          exercise_id: string | null
          game_id: string | null
          id: number
          model: string
          ply: number | null
          prompt_version: string
          user_id: string
          verified: boolean
        }
        Insert: {
          content: Json
          created_at?: string
          exercise_id?: string | null
          game_id?: string | null
          id?: never
          model: string
          ply?: number | null
          prompt_version: string
          user_id?: string
          verified?: boolean
        }
        Update: {
          content?: Json
          created_at?: string
          exercise_id?: string | null
          game_id?: string | null
          id?: never
          model?: string
          ply?: number | null
          prompt_version?: string
          user_id?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "explanations_exercise_fk"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "explanations_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_analyses: {
        Row: {
          created_at: string
          depth: number
          engine_version: string
          game_id: string
          multipv: number
          summary: Json
          thresholds: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          depth: number
          engine_version: string
          game_id: string
          multipv: number
          summary?: Json
          thresholds: Json
          user_id?: string
        }
        Update: {
          created_at?: string
          depth?: number
          engine_version?: string
          game_id?: string
          multipv?: number
          summary?: Json
          thresholds?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_analyses_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          analysis_status: string
          black: string
          black_rating: number | null
          chesscom_url: string | null
          chesscom_uuid: string
          eco: string | null
          end_time: string
          id: string
          imported_at: string
          opening_name: string | null
          opponent_accuracy: number | null
          pgn: string
          player_accuracy: number | null
          player_color: string
          ply_count: number
          rated: boolean | null
          result: string
          result_detail: string | null
          rules: string
          time_class: string | null
          time_control: string | null
          user_id: string
          white: string
          white_rating: number | null
        }
        Insert: {
          analysis_status?: string
          black: string
          black_rating?: number | null
          chesscom_url?: string | null
          chesscom_uuid: string
          eco?: string | null
          end_time: string
          id?: string
          imported_at?: string
          opening_name?: string | null
          opponent_accuracy?: number | null
          pgn: string
          player_accuracy?: number | null
          player_color: string
          ply_count?: number
          rated?: boolean | null
          result: string
          result_detail?: string | null
          rules?: string
          time_class?: string | null
          time_control?: string | null
          user_id?: string
          white: string
          white_rating?: number | null
        }
        Update: {
          analysis_status?: string
          black?: string
          black_rating?: number | null
          chesscom_url?: string | null
          chesscom_uuid?: string
          eco?: string | null
          end_time?: string
          id?: string
          imported_at?: string
          opening_name?: string | null
          opponent_accuracy?: number | null
          pgn?: string
          player_accuracy?: number | null
          player_color?: string
          ply_count?: number
          rated?: boolean | null
          result?: string
          result_detail?: string | null
          rules?: string
          time_class?: string | null
          time_control?: string | null
          user_id?: string
          white?: string
          white_rating?: number | null
        }
        Relationships: []
      }
      move_analyses: {
        Row: {
          accuracy: number
          best_san: string | null
          best_uci: string | null
          candidates: Json
          classification: string
          color: string
          eval_after: Json
          eval_before: Json
          fen_after: string
          fen_before: string
          game_id: string
          id: number
          is_player_move: boolean
          loss: number
          missed_save: boolean
          missed_win: boolean
          phase: string
          ply: number
          punish_line: Json
          san: string
          themes: string[]
          uci: string
          user_id: string
          win_after: number
          win_before: number
        }
        Insert: {
          accuracy: number
          best_san?: string | null
          best_uci?: string | null
          candidates?: Json
          classification: string
          color: string
          eval_after: Json
          eval_before: Json
          fen_after: string
          fen_before: string
          game_id: string
          id?: never
          is_player_move: boolean
          loss: number
          missed_save?: boolean
          missed_win?: boolean
          phase: string
          ply: number
          punish_line?: Json
          san: string
          themes?: string[]
          uci: string
          user_id?: string
          win_after: number
          win_before: number
        }
        Update: {
          accuracy?: number
          best_san?: string | null
          best_uci?: string | null
          candidates?: Json
          classification?: string
          color?: string
          eval_after?: Json
          eval_before?: Json
          fen_after?: string
          fen_before?: string
          game_id?: string
          id?: never
          is_player_move?: boolean
          loss?: number
          missed_save?: boolean
          missed_win?: boolean
          phase?: string
          ply?: number
          punish_line?: Json
          san?: string
          themes?: string[]
          uci?: string
          user_id?: string
          win_after?: number
          win_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "move_analyses_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      position_analyses: {
        Row: {
          created_at: string
          depth: number
          engine_version: string
          fen: string
          id: number
          lines: Json
          multipv: number
          user_id: string
        }
        Insert: {
          created_at?: string
          depth: number
          engine_version: string
          fen: string
          id?: never
          lines: Json
          multipv: number
          user_id?: string
        }
        Update: {
          created_at?: string
          depth?: number
          engine_version?: string
          fen?: string
          id?: never
          lines?: Json
          multipv?: number
          user_id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          ai_daily_call_limit: number
          ai_enabled: boolean
          ai_monthly_budget_usd: number
          chesscom_username: string
          engine_depth: number
          engine_multipv: number
          thresholds: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_daily_call_limit?: number
          ai_enabled?: boolean
          ai_monthly_budget_usd?: number
          chesscom_username?: string
          engine_depth?: number
          engine_multipv?: number
          thresholds?: Json
          updated_at?: string
          user_id?: string
        }
        Update: {
          ai_daily_call_limit?: number
          ai_enabled?: boolean
          ai_monthly_budget_usd?: number
          chesscom_username?: string
          engine_depth?: number
          engine_multipv?: number
          thresholds?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ai_usage_summary: {
        Args: { since: string }
        Returns: {
          calls: number
          cost_usd: number
          input_tokens: number
          output_tokens: number
          cache_read_tokens: number
          cache_write_tokens: number
        }[]
      }
      is_owner: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
