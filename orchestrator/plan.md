
  Prompt 1: Fix Analytics Data Accuracy & Performance
  Goal: Fix the logic that hides new chat data and improve query performance.

  > Files involved: src/app/api/admin/analytics/route.ts
  >
  > Instructions:
  > 1. Reverse Legacy Priority: Currently, the API sets useLegacy = true if the chat_sessions table has any rows. Change this so it only uses legacy data if the new messages table is empty. This ensures recent activity is shown.
  > 2. Add Missing Answer Modes: The analytics breakdown is missing several modes. Update the queries to include not_found, casual, cache, relational, and diagram_stored. Map casual and not_found into the "Fallback" or "General" count to ensure the total  
  breakdown matches the overall conversation count.
  > 3. Optimize Counts: Replace memory-heavy queries that fetch all rows from hms_knowledge and token_usage. Use Supabase's .select('*', { count: 'exact', head: true }) for simple totals. For the Knowledge Base composition, implement a loop or a more      
  efficient grouping logic so we aren't pulling thousands of rows just to count them in JavaScript.
  > 4. Fix Total Calculation: Ensure totalChats accurately reflects the sum of all message types in the current active system (Legacy vs. New) rather than prioritizing the old table.

  ---

  Prompt 2: Align Admin Authorization Guard
  Goal: Eliminate the discrepancy between frontend and backend admin checks.

  > Files involved: src/lib/auth.ts, src/lib/admin-auth.ts
  >
  > Instructions:
  > 1. Remove Hardcoded Secrets: In src/lib/auth.ts, remove the hardcoded email address aniket.karmakar@seple.in.
  > 2. Unify Validation: Create or use a shared constant/utility isAdminEmail(email) that checks the email against the ALLOWED_ADMIN_EMAILS environment variable.
  > 3. Ensure Consistency: Update src/lib/admin-auth.ts (backend) and the frontend login logic to use this same logic. Ensure that if ALLOWED_ADMIN_EMAILS is a comma-separated list, it is correctly split and trimmed before comparison.

  ---

  Prompt 3: Fix Dashboard Badge Loading & UI Flickering
  Goal: Make pending item badges visible on load and fix the "All caught up" flicker.

  > Files involved: src/app/admin/page.tsx
  >
  > Instructions:
  > 1. Initial Load Fetching: Currently, fetchQuestions and fetchUsers are only called when their specific tab is clicked. Add a useEffect that triggers these fetches once when the component mounts. This ensures the red badges on the "Review" and "Users"  
  tabs are populated immediately.
  > 2. Fix Review Flicker: In the Review tab rendering logic, do not show the "All caught up!" empty state if reviewLoading is true. Only show the empty state when !reviewLoading && questions.length === 0.
  > 3. Badge Visibility: Ensure the badge property in the tab navigation is shown even if the value is 0 if that is preferred, or ensure it transitions smoothly from null to the number once the initial fetch completes.

  ---

  Prompt 4: Clean up Ingest SSE Unwrapping Logic
  Goal: Simplify the brittle streaming logic in the "Train Bot" tab.

  > Files involved: src/app/admin/page.tsx
  >
  > Instructions:
  > 1. Refactor handleIngest: Inside the consumeFetchSse callback, the code currently attempts to manually unwrap a data property from the rawEnvelope.
  > 2. Standardize Payload: Since consumeFetchSse (from src/lib/fetchSse.ts) already handles the EventSource-style parsing, remove the redundant const payload = ... check. Use the event and data parameters directly.
  > 3. Type Safety: Ensure the payload is cast correctly to IngestProgress, IngestResult, or IngestResponse based on the event type (progress, chunk, complete) to prevent runtime type errors.

  ---

  Prompt 5: Add Missing Styles and Animations
  Goal: Fix broken UI elements and missing visual feedback.

  > Files involved: src/app/globals.css, src/app/admin/page.tsx
  >
  > Instructions:
  > 1. Define Shake Animation: Add a standard keyframe animation for animate-shake in src/app/globals.css. It should perform a subtle horizontal shake, used for displaying errors in the skeuomorphic cards.
  > 2. Handle Scrollbar Hiding: The admin navigation uses the class scrollbar-hide. If you cannot add the tailwind-scrollbar-hide plugin to package.json, add a CSS utility in globals.css that targets ::-webkit-scrollbar with display: none for that specific
  class.
  > 3. Fix Tab Grid: Ensure the tab navigation grid (grid-cols-2 md:grid-cols-4) handles overflow correctly on very small mobile screens by adding a horizontal scroll fallback if the brass buttons become too compressed.

  ---

  Prompt 6: Improve RAPTOR Build Error Handling
  Goal: Prevent the dashboard from hanging if a background build fails or is already running.

  > Files involved: src/app/api/admin/raptor/route.ts, src/app/admin/page.tsx
  >
  > Instructions:
  > 1. Backend Conflict Check: In raptor/route.ts, the code checks for a "running" build. Ensure it also checks the started_at time; if a build has been "running" for more than 30 minutes, treat it as "stalled" and allow a new build to start (or provide a 
  "Reset" option).
  > 2. Handle Unique Constraints: If a build is triggered via POST and a database unique constraint is hit (e.g., raptor_build_log_running_unique_idx), catch the error and return a 409 Conflict status with a clear JSON error message instead of letting it  
  throw a 500.

