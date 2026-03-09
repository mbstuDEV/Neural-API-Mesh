import { Request, Response, NextFunction } from 'express';
import { redis } from '../db/client';
import { config } from '../config';
import { PlanTier } from '../types';

const WINDOW_MS = 60_000; // 1 minute

function limitForPlan(plan: PlanTier): number {
  return config.rateLimit[plan] ?? config.rateLimit.free;
}

export async function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const keyId = req.apiKey?.sub;
  const plan = req.apiKey?.plan ?? 'free';

  if (!keyId) return next(); // Auth middleware should have caught this

  const limit = limitForPlan(plan);
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const redisKey = `rl:${keyId}`;

  // Sliding window log via Redis sorted set
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(redisKey, '-inf', windowStart);   // Remove expired entries
  pipeline.zadd(redisKey, now, `${now}-${Math.random()}`);    // Add current request
  pipeline.zcard(redisKey);                                    // Count in window
  pipeline.pexpire(redisKey, WINDOW_MS);                       // Reset TTL

  const results = await pipeline.exec();
  const count = (results?.[2]?.[1] as number) ?? 0;
  const remaining = Math.max(0, limit - count);

  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil((now + WINDOW_MS) / 1000));

  if (count > limit) {
    return res.status(429).json({
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Rate limit exceeded. ${limit} requests/minute on ${plan} plan.`,
      retryAfter: Math.ceil(WINDOW_MS / 1000),
    });
  }

  next();
}
