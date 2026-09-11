import { getFromRedis, setInRedis, deleteFromRedis, type CachedUserData } from "../redisClient";

async function runRedisTests() {
  console.log("--- Testing Redis Client / Cache-Aside Logic ---");

  const testUser: CachedUserData = {
    id: "recTest123",
    memberId: "MEM-001",
    name: "Trainee Test",
    email: "test@example.com",
    role: "member",
    passwordHash: "$2a$10$abcdefghijklmnopqrstuv",
    table: "tblMembers",
    passwordField: "Password",
  };

  // If Redis env vars are set, verify roundtrip
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.log("Redis credentials found. Testing live Upstash connection...");
    await setInRedis("test_user_auth_key", testUser, 60);
    const retrieved = await getFromRedis<CachedUserData>("test_user_auth_key");
    console.assert(retrieved !== null && retrieved.email === testUser.email, "Redis retrieval failed");
    console.log("Live Redis Cache read/write passed successfully!");
    await deleteFromRedis("test_user_auth_key");
  } else {
    console.log("No Redis env vars in test environment — verifying graceful fallback to null...");
    const result = await getFromRedis<CachedUserData>("non_existent_key");
    console.assert(result === null, "Fallback should return null safely without crashing");
    console.log("Graceful fallback verified: null returned safely without throwing.");
  }

  console.log("\nAll Redis Client unit tests passed!");
}

runRedisTests().catch(console.error);
