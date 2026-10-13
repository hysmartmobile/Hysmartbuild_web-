export class AuthService {
  constructor({ supabase }) { this.supabase = supabase; }

  async getProfile(userId, userMetadata = {}) {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("id,full_name,phone,avatar_url,created_at,updated_at")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;

    // Existing Auth users can predate the profile trigger. The service-role
    // client may safely repair that missing profile without exposing a
    // second public write path.
    const fullName = typeof userMetadata?.full_name === "string"
      ? userMetadata.full_name.trim()
      : "";

    const { data: created, error: createError } = await this.supabase
      .from("profiles")
      .insert({ id: userId, full_name: fullName })
      .select("id,full_name,phone,avatar_url,created_at,updated_at")
      .single();

    if (!createError) return created;

    // A concurrent request may have created the profile between the first
    // read and the insert. Re-read rather than returning a false failure.
    if (createError.code === "23505") {
      const { data: existing, error: retryError } = await this.supabase
        .from("profiles")
        .select("id,full_name,phone,avatar_url,created_at,updated_at")
        .eq("id", userId)
        .maybeSingle();
      if (retryError) throw retryError;
      if (existing) return existing;
    }

    throw createError;
  }
}
