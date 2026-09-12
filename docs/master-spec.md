Yes. That correction makes sense: the **two-exercise limit is contextual**, not a general limit on how much Bobby can change.

For example, if you're at your normal gym and everything is available, Bobby shouldn't randomly restructure half your workout. If you're traveling to a different gym with substantially different equipment, it can make more changes because the constraint warrants it.

And I like the **estimated fatigue** idea. I'd make it visible but lightweight, e.g. a small indicator on the home screen rather than turning Bobby into a recovery-tracking app.

I have enough now to write the full spec. I’ll treat this as a **personal app for you first**, with clean enough architecture that it could become a broader product later.

# Bobby Bulk — Product & Technical Specification

## 1. Product Definition

**Bobby Bulk is a personal adaptive workout coach.**

The user creates their own training routines and goals. Bobby uses those routines, the user's training history, current context, and evidence-based training principles to recommend what the user should do today.

Bobby can modify the user's routine, but **the user remains in control**.

The core interaction is:

```text id="6xj3xj"
My Routines
      ↓
Today's Context
      ↓
Training History
      ↓
Bobby evaluates
      ↓
Today's Workout Recommendation
      ↓
User accepts / rejects
      ↓
Workout
      ↓
Quick logging
      ↓
History
      ↓
Future recommendations
```

Bobby is **not primarily an AI workout generator**.

The core coaching engine is deterministic and evidence-based.

An LLM may eventually be used to interpret natural-language goals or explain recommendations, but it should not be responsible for the fundamental training decisions.

---

# 2. Product Philosophy

### User owns the program

Bobby should behave like a coach working with an existing athlete, rather than an app that assumes it knows best.

The user can:

* Create routines
* Modify routines
* Reject Bobby's recommendations
* Accept Bobby's changes
* Express preferences through their behavior
* Choose today's gym
* Refuse a benchmark
* Continue an exercise even when Bobby recommends changing it

Bobby should adapt to the user rather than force the user into a rigid system.

### Don't change things just to change them

If an exercise is producing consistent progress, Bobby should generally leave it alone.

Variation should be recommended when there is an actual reason, such as:

* Plateau
* Persistent regression
* Excessive fatigue
* Goal change
* Poor exercise fit
* Equipment constraint
* User preference
* Evidence suggesting a modification is appropriate

**Time alone should not trigger exercise rotation.**

---

# 3. Core Hierarchy

```text id="3t4p5c"
Program
  ↓
Split
  ↓
Workout
  ↓
Exercise
  ↓
Set
```

Example:

```text id="2i0f6q"
PPL
├── Push
│   ├── Bench Press
│   ├── Incline DB Bench
│   ├── Cable Fly
│   ├── Lateral Raise
│   └── Triceps Pushdown
│
├── Pull
│   ├── Pull-up
│   ├── Row
│   └── ...
│
└── Legs
    └── ...
```

---

# 4. User Routines

The user should be able to create and maintain:

* Programs
* Splits
* Workouts
* Exercises
* Sets
* Rep ranges
* Target volume
* Exercise ordering

The user-created routine is the **baseline** Bobby evaluates.

Bobby should not silently rewrite it.

---

# 5. Today's Recommendation

When the user opens Bobby, the home screen should present a recommended workout.

## Planning authority

Bobby supports two deliberately distinct modes:

* **Recommended Workout:** Bobby has planning authority. It can construct a
  complete, executable session without an existing plan or split, using goals,
  ordered muscle priorities, recent direct working-set history, training state,
  exercise preferences, available equipment, and today's time/context. Explicit
  muscle priorities refine and take precedence over goal-derived defaults. The
  generated workout is temporary: it does not silently create or modify a
  user-owned plan.
* **My Plans:** the user has planning authority. A saved plan remains the
  baseline structure; Bobby may adapt it for today's context and propose
  explainable recommendations. It changes only when the user explicitly accepts
  a supported recommendation.

Recommended Workout first selects appropriately recovered muscle opportunities,
then selects compatible exercises and working-set prescriptions from the normal
exercise catalog. It can operate with zero plans and no split. Split evaluation
continues to assess user-owned recurring structure; automatic split generation
is outside this scope.

Example:

> ## Today's Recommendation
>
> ### Push
>
> Based on your PPL split, recent training, and performance.
>
> **Changes**
>
> * Incline DB Bench: +5 lb
> * Cable Fly: replace with Pec Deck
>
> **Estimated fatigue:** Low
>
> [Start Workout] [Review Changes] [Choose Something Else]

The recommendation should be reasonably detailed when space permits.

If the UI becomes crowded, it can collapse the reasoning into a more compact presentation.

---

# 6. Workout Selection

Bobby should primarily use the user's **split** to determine what workout should be recommended.

For example:

```text id="5yq1kn"
Push
Pull
Legs
Push
Pull
???
```

Bobby would normally recommend Legs.

However, the split is **not absolute**.

Bobby can consider:

* Recent workout history
* Recovery/fatigue
* Performance
* Training frequency
* Muscle-group frequency
* Goals
* Missed/skipped workouts
* Other contextual information

If the split appears to be consistently producing poor results, Bobby can eventually recommend changing the split itself.

Example:

> **I think we should reconsider your PPL split.**
>
> Your second weekly exposure is consistently occurring while fatigued and performance is repeatedly declining.
>
> Consider an alternative structure.
>
> [Keep PPL] [Review Alternative]

Bobby should recommend this rather than automatically changing the program.

---

# 7. Rejecting Recommendations

Recommendations are **proposals**.

The user can reject them.

For example:

> Bobby recommends Push.

User says:

> "Actually, I want Pull."

Bobby should show the reasoning behind its recommendation where useful, but ultimately allow the user to choose.

The selected workout should then become the workout being performed.

---

# 8. Routine Changes

Bobby can recommend changes to the actual routine.

Example:

> **Replace Cable Fly → Pec Deck**
>
> Your recent performance suggests Cable Fly is no longer progressing well.
>
> Pec Deck may provide a better option given your current goals and training history.
>
> [Accept Change] [Keep Cable Fly]

If the user accepts:

```text id="9p6xpg"
Permanent Routine
Cable Fly
     ↓
Pec Deck
```

The underlying routine is actually modified.

If rejected:

* Keep Cable Fly
* Record the rejection
* Increase the likelihood that Cable Fly is preferred
* Do **not** permanently prohibit Bobby from recommending a future change

---

# 9. User Preferences

Preferences should be learned from explicit and implicit feedback.

Example:

```text id="qjnhcf"
Exercise:
Cable Fly

Preference:
Preferred
```

But preference should be treated as a **soft weighting**, not a hard rule.

Conceptually:

```text id="6y5s2m"
Preferred
→ Bobby is more likely to retain/recommend it

Neutral
→ no adjustment

Recommend Less
→ Bobby is less likely to select it

Excluded
→ Bobby should generally not select it
```

A rejected recommendation can influence these preferences.

---

# 10. Today's Context

Today's context describes what is different **today**.

Possible inputs:

* Gym
* Available equipment
* Equipment temporarily unavailable
* Available weights
* Available time
* Other temporary constraints

These should not automatically modify the permanent routine.

---

# 11. Gym Configuration

The user can create gym profiles.

Example:

```text id="v0b2tm"
UCLA Gym
```

A gym can have broad characteristics such as:

* Dumbbells
* Barbells
* Cables
* Machines
* Benches
* Pull-up equipment
* etc.

The user should **not need to enumerate every individual machine**.

The purpose of gym configuration is to establish a general equipment environment.

---

# 12. Temporary Equipment Problems

Inside today's workout, the user can indicate that a piece of equipment is unavailable.

Example:

> Cable machine unavailable.

Bobby can immediately adapt the affected exercise.

This is preferable to requiring the user to maintain a detailed database of every machine at every gym.

---

# 13. Equipment Adaptation

Bobby should automatically substitute exercises when necessary.

Example:

```text id="e4w2xy"
Cable Fly
    ↓
Cable unavailable
    ↓
Candidate exercises
    ↓
Evaluate:
  muscle similarity
  movement pattern
  equipment
  preference
  history
    ↓
Pec Deck
```

The recommendation should preserve the intent of the original exercise whenever possible.

---

# 14. Contextual Change Limit

The earlier "two exercise changes" rule is specifically for situations where the **environment is otherwise normal**.

If you're at the same gym and the same equipment is available:

> Bobby should generally avoid unnecessarily restructuring the entire workout.

A reasonable default is:

**Maximum ~2 exercise substitutions/modifications from equipment/context adaptation.**

This is not a hard universal limit.

If the context genuinely warrants more changes—for example, you're traveling to a gym with completely different equipment—Bobby may exceed it.

The principle is:

> **Don't unnecessarily disrupt a working workout when the user's normal environment is available.**

---

# 15. Available Weights

Bobby should know available loading increments where useful.

Example:

```text id="w7t9by"
Dumbbells:
20
25
30
35
40
45
50
55
60
65
70
```

Recommendations must respect real available loads.

Bobby should not recommend:

> 67.5 lb

if that isn't available.

---

# 16. Time Constraints

The user can specify today's available workout time.

Example:

```text id="f5f31e"
Normal workout:
60 minutes

Today:
35 minutes
```

Bobby should adapt the existing workout.

Possible actions:

* Reduce sets
* Remove lower-priority exercises
* Superset compatible exercises
* Reorder exercises
* Preserve important compound movements
* Preserve goal-critical exercises

It should not simply generate a completely unrelated 35-minute workout.

---

# 17. Goals

Initial goals should be structured and simple.

Example:

### Goals

☐ Hypertrophy
☐ Strength
☐ General fitness
☐ Athletic performance

Multiple goals can be selected.

The user can also specify **priority muscles**.

Example:

> **Priority muscles**
>
> ☑ Upper chest
> ☑ Shoulders
> ☐ Arms
> ☐ Back
> ☐ Legs

Bobby uses these to influence recommendations.

### Ordered, partial muscle priorities

Priority muscles are an ordered partial ranking: the first selected muscle is
the highest priority, the second is next, and muscles not selected remain in
an implicit lower-priority group. Users never need to rank every muscle.

Goals can provide default priorities. For example, **Aesthetic physique**
defaults to side delts, lats, upper chest, abs, biceps, rear delts, and mid
back. Explicit user priorities always lead this list in their selected order;
remaining non-duplicated defaults fill in the rest.

The resolved priority order is shared by plan, split, and workout evaluation.
It guides—not overrides—recovery, available training days, working volume, and
session constraints:

* Higher priorities generally receive more practical direct exposures and a
  larger share of productive direct volume.
* The highest priority can target about three weekly opportunities when the
  split supports it; lower priorities commonly target fewer. These are bounded
  opportunities, not universal frequency requirements.
* Splits are evaluated first for whether their frequency and direct volume
  express the priority order. Bobby only suggests redistribution when the
  mismatch is material.
* Within a workout, a priority muscle's main productive work should generally
  receive fresher placement before lower-priority competing work when safety,
  technique, compounds, supersets, and fatigue management allow.

### Goal-to-split alignment

Goals establish desired outcomes, and explicit priorities refine them. The
saved split then establishes recurring direct training opportunities. Before
trying to repeatedly compensate inside individual workouts, Bobby evaluates
whether the split gives each resolved priority a practical, reasonably
distributed number of direct opportunities relative to the available split
entries. These are bounded targets, not exact required frequencies.

When a material gap or concentrated opportunity pattern is found, Bobby can
surface an advisory split-alignment recommendation explaining the affected
priority and the structural issue. Bobby never silently rewrites a split,
switches a program, or uses repeated exercise additions as a permanent
substitute for a structurally inadequate split. Actual completed history may
later be compared with these planned opportunities without changing this
planned-split assessment.

Warm-up, drop, and failure sets are not substituted for productive direct
working sets in this priority logic. Priority never overrides recovery or turns
one poor session into a programming change.

---

# 18. Future Natural-Language Goals

Later, an LLM can interpret a free-form goal.

Example:

> "I want to look bigger up top but still maintain my climbing strength."

The LLM could translate that into structured goals such as:

```text id="9t3v7j"
Hypertrophy: high
Upper-body emphasis: high
Chest: priority
Shoulders: priority
Strength maintenance: high
```

But the resulting structured goals should be passed into the deterministic Bobby engine.

The LLM should not directly decide the workout.

---

# 19. Evidence-Based Training Knowledge

Bobby needs a structured training knowledge base derived from professional/evidence-based sources.

Architecture:

```text id="fpgm2h"
Professional Sources
       ↓
Training Knowledge
       ↓
Training Principles
       ↓
Decision Rules
       ↓
Bobby
```

The knowledge base should distinguish between:

* Strong evidence
* Moderate evidence
* Limited evidence
* Practical coaching heuristics
* Personal evidence

---

# 20. Training Principle Model

```ts id="2e4r1z"
type TrainingPrinciple = {
  id: string;
  topic: string;

  description: string;

  applicableGoals: Goal[];

  preconditions?: Condition[];

  decisionRule: RuleDefinition;

  exceptions?: Condition[];

  evidenceLevel:
    | "A"
    | "B"
    | "C"
    | "D"
    | "PERSONAL";

  source: Source;

  sourceDate?: string;

  notes?: string;
};
```

---

# 21. Training Variation Principle

Bobby should explicitly encode the idea of adaptation/variation without turning it into a simplistic rule.

Bad rule:

```text id="1e7grj"
Every 8 weeks → change exercises
```

Instead:

> Training adaptation occurs, but continued progress does not inherently require frequent exercise rotation.

Variation can become appropriate when:

* Progress stalls
* Performance regresses
* Fatigue becomes problematic
* Goals change
* Exercise fit becomes poor
* A different stimulus is useful
* User preferences warrant it

Therefore:

**Time alone should not cause Bobby to change an exercise.**

---

# 22. Personal Evidence Takes Priority

This is a major design principle.

Bobby should trust **the user's actual training history** over generic assumptions when appropriate.

For example:

If general advice suggests an exercise variation might be useful, but the user has:

```text id="6g2wrr"
6 months
↑ consistent performance
↑ strength
↑ hypertrophy indicators
```

Bobby should not change the exercise merely because a generic programming convention says to rotate it.

The system should prioritize:

```text id="t6y4p4"
Evidence
+
Personal history
+
Current context
```

with actual personal results receiving significant weight.

---

# 23. Feature Calculation

Raw history becomes structured features.

Examples:

* Recent reps
* Recent load
* Estimated 1RM
* Volume
* Frequency
* Progression rate
* Consecutive stalls
* Muscle-group volume
* Exercise frequency
* Time since training
* Recent performance deviation
* Workout duration
* RIR/RPE where available

---

# 24. Fatigue System

Bobby should maintain an **under-the-hood fatigue state**.

The user doesn't need to manually maintain a complicated recovery system.

Potential inputs:

* Recent training
* Muscle-group training frequency
* Recent volume
* Performance changes
* RIR/RPE
* Time since training
* Repeated high-effort sessions
* Recent unusually poor performance

Output:

```text id="h3s0p4"
Estimated fatigue:
Low
Moderate
High
```

The home screen can show this unobtrusively.

Example:

> **Estimated fatigue: Moderate**

The fatigue model should influence recommendations but should not pretend to know the user's exact physiological recovery state.

---

# 25. Performance Anomalies

If the user performs unusually poorly:

Normal:

```text id="s0v6de"
70 × 10
70 × 10
70 × 9
```

Today:

```text id="l9i4tj"
70 × 7
70 × 6
70 × 6
```

Bobby should **not immediately conclude that the exercise is failing**.

It records the performance and considers possible fatigue/recovery explanations afterward.

That session should receive **less weight when evaluating long-term trends**.

This prevents one bad day from causing unnecessary programming changes.

---

# 26. Post-Workout Analysis

The user does not need to interact with Bobby during the workout beyond logging.

Afterward, Bobby can analyze the session.

For example:

> **Workout complete**
>
> Your Incline DB Bench performance was below your recent average today. I've marked this session as a possible fatigue-affected session, so I won't treat it as a strong signal of a plateau.

This keeps the actual workout experience clean.

---

# 27. Strength Benchmarks

Bobby should periodically conduct standardized strength benchmarks.

They should be integrated into normal workouts rather than requiring separate testing days.

Examples:

```text id="k6z8dw"
Push Day
→ Bench Press benchmark

Pull Day
→ Pull-up benchmark

Leg Day
→ Squat benchmark
```

Bobby should explicitly tell the user:

> **Strength benchmark today**

The user can decline:

> **[Skip Test]**

If declined, Bobby should not treat that as a negative result.

---

# 28. Benchmark Frequency

Benchmarks should **not occur frequently**.

The exact frequency should eventually be informed by training practice and evidence.

The system should treat benchmarks as periodic measurements rather than regular workout sets.

Their purpose is to help Bobby determine:

* Actual strength progression
* Whether perceived effort matches performance
* Whether apparent plateaus are real
* Whether the training program is producing measurable results

---

# 29. Warm-Up vs Working Sets

Sets must explicitly distinguish their purpose.

Example:

```text id="z4cb9e"
Bench Press

Warm-up
45 × 10
65 × 5

Working
95 × 8
95 × 8
95 × 7
```

At minimum:

```text id="r8y4sx"
Warm-up
Working
```

should be supported.

Eventually:

* Drop
* Failure
* Other

can be supported.

Warm-up sets should not be treated as equivalent to working sets when calculating training volume or progression.

---

# 30. Workout UI

The workout screen should be heavily inspired by the usability of **Hevy**, since the desired interaction is similar.

The user should see the entire workout.

Example:

> ### DB Bench
>
> Set 1: 65 lb × 10 ✓
> Set 2: 65 lb × 10 ✓
> Set 3: 65 lb × 8 ✓
>
> ### Incline DB Bench
>
> Set 1: 60 lb × 10 ✓
> Set 2: 60 lb × 9 ✓
> Set 3: 60 lb × 8 ✓

The app should pre-populate useful information from the previous workout/recommendation where appropriate.

---

# 31. Workout Logging

Required:

* Weight
* Reps

Optional:

* RIR/RPE
* Time taken

The user should not have to fill out a large form after every set.

Primary interaction:

```text id="czd3ul"
Weight → Reps → Check
```

The goal is:

> **Log a set in seconds.**

---

# 32. No In-Workout Chat

Bobby should not require conversational interaction during the workout.

The user shouldn't need to tell Bobby:

> "This machine is occupied."

through a chat interface every time.

Instead, provide simple controls such as:

> **Equipment unavailable**

or other structured actions.

The workout experience should remain focused on training.

---

# 33. Recommendation Timing

Bobby makes its main recommendations **before the workout**.

During the workout:

* Record what happened.
* Don't constantly second-guess the user.
* Don't interrupt with recommendations after every set.

Afterward:

* Analyze performance.
* Update history.
* Generate future recommendations.

This creates a clean separation:

```text id="w8p4g0"
Before:
Recommendation

During:
Logging

After:
Analysis
```

---

# 34. Decision Engine

The fundamental system is:

```text id="a7i7sj"
Plan
+
Today's Context
+
Goals
+
History
+
Features
+
Training State
+
Evidence-Based Rules
        ↓
Decision Engine
        ↓
Recommendation
```

---

# 35. Recommendation Types

The initial vocabulary:

```text id="t4h4ve"
KEEP
PROGRESS
ADD
REMOVE
REPLACE
MODIFY
```

Examples:

```text id="6n4x5g"
PROGRESS
Incline DB Bench
65 → 70 lb
```

```text id="l4d4a9"
REPLACE
Cable Fly → Pec Deck
```

```text id="4wxj6y"
MODIFY
Cable Fly
3 sets → 2 sets
```

---

# 36. Recommendation Ranking

Multiple rules may apply simultaneously.

Bobby needs to rank recommendations according to:

* Importance
* Evidence strength
* Confidence
* Personal history
* Goal relevance
* Context
* User preferences

For example:

```text id="5x48hd"
High:
Exercise unavailable

Medium:
Progression opportunity

Low:
Optional variation
```

This prevents Bobby from treating every possible improvement as equally important.

---

# 37. Recommendation Traceability

Every significant recommendation should be inspectable.

```text id="2gq7qv"
Recommendation
      ↓
Decision Rule
      ↓
Training Principle
      ↓
Evidence Source
```

Example:

> Increase Incline DB Bench → 70 lb

because:

> All working sets reached the top of the prescribed rep range.

which implements:

> Progressive overload/progression principle.

which is supported by:

> Professional resistance-training guidance.

---

# 38. Deterministic Core

The core engine should not depend on an LLM.

For example:

```ts id="yqbd0r"
if (allWorkingSetsReachedRepMax(exercise)) {
  return PROGRESS;
}
```

But rules should ultimately be represented as structured decision rules rather than a massive collection of disconnected `if` statements.

This allows:

* Unit testing
* Debugging
* Explainability
* Reproducibility
* Evidence traceability

---

# 39. Optional LLM Layer

Eventually:

```text id="wq0f9x"
User
 ↓
LLM
 ↓
Structured intent
 ↓
Bobby Engine
 ↓
Recommendation
```

or:

```text id="5k7v1u"
Bobby Engine
 ↓
Structured recommendation
 ↓
LLM
 ↓
Natural-language explanation
```

The LLM should **not bypass the decision engine**.

---

# 40. History & Analytics

A separate Progress/Insights tab can show:

* Exercise progression
* Estimated 1RM
* PRs
* Volume
* Frequency
* Muscle-group volume
* Workout duration
* Strength benchmarks
* Progress trends
* Consistency

The UI can be inspired by Hevy's approach.

This is useful, but **not the primary Bobby experience**.

The primary experience is:

> **What should I do today?**

---

# 41. Feedback Loop

Bobby should distinguish:

```text id="d7g8kv"
Recommendation
      ↓
Accepted / Rejected
      ↓
Actual Workout
      ↓
Result
      ↓
Future Recommendation
```

This allows Bobby to learn user preferences without machine learning.

For example:

```text id="w3v1xx"
Bobby:
Replace Cable Fly

User:
Reject

→ Cable Fly receives a preference boost
```

But:

```text id="w9u2p1"
Preference ≠ permanent exclusion
```

Bobby can recommend it again if the evidence becomes strong enough.

---

# 42. No Scheduling Initially

Bobby does **not** create a workout calendar or force a schedule.

The user opens the app when they intend to work out.

If scheduling is eventually added, a skipped workout should simply be recorded as:

> **Skipped**

rather than Bobby automatically rearranging the user's entire life/training schedule.

---

# 43. Data Model

Core entities:

```text id="p2g6x4"
User
Goal
Gym
Program
Split
Workout
Exercise
Set
WorkoutSession
TodaysContext
TrainingFeature
TrainingState
TrainingPrinciple
DecisionRule
Recommendation
RecommendationFeedback
Benchmark
```

The most important relationships:

```text id="7q9wce"
Program
 └── Split
      └── Workout
           └── Exercise
                └── Set

WorkoutSession
 └── Workout
      └── Actual Sets

Recommendation
 ├── DecisionRule
 └── TrainingPrinciple
      └── EvidenceSource
```

---

# 44. Current Codebase

Current:

```text id="r6r1jc"
App.tsx
App.css
index.css

models.ts
exercises.ts
templates.ts
progression.ts
storage.ts
seed.ts
schema.sql
progression.test.ts
```

Recommended responsibilities:

### `models.ts`

All domain models/types.

### `exercises.ts`

Exercise database and metadata.

### `templates.ts`

User routines/templates.

### `progression.ts`

Progression rules.

### `knowledge.ts`

Training principles and evidence metadata.

### `rules.ts`

Decision rules.

### `features.ts`

Feature calculations.

### `states.ts`

Training-state calculations.

### `recommendations.ts`

Recommendation generation/ranking.

### `adaptation.ts`

Today's Context adaptation.

### `storage.ts`

Persistence abstraction.

### `seed.ts`

Initial data.

### `schema.sql`

Future SQLite schema.

---

# 45. Persistence

Current:

```text id="8b9q0e"
localStorage
```

Keys:

```text id="v7d4mc"
bobby-bulk-workouts
bobby-bulk-templates
bobby-bulk-plans
```

SQLite remains the eventual migration target.

---

# 46. Recommended Development Order

### Phase 1 — Core data model

Build:

```text
Program
→ Split
→ Workout
→ Exercise
→ Set
```

without breaking the existing application.

### Phase 2 — Better workout logging

Implement:

* Warm-up sets
* Working sets
* Weight
* Reps
* Optional RIR/RPE
* Optional duration
* Fast set completion UI

### Phase 3 — Goals

Implement:

* Multiple goals
* Priority muscles

### Phase 4 — Gym / Today's Context

Implement:

* Gym profiles
* Equipment categories
* Today's gym
* Temporary unavailable equipment
* Available weights
* Time limit

### Phase 5 — Exercise intelligence

Implement:

* Movement patterns
* Muscle regions
* Exercise similarity
* Replacement relationships
* Preferences

### Phase 6 — Training knowledge base

Build the actual evidence-backed principles.

This should happen **before sophisticated Bobby logic**.

### Phase 7 — Feature engine

```text
History
→ Features
```

### Phase 8 — Fatigue/state engine

```text
Features
→ Training State
```

Keep fatigue primarily under the hood.

### Phase 9 — Decision engine

```text
Plan
+ Context
+ History
+ Goals
+ State
+ Evidence
→ Recommendation
```

### Phase 10 — Today's adaptation

Handle:

* Equipment
* Weight availability
* Time
* Temporary constraints

### Phase 11 — Recommendation feedback

Implement:

* Accept
* Reject
* Preference adjustment
* Actual execution

### Phase 12 — Benchmarks

Integrate periodic strength tests into relevant workouts.

### Phase 13 — Split evaluation

Evaluate whether the split expresses the resolved goal and muscle-priority
order through practical direct frequency, volume distribution, recovery, and
fresh work. Suggest redistribution only when a material mismatch is present.

### Phase 14 — Analytics

Build the Progress/Insights tab.

### Phase 15 — Optional LLM

Add:

* Natural-language goals
* Conversational queries
* Better explanations

---

# 47. The Core Bobby Loop

The entire product can ultimately be summarized as:

```text id="9j7s2b"
             ┌──────────────────────┐
             │   MY TRAINING PLAN   │
             └──────────┬───────────┘
                        ↓
             ┌──────────────────────┐
             │   TODAY'S CONTEXT    │
             │ Gym / Equipment /    │
             │ Time / Constraints   │
             └──────────┬───────────┘
                        ↓
             ┌──────────────────────┐
             │       HISTORY        │
             │ Performance / Volume │
             │ Frequency / Fatigue  │
             └──────────┬───────────┘
                        ↓
             ┌──────────────────────┐
             │   TRAINING KNOWLEDGE │
             │ Evidence + Principles│
             └──────────┬───────────┘
                        ↓
             ┌──────────────────────┐
             │    BOBBY ENGINE      │
             │ Deterministic Rules  │
             └──────────┬───────────┘
                        ↓
             ┌──────────────────────┐
             │ TODAY'S RECOMMENDATION│
             └──────────┬───────────┘
                        ↓
                   USER ACCEPTS
                        ↓
             ┌──────────────────────┐
             │      WORKOUT         │
             │ Fast set-by-set log  │
             └──────────┬───────────┘
                        ↓
             ┌──────────────────────┐
             │       HISTORY        │
             └──────────┬───────────┘
                        │
                        └──────────────→ Future Bobby
```

### The one-sentence definition

> **Bobby Bulk is a personal, evidence-informed, history-aware training coach that recommends and adapts the user's existing workouts while keeping the user in control.**

And I think the most important design constraint to preserve throughout implementation is:

> **Bobby should be sophisticated under the hood but extremely low-friction on the surface.**

You shouldn't have to "manage Bobby." You should be able to open it, see **what it thinks you should do and why**, train, tap a checkmark after each set, and leave.
