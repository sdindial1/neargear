/**
 * In-memory rate limiting for the Ace AI assistant.
 * Resets on server restart — fine for dev. Upgrade to Redis post-launch.
 */

const USER_HOURLY_LIMIT = 20;
const DAILY_PLATFORM_LIMIT = 16666; // ~$50/day at $0.003/message
const HOUR_MS = 60 * 60 * 1000;

interface UserBucket {
  count: number;
  windowStart: number;
}

const userBuckets: Map<string, UserBucket> = new Map();
const dailyCounter: { date: string; messageCount: number } = {
  date: todayUtc(),
  messageCount: 0,
};

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function checkUserLimit(userId: string): {
  allowed: boolean;
  remaining: number;
} {
  const now = Date.now();
  let bucket = userBuckets.get(userId);
  if (!bucket || now - bucket.windowStart > HOUR_MS) {
    bucket = { count: 0, windowStart: now };
    userBuckets.set(userId, bucket);
  }
  if (bucket.count >= USER_HOURLY_LIMIT) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: USER_HOURLY_LIMIT - bucket.count };
}

export function checkDailyLimit(): { allowed: boolean } {
  const today = todayUtc();
  if (dailyCounter.date !== today) {
    dailyCounter.date = today;
    dailyCounter.messageCount = 0;
  }
  return { allowed: dailyCounter.messageCount < DAILY_PLATFORM_LIMIT };
}

export function incrementCounters(userId: string): void {
  const bucket = userBuckets.get(userId);
  if (bucket) bucket.count += 1;
  dailyCounter.messageCount += 1;
}

export const ACE_LIMITS = {
  USER_HOURLY_LIMIT,
  DAILY_PLATFORM_LIMIT,
};
