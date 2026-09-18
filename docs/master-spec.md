# Bobby Bulk — Product & Technical Specification

## How to read this specification

Sections 1–43 describe product principles, domain concepts, and intended behavior;
they are not a checklist of completed features. The product invariants below
apply across planning modes. Sections 44–45 describe the current implementation
and persistence approach, which can evolve without changing those invariants.
Section 46 is the development roadmap, not a statement that every earlier phase
is complete. Section 47 summarizes the product loop.

## 1. Product Definition

**Bobby Bulk is a personal adaptive workout coach.**

The user defines their goals, preferences, and—when desired—their own training
structure. Bobby uses those inputs together with training history, current
context, and evidence-informed principles to determine what the user should do
today.

Bobby supports two planning-authority modes:

* **Recommended Workout:** Bobby constructs today's session, even when no saved
  plan or split exists.
* **My Plans:** Bobby adapts and advises on a user-owned program without silently
  rewriting it.

In both modes, **the user remains in control**.

> **Planning authority determines what Bobby may change. Training need determines what Bobby wants to do. Context determines what Bobby can do.**

The core interaction is:

```text id="6xj3xj"
Planning Authority + Goals / Priorities / Preferences
      ↓
User Plan (when applicable)
      ↓
Today's Context
      ↓
Training History
      ↓
Bobby constructs or adapts
      ↓
Today's Workout Recommendation
      ↓
User starts / adjusts / chooses another workout
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

Its defining role is ongoing, history-aware coaching. Recommended Workout is
deterministic session construction within that coaching loop; it does not imply
LLM-authored workouts. The core coaching engine is deterministic and
evidence-informed.

An LLM may eventually be used to interpret natural-language goals or explain recommendations, but it should not be responsible for the fundamental training decisions.

---

## 2. Product Philosophy

### Product invariants

* Planning authority governs what Bobby may construct or modify.
* User-owned plans are never silently rewritten; permanent changes require
  explicit acceptance.
* Fundamental training decisions remain deterministic and inspectable.
* Personal training evidence matters; one poor session or elapsed time alone
  should not trigger unnecessary variation.
* Context constrains a session without automatically changing a saved program.
* Coaching should remain low-friction, with the user able to decline advice.

### User controls planning authority

Bobby should behave like a coach working with the user. The user may delegate
construction of today's session or provide their own program as the baseline.
Owning a program is optional; choosing Recommended Workout does not transfer
ownership of any saved plans to Bobby.

The user can:

* Start a Recommended Workout without creating a routine
* Choose a workout from My Plans instead
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

## 3. Core Hierarchy

The hierarchy depends on planning authority. A Program or Split is not a
prerequisite for a Recommended Workout.

### User-owned structure

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

Example of a user-owned structure:

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

### Recommended Workout

```text
Goals + Priorities + History + State + Context
  ↓
Generated Workout
  ↓
Exercise
  ↓
Set
```

Both paths produce an executable workout and a logged WorkoutSession. A
generated session does not require or silently create a recurring program.

---

## 4. User Routines

The user should be able to create and maintain:

* Programs
* Splits
* Workouts
* Exercises
* Sets
* Rep ranges
* Target volume
* Exercise ordering

In **My Plans**, the user-created routine is the **baseline** Bobby evaluates.

Bobby should not silently rewrite it.

Creating a routine is optional and is not required to use Recommended Workout.

---

## 5. Today's Recommendation

When the user opens Bobby, the home screen should present a recommended workout.
The primary path is **Recommended Workout**, with **My Plans** available as an
explicit alternative. The preview should describe the session the user will
actually start, and an in-progress session should be resumable.

### Planning authority

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

### Recommended Workout decision order

Its decision order is intentional: **goals** establish what matters,
**priorities** establish what matters more, direct working-set **history**
establishes what has already happened, current training-state features establish
what is appropriate now, and today's **context** establishes what is possible.
Exercise intelligence then realizes that allocation while preserving a
progressing exercise when practical.

Compound movements contribute to the session workload of both primary and
secondary muscles. Secondary involvement reduces remaining need but does not
automatically satisfy it. Bobby may add direct isolation work when priority,
recent workload, accumulated session stimulus, recovery, and available time
indicate that more direct work is useful.

### Session stimulus accounting

Bobby distinguishes **direct work** from **supporting work**. Direct historical
working-set volume remains useful for tracking frequency, recovery, and priority
exposure, while supporting involvement from compounds contributes to the
workout currently being constructed. Supporting work is not assumed to be
equivalent to direct work and does not rewrite the direct historical record.

Bobby should reason:

```text
desired emphasis → accumulated session stimulus → remaining useful stimulus
```

Isolation exercises may fill that remaining need. Compound overlap is neither
ignored nor treated as an automatic prohibition on isolation work. Any weighting
of supporting work is a modest coaching heuristic for relative allocation, not
an exact physiological measurement.

### Example: Recommended Workout

> ## Your recommended session
>
> ### Upper chest · Mid back
>
> Based on your goals, priorities, recent training, and available equipment.
>
> Review the selected exercises and working-set prescriptions before starting.
>
> [Start Workout] [Why This Session?] [Browse My Plans]

### Example: My Plans

> ## Today's Recommendation
>
> ### Push
>
> Adapting your saved Push workout from PPL using recent training and today's context.
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

## 6. Workout Selection in User-Owned Programs

In **My Plans**, when the user has a split, Bobby should primarily use that
**split** to determine which saved workout to recommend. The user can also
select a saved workout directly without a split.

This selection process applies to user-owned recurring structure. Recommended
Workout follows the construction process in Section 5 and requires no plan or
split.

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

Within My Plans, the split is **not absolute**.

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

## 7. Rejecting Recommendations

Recommendations are **proposals**.

The user can reject them.

For example:

> Bobby recommends Push.

User says:

> "Actually, I want Pull."

Bobby should show the reasoning behind its recommendation where useful, but ultimately allow the user to choose.

The selected workout should then become the workout being performed.

---

## 8. Routine Changes

In **My Plans**, Bobby can recommend changes to the actual routine. In
Recommended Workout, construction or adjustment affects the temporary session,
not a saved routine. Starting a generated workout does not authorize permanent
changes to a user-owned plan.

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

## 9. User Preferences

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

## 10. Today's Context

Today's context describes what is different **today**.

Possible inputs:

* Gym
* Available equipment
* Equipment temporarily unavailable
* Individual exercises unavailable for this workout
* Available time
* Other temporary constraints

These should not automatically modify the permanent routine.

---

## 11. Gym Configuration

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

Gym profiles can be created and edited from Today's context panel. Persist the
selected gym and its equipment categories.
An empty equipment inventory permits equipment-free bodyweight work; it does
not mean unrestricted access. Unknown accessories are grouped explicitly under
Other equipment rather than silently assumed present.

Resolve eligibility from the selected gym's inventory minus today's temporary
outages. Use the same rule for generated exercises, user-plan suggestions, and
substitution candidates. Respect catalog equipment alternatives and bench
requirements for free-weight exercises that require a bench. Temporary outages
do not edit a profile and reset when switching gyms.

If a user-plan exercise cannot be performed and no suitable replacement exists,
explain its omission for today's session. Do not rewrite the saved plan. An
explicitly restricted gym can require more than two substitutions or omissions;
the contextual change guideline must not leave impossible exercises in the
executable session. If nothing remains, explain the constraint before starting.

Capture the gym and resolved context with a new session. Later profile edits,
gym switches, and temporary outages apply to future workouts; the running
session retains its original equipment context, prescriptions, and load guidance.

---

## 12. Temporary Equipment Problems

Inside today's workout, the user can indicate that a piece of equipment is unavailable.

Example:

> Cable machine unavailable.

Bobby can immediately adapt the affected exercise.

This is preferable to requiring the user to maintain a detailed database of every machine at every gym.

---

## 13. Equipment Adaptation

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

## 14. Contextual Change Limit

This guidance applies when adapting an existing workout, especially a user-owned
plan. It is not a limit on how many exercises Bobby may choose when constructing
a Recommended Workout from scratch.

The "two exercise changes" guideline is specifically for situations where the **environment is otherwise normal**.

If you're at the same gym and the same equipment is available:

> Bobby should generally avoid unnecessarily restructuring the entire workout.

A reasonable default is:

**Maximum ~2 exercise substitutions/modifications from equipment/context adaptation.**

This is not a hard universal limit.

If the context genuinely warrants more changes—for example, you're traveling to a gym with completely different equipment—Bobby may exceed it.

The principle is:

> **Don't unnecessarily disrupt a working workout when the user's normal environment is available.**

---

## 15. Suggested Loads and Exercise Alternatives

Gym profiles configure equipment categories, without available-weight lists.
Discard legacy gym weight inventories when loading profiles; they must not cap
new recommendations. Suggest editable loads from comparable training history and
ask the user to choose a starting load when that history is insufficient.

Before starting a Recommended Workout, each exercise offers **I can't do this
exercise**. Replace only that slot with the next suitable alternative, preserving
its set budget and using the replacement's rep range and load guidance. Respect
equipment, goals, exercise exclusions, recent training, and the other movements
in the session. Do not cycle back to an exercise already rejected in this preview.
If no suitable alternative remains, omit that slot with a clear explanation.

Changes affect the current preview only, leaving saved plans and permanent
preferences intact. **Reset exercise choices** restores the generated preview.
Changes to training context, goals, or history rebuild the preview. Starting a
workout captures the exact revised prescription, including load targets, so it
survives reloads and remains the basis for post-workout analysis.

When the catalog permits different equipment variants but historical logs do not
identify the variant used, ask for a starting load rather than transferring a
machine or barbell weight to a dumbbell setup.

---

## 16. Time Constraints

The user can specify today's available workout time.

Example:

```text id="f5f31e"
Normal workout:
60 minutes

Today:
35 minutes
```

In **My Plans**, Bobby should adapt the existing workout while preserving its
intent. In **Recommended Workout**, Bobby should construct a session that fits
the available time, using training need and context to allocate exercises and
sets. Neither mode requires inventing a recurring split to fit today's time.

Possible adaptations to an existing workout:

* Reduce sets
* Remove lower-priority exercises
* Superset compatible exercises
* Reorder exercises
* Preserve important compound movements
* Preserve goal-critical exercises

In My Plans, Bobby should not replace the user's workout with a completely
unrelated 35-minute session. In Recommended Workout, time constrains useful
stimulus allocation, including any additional isolation work.

---

## 17. Goals

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

The resolved priority order is shared by Recommended Workout construction and
user-owned plan, split, and workout evaluation.
It guides—not overrides—recovery, available training days, working volume, and
session constraints:

* Higher priorities generally receive more practical direct exposures and a
  larger share of productive direct volume.
* The highest priority can target about three weekly opportunities when the
  split supports it; lower priorities commonly target fewer. These are bounded
  opportunities, not universal frequency requirements.
* In My Plans, saved splits are evaluated first for whether their frequency and
  direct volume express the priority order. Bobby only suggests redistribution
  when the mismatch is material.
* Within a workout, a priority muscle's main productive work should generally
  receive fresher placement before lower-priority competing work when safety,
  technique, compounds, supersets, and fatigue management allow.

Recommended Workout uses resolved priorities and actual training history to
select useful muscle opportunities without requiring planned split entries.

### Complete generated sessions

Priority targets guide emphasis within a session; satisfying their weekly
frequency guidance does not automatically make a muscle ineligible. Construction
first allocates justified priority work, then considers suitable lower-priority
and unranked muscles. These candidates remain available even when a priority
still needs attention. A priority deficit alone is not a complete workout plan.

Use the current four-movement budget as a construction heuristic, considering
useful direct and supporting work before each addition. Do not fill slots with
redundant exercises or override recent-work and high-workload guards, equipment
constraints, goals, or hard exclusions. Apply the same eligibility checks to all
primary muscles of a candidate, including work added beyond the priorities.
Recent direct work today or yesterday is conservatively deferred; this is an
explicit application heuristic, not a claim about exact physiological recovery.

Check the final prescription after time adaptation. When fewer than three
suitable movements remain, explain visibly whether the time limit shortened
the session or suitable work was limited by the current context. Three movements
is a product threshold for this explanation, not a universal workout minimum.
Recompute explanations and load targets from the final exercise and set allocation.

### Goal-to-split alignment in My Plans

When evaluating a user-owned split, goals establish desired outcomes, and
explicit priorities refine them. The saved split then establishes recurring
direct training opportunities. Before
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

## 18. Future Natural-Language Goals

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

## 19. Evidence-Based Training Knowledge

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

## 20. Training Principle Model

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

## 21. Training Variation Principle

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

## 22. Personal Evidence Takes Priority

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

## 23. Feature Calculation

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

## 24. Fatigue System

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

## 25. Performance Anomalies

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

## 26. Post-Workout Analysis

The user does not need to interact with Bobby during the workout beyond logging.

Afterward, Bobby can analyze the session.

For example:

> **Workout complete**
>
> Your Incline DB Bench performance was below your recent average today. I've marked this session as a possible fatigue-affected session, so I won't treat it as a strong signal of a plateau.

This keeps the actual workout experience clean.

---

## 27. Strength Benchmarks

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

## 28. Benchmark Frequency

Benchmarks should **not occur frequently**.

The exact frequency should eventually be informed by training practice and evidence.

The system should treat benchmarks as periodic measurements rather than regular workout sets.

Their purpose is to help Bobby determine:

* Actual strength progression
* Whether perceived effort matches performance
* Whether apparent plateaus are real
* Whether the training program is producing measurable results

---

## 29. Warm-Up vs Working Sets

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

## 30. Workout UI

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

## 31. Workout Logging

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

## 32. No In-Workout Chat

Bobby should not require conversational interaction during the workout.

The user shouldn't need to tell Bobby:

> "This machine is occupied."

through a chat interface every time.

Instead, provide simple controls such as:

> **Equipment unavailable**

or other structured actions.

The workout experience should remain focused on training.

---

## 33. Recommendation Timing

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

## 34. Decision Engine

The fundamental system is:

```text id="a7i7sj"
Planning Authority
+
Goals / Priorities
+
User Plan (when applicable)
+
Today's Context
+
History
+
Features
+
Training State
+
Evidence-Based Rules
        ↓
Bobby Engine
        ↓
Today's Workout / Recommendations
```

Planning authority gates which changes are permitted. Training need determines
the desired work, and context constrains what is feasible. A user plan is an
input only when the selected planning mode calls for one.

---

## 35. Recommendation Types

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

## 36. Recommendation Ranking

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

## 37. Recommendation Traceability

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

> A completed working set demonstrated the top of the prescribed rep range,
> with no near-failure effort evidence opposing an increase.

which implements:

> Progressive overload/progression principle.

which is supported by:

> Professional resistance-training guidance.

---

## 38. Deterministic Core

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

## 39. Optional LLM Layer

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

## 40. History & Analytics

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

## 41. Feedback Loop

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

## 42. No Scheduling Initially

Bobby does **not** create a workout calendar or force a schedule.

The user opens the app when they intend to work out.

If scheduling is eventually added, a skipped workout should simply be recorded as:

> **Skipped**

rather than Bobby automatically rearranging the user's entire life/training schedule.

---

## 43. Data Model

### Planning authority

Planning authority is a first-class domain concept, not necessarily a separate
persisted database entity:

```ts
type PlanningAuthority =
  | 'recommended'
  | 'user-plan';
```

It controls **what Bobby is permitted to change**, not merely how the UI is
labeled:

* `recommended` permits construction of a temporary, executable workout from
  goals, priorities, history, state, and context, without a Program or Split.
* `user-plan` preserves the user-owned structure as the baseline. Contextual
  adaptations affect today's execution; permanent plan changes require explicit
  acceptance of a supported recommendation.

Workout definitions and session snapshots should retain their planning
authority so execution and later analysis preserve that distinction. Legacy
user plans with no explicit authority are treated as `user-plan`.

### History-aware TrainingState contract

Recommended Workout derives one deterministic `TrainingState` for an explicit
as-of date and display unit before allocating muscles or choosing movements.
The construction and substitution paths consume that state; they do not query
raw workout history during candidate ranking or load prescription.

State exposes the following independent evidence, without a combined readiness
or fatigue score:

* Muscle state: direct working-set counts and session frequency over inclusive
  7-, 14-, and 28-day windows; days since direct training; workload trend;
  history confidence; and an explicit recovery classification.
* Exercise state: completed direct working performances, latest working sets,
  demonstrated loads/reps and effort, progression trend, historical prescription
  completion where known, and confidence. Loads use one normalized display unit.

Only completed sessions contribute; missing status is accepted for legacy saved
history. Ignore future/invalid dates and invalid or zero-rep sets. Planned but
unlogged sets are not completed volume. Warm-up, drop, and failure sets never
establish ordinary working load or direct working-set exposure. Secondary muscle
involvement is not converted to historical direct volume or another exercise's
load evidence. Missing prescriptions remain unknown, and absent history is not
classified as high volume or proof of poor recovery.

For this milestone, direct training today or yesterday defers a muscle opportunity.
High recent volume with exposure in the last week also defers it. These are
explicit conservative product rules, not a physiological recovery prediction.
Among the remaining opportunities, rank ordered priorities, goal-derived emphasis,
recent direct frequency/volume, and time since training. Exercise selection must
honor that opportunity order, subject to goal/equipment compatibility and useful
session coverage. Time limits trim lower-ranked opportunities first. Preserve a
complete session where suitable work exists; do not insert overlapping filler.

Set budgets reflect priority and recent direct exposure. Rep ranges come from the
selected exercise. Load guidance uses its own latest completed working evidence:
a demonstrated top-range set can support progression without requiring all of the
next prescription's sets, 3 x 12, or another fixed completion gate. Near-failure
effort supports holding the load. Prescription completion remains an independent
historical fact and does not become true merely because progression is suggested.

Completing, editing, or deleting saved history causes the next recommendation to
rederive state. Active sessions retain their captured prescription. User-owned
plans remain restrictive: state may inform suggestions but never silently rewrite
them. Sequence tests cover completion-to-next-day changes, recovery, undertrained
priorities, skipped work, direct-only evidence, future/in-progress exclusion,
unit normalization, deterministic ordering, and no-history/legacy fallbacks.
Automatic split generation, LLM behavior, and long-term periodization are outside
this milestone.

### Shared TrainingState -> Decision Engine contract

The existing `generateRecommendations` composition boundary derives or receives
exactly one TrainingState for the request's as-of date and display unit. It passes
that snapshot to plan evaluation, load guidance, time adaptation, split alignment,
and semantic conflict resolution. Recommended Workout uses the same TrainingState resolution and
interpretation. The app shares its memoized snapshot across Recommended
Workout, My Plans, and split overview; completing, editing, or deleting history
invalidates that snapshot. A supplied snapshot must match date, unit, and catalog
coverage, and is authoritative: downstream producers must not peek at changed raw
history behind it.

The pipeline remains:

```text
Completed history -> TrainingState -> RecommendationCandidate producers
                  -> resolveConcreteConflicts -> ordered Recommendation objects
```

Raw saved history enters this boundary before display/effective-bodyweight
transformations. State owns direct volume/frequency, recency, recovery, workload
trend, confidence, valid exercise performances, progression, and known completion.
Raw history is reserved for evidence not represented in state; it must not be used
to recalculate equivalent facts inside candidate producers.

Planning authority remains explicit. `recommended` may construct a temporary
session. `user-plan` proposes changes against the saved baseline and never silently
rewrites it. Legacy plans default to user ownership. State affects the existing
recommendation types as follows:

* PROGRESSION uses valid direct working evidence. Recent direct recovery constraints
  or meaningful near-failure effort convert it to an explained KEEP. Near-failure
  means RIR <= 1 or, only when that set has no RIR, RPE >= 9 in the latest ordinary
  working performance. Other set types cannot trigger this rule. Both generated
  load targets and plan advice respect effort beyond just the single best set.
* Productive progression supports KEEP and defeats optional exercise variation.
* A measured undertrained priority strengthens an ADD; a small existing slot may
  receive a bounded one-set MODIFY up to the exercise default. These are optional
  proposals, suppressed when direct targets were recently trained or recent direct
  volume is high. No-history missing coverage remains distinct from measured low
  volume.
* Hard equipment substitutions/removals override preference and historical
  continuity. Time-driven MODIFY/REMOVE orders work by the same muscle opportunity
  facts, trimming recovering or lower-ranked work first. Compatible equipment
  substitution and time reduction can coexist for the same original slot.
* SPLIT advice and frequency findings distinguish actual recent training (including
  outside work) from planned exposures. Do not sum them: completed work may be an
  execution of the planned split. Adequate actual frequency or pending recovery
  defers optional frequency expansion; the split remains unchanged.

Conflict resolution uses explicit precedence rather than a combined readiness or
fatigue score. Required removal defeats KEEP/PROGRESSION/MODIFY/replacement for the
same slot; equipment defeats optional alternatives; recovery defeats optional
volume; near-failure effort defeats automatic progression; productive performance
defeats optional variation; and hard time limits defeat optional additions or set
increases. Alternative replacements and competing set prescriptions cannot both
win for one slot. Rank feasible optional work deterministically within remaining
time, considering required removals/reductions already selected.

`generateRecommendationsWithTrace` exposes the same pipeline's state, original
candidates, final recommendations, and suppression records for tests/debugging.
Each suppressed or converted candidate records its stable ID, a reason code,
human-readable explanation, and a winning/replacement candidate ID when applicable.
Canonical tie-breaking must not depend on producer insertion order. The final
Recommendation schema and evidence-rule traces remain intact; diagnostic state
is not a new recommendation architecture or a user-facing Bobby score.

Regression coverage includes shared-state reuse, all listed semantic precedence
rules, candidate permutations, equipment plus time adaptation, actual split
frequency, history lifecycle changes, units, and conservative legacy/no-history
behavior. This milestone does not introduce learning, LLMs, automatic splits,
periodization, deloads, benchmarks, or scheduling.

### Post-workout outcome analysis and closed-loop coaching

`PostWorkoutAnalysis` is a deterministic, derived interpretation of a completed
WorkoutSession. It contains the session identity/date, execution totals, exercise
outcomes, meaningful findings, and recommendation outcomes. It is not persisted
as another set ledger. Completed sessions remain canonical; reviewing or deriving
TrainingState recomputes analysis from current saved history. Edits and deletions
therefore invalidate earlier verdicts automatically. In-progress sessions receive
no completed-session verdict.

Each ExerciseOutcome preserves the original session prescription (sets, rep range,
set type, and load target when present), actual ordinary working sets and units,
completed/partial/skipped/ad-hoc status, target-range completion, observed load
changes, demonstrated in-range load, comparison evidence, sufficiency/confidence,
and deterministic observations. Missing historical prescriptions stay unknown;
today's catalog supplies names, never a reconstructed original prescription.

Execution facts are separate from judgments. Extra sets, a different load, or an
ad-hoc movement are observations. Successfully performing a heavier load preserves
that demonstrated performance and is not labeled failed adherence. Completing all
sets and meeting all rep targets are distinct facts. Warm-up, drop, and failure
sets cannot establish ordinary working-load progress. Missing sets contribute no
completed direct volume and do not independently imply performance decline.

Compare actual working sets using the existing set-preserving comparison and
progression contract. One weaker comparable result is isolated underperformance;
two consecutive comparable weaker results may establish repeated underperformance
and regression. Contradictory direct set evidence cannot be overridden by total
volume or estimated 1RM. Changed prescriptions or inadequate comparison evidence
remain inconclusive. Do not invent explanations involving sleep, nutrition,
illness, or physiological fatigue.

The durable causal chain is:

```text
Recommendation snapshot -> explicit decision -> session prescription change
                        -> actual execution -> derived outcome -> future TrainingState
```

New decisions preserve the exact recommendation payload, plan ID, unit, and
relevant before/after prescriptions. At start, sessions capture prescription-change
records with their origin: accepted/rejected/dismissed recommendation, automatic
equipment/time adaptation, caller-selected change, or generated exercise swap.
Each record retains its recommendation/decision IDs where available and whether
it materially affected the final prescription. Previous acceptance of a stable
recommendation ID must not authorize a changed load proposal. Legacy decisions
without a proposal snapshot do not establish acceptance of a new prescription.

Accepted progression captures its load target in the starting session, including
when the saved plan itself has no load target. An ordinary working set at that
load or heavier within the target rep range demonstrates it without requiring all
prescribed sets. Attempting that load outside the range is not supported execution;
choosing a lighter/different setup means the increase was not tested, rather than
proof of inability. Accepted replacement/addition provenance survives changes
already applied to the saved plan and records whether the resulting movement was
performed, partly performed, or skipped. Rejected proposals are never credited as
applied; any mandatory contextual adjustment has its own separately attributed
record. Superseded intermediate generated swaps are not counted as skipped work.

Context-driven removal is an intentional omission from the session prescription,
not a skipped prescribed exercise. Execution alone does not distinguish voluntary
skipping from accidental/partial completion; record the cause as unknown unless
explicitly captured. Neither skipped work nor contextual omissions write preferred,
recommend-less, or excluded preferences, and no implicit preference learning is
introduced by this milestone. Explicit recommendation decisions remain distinct
from these execution facts.

TrainingState exposes rederived session outcomes alongside its real-set features.
The summary and future coaching can inspect demonstrated recommendation loads,
execution provenance, and isolated/repeated underperformance without counting
analysis records as additional training. Generated sessions require no saved plan
or accepted recommendation to receive a valid analysis. Session prescriptions and
causal records stay frozen across reloads and later plan, catalog, preference, or
history changes; actual-history edits only change the derived interpretation.

The existing session review shows original targets, neutral execution observations,
performance comparisons, and coaching-change outcomes. This is not a new analytics
dashboard. No general-purpose ranking rules, LLM coaching, speculative recovery,
deloads, periodization, automatic splits, scheduling, or benchmarking are introduced.

### Entities and relationships

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

The most important relationships (Program and Split are optional containers
for user-owned structure):

```text id="7q9wce"
Program
 └── Split
      └── Workout
           └── Exercise
                └── Set

Generated Workout (no Program or Split required)
 └── Planned Exercises / Sets

WorkoutSession
 ├── PlanningAuthority
 ├── Snapshot of saved or generated workout
 └── Actual Sets

Recommendation
 ├── DecisionRule
 └── TrainingPrinciple
      └── EvidenceSource
```

---

## 44. Current Codebase

This is an implementation snapshot, organized by responsibilities rather than
an exhaustive file inventory. The application currently uses React and
TypeScript, with deterministic coaching logic in the domain layer.

| Layer | Current responsibilities |
| --- | --- |
| Presentation and session interaction | Today, Plans, History, Exercises, and Goals; workout preview; set logging; session resume; recommendation decisions; responsive navigation and styling. |
| Domain model and exercise catalog | Saved workout definitions, planned prescriptions, session snapshots, planning authority, goals, preferences, gyms, and context; exercise metadata, taxonomy, and loading units. |
| History, features, and state | Set-preserving performance evidence, exercise and muscle features, progression signals, recent workload, training state, and preference classification. |
| Goals and muscle priorities | Resolve explicit ordered priorities and goal-derived defaults for both workout construction and user-plan evaluation. |
| Recommended Workout construction | Select muscle opportunities from goals, history, state, and context; choose compatible exercises and working sets; account for accumulated direct and supporting session stimulus; fit the session to available time. |
| User-plan evaluation and adaptation | Evaluate plans, individual workouts, and splits; assess priority alignment and structural coverage; adapt to equipment and time; apply accepted changes to user-owned plans. |
| Exercise intelligence and progression | Compare exercise fit and replacement candidates, retain productive movements where practical, and base suggested loads on demonstrated performance. |
| Recommendations and evidence | Centralized recommendation generation and ranking, decision feedback, rule traces, training principles, and evidence metadata. |
| Persistence and verification | Browser storage, normalization of legacy records, active-session persistence, development-time local-file snapshots, and automated domain/persistence tests. A SQL schema supports a future SQLite migration. |

Recommended Workout construction and session stimulus accounting are already
represented in the domain implementation. Automatic split generation is outside
the current scope; a dedicated analytics experience and the optional LLM layer
remain roadmap concerns. The presence of a domain type or roadmap phase does
not imply that its full user-facing workflow is implemented.

The architectural boundary to preserve is that presentation and storage consume
structured domain results; they do not independently redefine coaching rules or
planning authority. Filenames and component boundaries may change without
changing these responsibilities.

---

## 45. Persistence

### Current implementation

Browser `localStorage` persists workout history, saved plans/templates,
preferences, recommendation decisions, gym/context settings, recurring
structure, and the active workout session. History has a browser backup copy,
and stored records are normalized for compatibility with earlier formats.

During local development, a server endpoint mirrors Bobby-owned browser data to
a versioned local JSON snapshot. Revision checks reject stale snapshot writes.
The browser-storage path remains usable when that development endpoint is
unavailable. The canonical key list and snapshot format belong to the
persistence implementation rather than a duplicated list in this specification.

### Persistence requirements

Persistence must preserve user-owned plans, recommendation decisions, planning
authority, the prescription captured at session start, and actual logged sets.
Generated sessions can be saved as history without being promoted to recurring
user-owned plans. Resuming a workout should retain the session the user started.

SQLite remains the eventual migration target; changing the persistence backend
must not change planning authority or reinterpret historical records.

---

## 46. Recommended Development Order

These phases describe development priorities and dependencies, not a strict
completion ledger. Parts of later phases already exist; unfinished earlier
capabilities can still require follow-up work.

### Phase 1 — Core data model

Build:

```text
Program
→ Split
→ Workout
→ Exercise
→ Set
```

for user-owned structure without breaking the existing application. Model
planning authority and standalone generated workout/session records without
requiring Program or Split membership.

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
* Individual exercises unavailable for this workout
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
Planning Authority
+ Goals / Priorities
+ User Plan (when applicable)
+ Context
+ History
+ Features
+ State
+ Evidence
→ Today's Workout / Recommendations
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

### Phase 14 — Recommended Workout foundation

Construct an executable session with zero saved plans or splits. Resolve goals
and ordered priorities, use direct working-set history and training state to
select muscle opportunities, and choose compatible exercises and prescriptions
under today's constraints. Keep generated workouts temporary and planning
authority explicit through preview, execution, and history.

### Phase 15 — Stimulus-aware workout construction

Accumulate direct and supporting work across the selected session. Use that
stimulus to estimate remaining useful work without treating compound overlap as
a binary veto on isolation. Let priority, recent workload, recovery, and time
determine whether additional direct work is justified. Keep supporting-work
weights identifiable as coaching heuristics.

### Phase 16 — Post-workout analysis / adaptive feedback

Compare the prescribed session with what was actually completed, account for
performance anomalies, update history and state, and feed those results into
future construction or user-plan recommendations. Keep this analysis outside
the set-logging flow and preserve the authority of the original session.

### Phase 17 — Analytics

Build the Progress/Insights tab.

### Phase 18 — Optional LLM

Add:

* Natural-language goals
* Conversational queries
* Better explanations

---

## 47. The Core Bobby Loop

The entire product can ultimately be summarized as:

```text id="9j7s2b"
Planning Authority
Recommended Workout / My Plans
          ↓
Goals / Priorities / Preferences
+ User Plan (when applicable)
+ Today's Context (gym / equipment / time)
+ History / Features / Training State
+ Training Knowledge / Evidence
          ↓
Bobby Engine — deterministic decisions
          ↓
Construct Today's Workout / Adapt User-Owned Plan
          ↓
User starts / adjusts / chooses another workout
          ↓
WorkoutSession — prescription snapshot + planning authority
          ↓
Fast set-by-set logging
          ↓
Actual history + feedback + post-workout analysis
          ↓
Updated features and state → Future Bobby decisions
```

Accepting a permanent plan change is a separate, explicit decision in My Plans;
starting or modifying a generated session does not grant that permission.

### The one-sentence definition

> **Bobby Bulk is a personal, evidence-informed, history-aware training coach that either constructs today's workout or intelligently adapts a user-owned plan, while keeping planning authority explicit and the user in control.**

The central abstraction is:

> **Planning authority determines what Bobby may change. Training need determines what Bobby wants to do. Context determines what Bobby can do.**

The most important experience constraint is:

> **Bobby should be sophisticated under the hood but extremely low-friction on the surface.**

You shouldn't have to "manage Bobby." You should be able to open it, see **what it thinks you should do and why**, train, tap a checkmark after each set, and leave.
