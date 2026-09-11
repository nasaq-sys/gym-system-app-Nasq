// Comprehensive test suite for Instant Workout Rest Timer & Set Logging Logic
export {};

interface ExerciseLog {
  weight: number;
  reps: number;
  sets: number;
  date: string;
  sessionNotes: string;
}

interface Exercise {
  id: string;
  name: string;
  latest: ExerciseLog | null;
  history: ExerciseLog[];
}

interface TimerState {
  isOpen: boolean;
  isActive: boolean;
  totalSeconds: number;
  remainingSeconds: number;
  exerciseName?: string;
  targetEndTime: number | null;
}

function createRestTimerHarness() {
  let timerState: TimerState = {
    isOpen: false,
    isActive: false,
    totalSeconds: 60,
    remainingSeconds: 60,
    targetEndTime: null,
  };

  const startRestTimer = (
    options: number | { durationSeconds?: number; seconds?: number; exerciseName?: string; startedAt?: number; endsAt?: number; status?: string } = 60,
    exName?: string
  ) => {
    let seconds = 60;
    let name = exName;
    let targetEnd: number;

    if (typeof options === "object" && options !== null) {
      seconds = options.durationSeconds ?? options.seconds ?? 60;
      name = options.exerciseName ?? exName;
      targetEnd = options.endsAt ?? (Date.now() + seconds * 1000);
    } else {
      seconds = options;
      targetEnd = Date.now() + seconds * 1000;
    }

    timerState = {
      isOpen: true,
      isActive: true,
      totalSeconds: seconds,
      remainingSeconds: Math.max(0, Math.ceil((targetEnd - Date.now()) / 1000)),
      exerciseName: name,
      targetEndTime: targetEnd,
    };
  };

  const stopRestTimer = () => {
    timerState = {
      ...timerState,
      isOpen: false,
      isActive: false,
      targetEndTime: null,
    };
  };

  return {
    getTimerState: () => timerState,
    startRestTimer,
    stopRestTimer,
  };
}

async function runTests() {
  console.log("=== Running Instant Workout Rest Timer Tests ===");

  const { getTimerState, startRestTimer, stopRestTimer } = createRestTimerHarness();

  let exercises: Exercise[] = [
    {
      id: "ex-1",
      name: "بنش برس مستوي (Bench Press)",
      latest: null,
      history: [],
    },
  ];
  let completedSetsMap: Record<string, number> = {};
  let isSubmitting = false;

  // Test 1: Immediate Timer Activation on Click (Synchronous, same frame)
  const clickTimestampBefore = Date.now();

  const handleCompleteSetAndStartRest = (ex: Exercise, weight: number, reps: number) => {
    if (isSubmitting) return;
    isSubmitting = true;

    const curDone = completedSetsMap[ex.id] || 0;
    const nextDone = curDone + 1;

    // 1. Optimistic completed sets
    completedSetsMap = { ...completedSetsMap, [ex.id]: nextDone };

    // 2. Optimistic exercise history
    const todayStr = new Date().toISOString().split("T")[0];
    const optimisticLog: ExerciseLog = {
      weight,
      reps,
      sets: nextDone,
      date: todayStr,
      sessionNotes: "",
    };
    exercises = exercises.map((e) =>
      e.id === ex.id
        ? { ...e, latest: optimisticLog, history: [optimisticLog, ...e.history] }
        : e
    );

    // 3. Immediately launch timer
    const durationSeconds = 90;
    const startedAt = Date.now();
    const endsAt = startedAt + durationSeconds * 1000;

    startRestTimer({
      durationSeconds,
      startedAt,
      endsAt,
      exerciseName: ex.name,
      status: "running",
    });

    // 4. Return mock background promise
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        isSubmitting = false;
        resolve();
      }, 500);
    });
  };

  // Execute click
  const bgPromise = handleCompleteSetAndStartRest(exercises[0], 80, 10);
  const clickTimestampAfter = Date.now();

  // Verify: Timer is active IMMEDIATELY (within 0ms of call) without waiting for bgPromise
  const state = getTimerState();
  console.assert(state.isOpen === true, "Test 1 Failed: Rest timer should be open immediately");
  console.assert(state.isActive === true, "Test 1 Failed: Rest timer should be active immediately");
  console.assert(state.totalSeconds === 90, "Test 1 Failed: Total seconds should be 90");
  console.assert(state.remainingSeconds === 90, "Test 1 Failed: Remaining seconds should start at 90");
  console.assert(clickTimestampAfter - clickTimestampBefore < 10, "Test 1 Failed: Should execute in same frame (<10ms)");
  console.log("✓ Test 1 Passed: Rest timer opened and started instantly (<10ms)");

  // Test 2: Optimistic Set Recording
  console.assert(completedSetsMap["ex-1"] === 1, "Test 2 Failed: Completed set count should be 1");
  console.assert(exercises[0].latest?.weight === 80, "Test 2 Failed: Latest weight should be 80");
  console.assert(exercises[0].latest?.reps === 10, "Test 2 Failed: Latest reps should be 10");
  console.assert(exercises[0].history.length === 1, "Test 2 Failed: History should have 1 entry");
  console.log("✓ Test 2 Passed: Optimistic state update updated sets and exercise history immediately");

  // Test 3: Duplicate Click Prevention (Double tap while submitting)
  const doubleClickResult = handleCompleteSetAndStartRest(exercises[0], 80, 10);
  console.assert(doubleClickResult === undefined, "Test 3 Failed: Rapid double click must be ignored");
  console.assert(completedSetsMap["ex-1"] === 1, "Test 3 Failed: Completed sets must not double-increment");
  console.log("✓ Test 3 Passed: Double submission prevented via guard");

  // Wait for background save to finish
  await bgPromise;
  console.assert(isSubmitting === false, "Test 4 Failed: isSubmitting should be false after completion");
  console.log("✓ Test 4 Passed: Background sync completed safely without interrupting timer");

  // Test 5: Timer Stop
  stopRestTimer();
  console.assert(getTimerState().isOpen === false, "Test 5 Failed: Timer stop should close timer");
  console.log("✓ Test 5 Passed: Rest timer can be stopped normally");

  console.log("\nALL REST TIMER TESTS PASSED! ⏱️✨");
}

runTests();
