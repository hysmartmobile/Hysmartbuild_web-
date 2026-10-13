/**
 * Application service boundary.
 *
 * Route handlers/controllers should remain thin. Business operations belong
 * here or in feature-specific services introduced in later versions.
 */
export class AppService {
  constructor({ supabase }) {
    this.supabase = supabase;
  }

  getHealth() {
    return {
      status: "ok",
      service: "hysmart-build-api",
      version: "5.7.8",
      timestamp: new Date().toISOString()
    };
  }

  async checkReadiness() {
    const supabase = await this.checkSupabase();
    if (!supabase.connected) {
      return { ready: false, checks: { supabase }, timestamp: new Date().toISOString() };
    }

    const schemaChecks = await Promise.all([
      this.checkColumns("attendance_records", ["location_latitude", "location_longitude", "location_accuracy_m", "location_verified"]),
      this.checkColumns("daily_site_reports", ["location_latitude", "location_longitude", "location_accuracy_m", "location_verified"]),
      this.checkColumns("purchase_order_items", ["company_id", "estimate_item_id"]),
      this.checkColumns("expenses", ["estimate_item_id"]),
      this.checkColumns("project_subcontract_items", ["estimate_item_id"]),
      this.checkColumns("documents", ["estimate_item_id"]),
      this.checkColumns("daily_intelligence_snapshots", ["company_id", "snapshot_date", "role", "summary", "priorities"]),
      this.checkColumns("daily_intelligence_outcomes", ["company_id", "snapshot_id", "outcome"]),
      this.checkColumns("construction_field_captures", ["company_id", "captured_by", "source_text", "parsed", "status"]),
      this.checkColumns("construction_intelligence_events", ["company_id", "event_type", "severity", "evidence", "metadata"]),
      this.checkColumns("construction_evidence_items", ["company_id", "project_id", "source_type", "evidence_type", "occurred_at"]),
      this.checkColumns("construction_evidence_packs", ["company_id", "project_id", "pack_type", "payload"]),
      this.checkColumns("construction_network_participants", ["company_id", "project_id", "user_id", "network_type", "status"]),
      this.checkColumns("construction_network_submissions", ["company_id", "project_id", "participant_id", "submission_type", "status"]),
      this.checkColumns("construction_network_commercial_exchanges", ["company_id", "project_id", "participant_id", "exchange_type", "amount", "status"]),
      this.checkColumns("construction_reality_observations", ["company_id", "project_id", "observation_type", "captured_by", "status"]),
      this.checkColumns("construction_drawing_impacts", ["company_id", "project_id", "drawing_id", "revision_id", "impact_type", "severity"]),
      this.checkColumns("construction_reality_markers", ["company_id", "project_id", "marker_code", "marker_type", "active"]),
      this.checkColumns("construction_asbuilt_verifications", ["company_id", "project_id", "reference_type", "verification_status", "evidence_ids"]),
      this.checkColumns("financial_intelligence_snapshots", ["company_id", "project_id", "created_by", "data", "created_at"], "20261006140000_v5_4_financial_intelligence.sql"),
      this.checkColumns("construction_tender_opportunities", ["company_id", "name", "status", "intelligence"], "20261006150000_v5_5_construction_lifecycle_intelligence.sql"),
      this.checkColumns("construction_lifecycle_items", ["company_id", "project_id", "item_type", "status", "due_date"], "20261006150000_v5_5_construction_lifecycle_intelligence.sql"),
      this.checkColumns("projects", ["construction_type"], "20261006160000_v5_6_construction_type_profiles.sql"),
      this.checkColumns("company_invitations", ["revoked_by","revoked_at","revocation_reason"], "20261006170000_v5_6_1_access_lifecycle.sql"),
      this.checkColumns("company_members", ["access_suspended_by","access_suspended_at","access_suspension_reason"], "20261006170000_v5_6_1_access_lifecycle.sql"),
      this.checkColumns("company_access_lifecycle_events", ["id","company_id","action","reason","actor_user_id","created_at"], "20261006170000_v5_6_1_access_lifecycle.sql"),
      this.checkColumns("construction_warranties", ["company_id", "project_id", "start_date", "end_date", "status"], "20261006150000_v5_5_construction_lifecycle_intelligence.sql"),
      this.checkColumns("construction_project_lessons", ["company_id", "project_id", "category", "lesson", "reusable"], "20261006150000_v5_5_construction_lifecycle_intelligence.sql"),
      this.checkColumns("construction_benchmark_snapshots", ["company_id", "metric_key", "value", "sample_size"], "20261006150000_v5_5_construction_lifecycle_intelligence.sql")
    ]);
    const schema = schemaChecks.reduce((all, item) => ({ ...all, [item.table]: item }), {});
    const schemaReady = schemaChecks.every(item => item.ok);

    return {
      ready: supabase.connected && schemaReady,
      checks: { supabase, schema },
      timestamp: new Date().toISOString()
    };
  }

  async checkColumns(table, columns, migration = "20261005060000_v4_3_2_field_schema_repair.sql") {
    const { error } = await this.supabase.from(table).select(columns.join(",")).limit(0);
    if (!error) return { table, ok: true, columns };
    return {
      table,
      ok: false,
      columns,
      error: error.message,
      code: "SCHEMA_MISMATCH",
      migration
    };
  }

  async checkSupabase() {
    const started = Date.now();
    const { error } = await this.supabase
      .from("hysmart_system_health")
      .select("id")
      .limit(1);

    if (error) {
      return {
        connected: false,
        latencyMs: Date.now() - started,
        error: error.message
      };
    }

    return {
      connected: true,
      latencyMs: Date.now() - started
    };
  }
}
