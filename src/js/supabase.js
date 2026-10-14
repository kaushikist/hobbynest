// HobbyNest - Supabase client
// This is the publishable/browser key. Never put a Supabase service-role key here.
const SUPABASE_URL = "https://jrxlhqxphtnhtugaetfw.supabase.co";
const SUPABASE_KEY = "sb_publishable_UWoPMJOgkulQFw_9sOOPNQ_KuMSnOWV";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);
