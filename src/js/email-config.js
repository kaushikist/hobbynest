// HobbyNest - EMAIL SETTINGS (optional)
// ---------------------------------------------------------------------------
// Leave everything empty and the app still works: registration, verification,
// account deletion and messages all work and show their notices on screen.
// Fill in EmailJS (free, ~5 minutes, no coding) to ALSO send:
//   • a "Welcome — your registration is complete" email
//   • a "Your account has been deleted" email
// Step-by-step: SUPABASE-SETUP.txt → "STEP 4 (optional): emails".
// These are public keys — they are meant to be in browser code.
// ---------------------------------------------------------------------------
window.HN_EMAIL = {
    emailjs: {
        publicKey: "",    // EmailJS → Account → General → Public Key
        serviceId: "",    // EmailJS → Email Services → your Gmail service, e.g. "service_ab12cd3"
        templateId: ""    // EmailJS → Email Templates → your template, e.g. "template_xy98zt7"
    },

    // ADVANCED (developers only): set to true after deploying the Supabase Edge
    // Functions in supabase/functions with the Supabase CLI (see README). Adds
    // emails for new messages and live sessions, and photo clean-up on deletion.
    edgeFunctions: false
};
