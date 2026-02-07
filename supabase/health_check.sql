-- ============================================================
-- SESSIZ ORTAK - SYSTEM HEALTH CHECK QUERIES
-- Run these manually in Supabase SQL Editor or via cron
-- ============================================================


-- ============================================================
-- 1. STUCK QUEUE ENTRIES (waiting but expired)
-- Expected: 0 rows (cleanup should handle these)
-- ============================================================
SELECT id, user_id, duration, status, expires_at,
  NOW() - expires_at AS expired_ago
FROM matching_queue
WHERE status = 'waiting' AND expires_at < NOW()
ORDER BY expires_at ASC;


-- ============================================================
-- 2. ORPHANED MATCHES (preparing > 10 minutes)
-- Expected: 0 rows
-- ============================================================
SELECT id, session_id, user_a_id, user_b_id, state,
  NOW() - created_at AS age
FROM matches
WHERE state = 'preparing'
  AND created_at < NOW() - INTERVAL '10 minutes'
ORDER BY created_at ASC;


-- ============================================================
-- 3. STUCK SESSIONS (waiting/preparing > 5 minutes)
-- Expected: 0 rows
-- ============================================================
SELECT id, mode, status, duration,
  NOW() - created_at AS age
FROM sessions
WHERE status IN ('waiting', 'preparing')
  AND created_at < NOW() - INTERVAL '5 minutes'
ORDER BY created_at ASC;


-- ============================================================
-- 4. ORPHANED PARTICIPANTS (no matching session)
-- Expected: 0 rows
-- ============================================================
SELECT sp.id, sp.session_id, sp.user_id, sp.status
FROM session_participants sp
LEFT JOIN sessions s ON sp.session_id = s.id
WHERE s.id IS NULL;


-- ============================================================
-- 5. MISMATCHED TRUST LEVELS
-- Expected: 0 rows
-- ============================================================
SELECT id, name, trust_score, trust_level,
  CASE
    WHEN trust_score >= 150 THEN 'legend'
    WHEN trust_score >= 120 THEN 'elite'
    WHEN trust_score >= 90 THEN 'verified'
    WHEN trust_score >= 70 THEN 'trusted'
    WHEN trust_score >= 50 THEN 'newbie'
    ELSE 'restricted'
  END AS expected_level
FROM users
WHERE trust_level != CASE
  WHEN trust_score >= 150 THEN 'legend'
  WHEN trust_score >= 120 THEN 'elite'
  WHEN trust_score >= 90 THEN 'verified'
  WHEN trust_score >= 70 THEN 'trusted'
  WHEN trust_score >= 50 THEN 'newbie'
  ELSE 'restricted'
END;


-- ============================================================
-- 6. DAILY SESSION HEALTH (last 7 days)
-- ============================================================
SELECT
  DATE(created_at) AS day,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed,
  COUNT(*) FILTER (WHERE status = 'abandoned') AS abandoned,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / NULLIF(COUNT(*), 0), 1) AS completion_rate
FROM sessions
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY day DESC;


-- ============================================================
-- 7. TRUST CHANGE DISTRIBUTION (last 7 days)
-- ============================================================
SELECT
  event_type,
  COUNT(*) AS occurrences,
  SUM(score_change) AS total_change,
  ROUND(AVG(score_change)::NUMERIC, 2) AS avg_change
FROM trust_events
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY event_type
ORDER BY occurrences DESC;


-- ============================================================
-- 8. EARLY EXIT REPEAT OFFENDERS (3+ in 7 days)
-- ============================================================
SELECT
  user_id,
  COUNT(*) AS early_exits,
  SUM(score_change) AS total_penalty
FROM trust_events
WHERE event_type LIKE 'early_exit%'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY user_id
HAVING COUNT(*) >= 3
ORDER BY early_exits DESC;


-- ============================================================
-- 9. DIMINISHING REWARDS HIT (last 7 days)
-- ============================================================
SELECT
  user_id,
  COUNT(*) AS diminished_events
FROM trust_events
WHERE metadata->>'diminished' = 'true'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY user_id
ORDER BY diminished_events DESC;


-- ============================================================
-- 10. MATCH LIFECYCLE HEALTH (last 7 days)
-- ============================================================
SELECT
  state,
  COUNT(*) AS count,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at)))::INT AS avg_duration_s
FROM matches
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY state
ORDER BY count DESC;


-- ============================================================
-- 11. RUN SYSTEM CLEANUP
-- Call this manually or via pg_cron
-- ============================================================
-- SELECT * FROM system_cleanup();
