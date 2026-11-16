/* The Supabase connection. The anon key is designed to be public, so it is safe here.
   Never paste the service_role key into this file. */
window.CONCIT_CONFIG = {
  url: "https://hwjpklsxobhzqyvzqkza.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3anBrbHN4b2JoenF5dnpxa3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2NDc3OTgsImV4cCI6MjEwOTIyMzc5OH0.n5kqOGbHHfMZXWMvSQFeRhDtEFU15bysWoKzBpbVMDo",
  /* Public half of the notification signing key. The private half is only in Vercel (VAPID_PRIVATE_KEY). */
  vapidKey: "BFf5RH9-jFH6MgxNabuuPUJHwSvFhxBD0FLYsouZ0f-Z1Fy5X5du0V_fLA5OELJlf3fe_8dgKhQI_ZclXfyV38c"
};
