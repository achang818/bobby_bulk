import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { exercises } from "./domain/exercises";
import { sampleWorkouts } from "./domain/seed";
import { workoutTemplates } from "./domain/templates";
import { evaluatePlan } from "./domain/plan-evaluator";
import { adaptWorkout, adaptWorkoutForTime } from "./domain/adaptation";
import { classifyFatigue } from "./domain/states";
import { calculateExerciseFeatures, comparePlannedVsActual } from "./domain/features";
import { evaluateWorkout } from "./domain/workout-evaluator";
 import { loadPlans, loadPreferences, loadSavedTemplates, loadWorkouts, loadGyms, loadRecommendationDecisions, latestRecommendationDecision, loadTodaysContext, deletePlan, deleteWorkout, savePlan, savePreferences, saveRecommendationDecision, saveWorkout, updateWorkout, saveTodaysContext, toggleSavedTemplate, } from "./domain/storage";
import { applyAcceptedRecommendation } from "./domain/plan-actions";
import { completeWorkoutSession, createPlannedExercise, createWorkoutSession, planExerciseIds, resolveWorkoutForToday } from "./domain/workout-session";
import { convertWeight, displayWeight, effectiveLoad } from "./domain/units";
import type { LoggedSet, PlanRecommendation, TrainingGoal, UserPreferences, WeightUnit, Workout, WorkoutSession, WorkoutTemplate, EquipmentTag, Gym, RecommendationDecision, TodaysContext, } from "./domain/models";
type View = "today" | "history" | "exercises" | "plans" | "goals";
type SetInput = {
    weight: string;
    reps: string;
    rir: string;
    rpe: string;
};
const defaultGym: Gym = { id: "default-gym", name: "Default gym", equipment: ["dumbbells", "barbells", "cables", "machines", "benches", "pull-up-bar"], availableLoads: [{ equipment: "dumbbells", increments: [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70] }], };
const equipmentOptions: EquipmentTag[] = ["dumbbells", "barbells", "cables", "machines", "benches", "pull-up-bar"];
const emptyPlan: WorkoutTemplate = { id: "no-plan-selected", name: "No workout selected", description: "Create a plan first, then Bobby can recommend how to perform it today.", focus: "Your training plan", plannedExercises: [], exerciseIds: [], };
function App() {
    const [view, setView] = useState<View>("today");
    const [workouts, setWorkouts] = useState<Workout[]>(() => {
        const saved = loadWorkouts();
        return saved.length > 0 ? saved : sampleWorkouts;
    });
    const [selectedExerciseId, setSelectedExerciseId] = useState(exercises[0].id);
    const [exerciseSearch, setExerciseSearch] = useState("");
    const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
    const [setInputOverrides, setSetInputOverrides] = useState<Record<string, SetInput>>({});
    const [showLogger, setShowLogger] = useState(false);
    const [recommendationDecisions, setRecommendationDecisions] = useState<RecommendationDecision[]>(() => loadRecommendationDecisions());
    const [activePlan, setActivePlan] = useState<WorkoutTemplate>(() => loadPlans()[0] ?? emptyPlan);
    const [plans, setPlans] = useState<WorkoutTemplate[]>(() => loadPlans());
    const [preferences, setPreferences] = useState<UserPreferences>(() => loadPreferences());
    const [gyms] = useState<Gym[]>(() => {
        const saved = loadGyms();
        return saved.length > 0 ? saved : [defaultGym];
    });
    const [todaysContext, setTodaysContext] = useState<TodaysContext>(() => loadTodaysContext({ gymId: preferences.defaultGymId ?? defaultGym.id, unavailableEquipment: [] }));
    const currentGym = gyms.find((gym) => gym.id === todaysContext.gymId) ?? gyms[0] ?? defaultGym;
    const workoutsInCurrentUnit = useMemo(() => workouts.map((workout) => ({ ...workout, unit: preferences.weightUnit, sets: workout.sets.map((set) => ({ ...set, weight: displayWeight(effectiveLoad(set, preferences.bodyweightLb), workout.unit, preferences.weightUnit), })), })), [preferences.bodyweightLb, preferences.weightUnit, workouts]);
    const activePlanExerciseIds = planExerciseIds(activePlan);
    const goalCriticalExerciseIds = activePlanExerciseIds.filter((id) => {
        const exercise = exercises.find((item) => item.id === id);
        return exercise?.primaryMuscles.some((muscle) => preferences.priorities.some((priority) => priority.toLowerCase() === muscle.toLowerCase())) ?? false;
    });
    const planRecommendations = useMemo(() => [...evaluatePlan(activePlan, exercises, workoutsInCurrentUnit, preferences, undefined, currentGym.availableLoads, recommendationDecisions), ...adaptWorkout(activePlan, exercises, todaysContext, preferences), ...adaptWorkoutForTime(activePlan, exercises, todaysContext.availableMinutes, goalCriticalExerciseIds)].sort((a, b) => b.score - a.score), [activePlan, currentGym.availableLoads, goalCriticalExerciseIds, preferences, recommendationDecisions, todaysContext, workoutsInCurrentUnit]);
    const sessionRecommendations = useMemo(() => planRecommendations.filter((recommendation) => recommendation.trace.ruleId === "adapt-unavailable-equipment" || (recommendation.trace.ruleId === "adapt-available-time" && latestRecommendationDecision(recommendation.id, recommendationDecisions) !== "dismissed") || latestRecommendationDecision(recommendation.id, recommendationDecisions) === "accepted"), [planRecommendations, recommendationDecisions]);
    const resolvedPlan = useMemo(() => resolveWorkoutForToday(activePlan, sessionRecommendations, exercises), [activePlan, sessionRecommendations]);
    const workoutExerciseIds = useMemo(() => activeSession?.plannedExercises?.map((exercise) => exercise.exerciseId) ?? planExerciseIds(resolvedPlan), [activeSession, resolvedPlan]);
    const sessionPlannedExercises = useMemo(() => resolvedPlan.plannedExercises ?? [], [resolvedPlan]);
    const setTargets = useMemo(() => new Map(sessionPlannedExercises.map((planned) => [planned.exerciseId, planned.sets])), [sessionPlannedExercises]);
    const sessionSets = activeSession?.sets ?? [];
    const loggerSetTargets = useMemo(() => new Map((activeSession?.plannedExercises ?? sessionPlannedExercises).map((item) => [item.exerciseId, item.sets])), [activeSession?.plannedExercises, sessionPlannedExercises]);
    const initialSetInput = useMemo<SetInput>(() => {
        const exercise = exercises.find((item) => item.id === selectedExerciseId);
        if (!exercise)
            return { weight: "0", reps: "0", rir: "", rpe: "" };
        const progression = planRecommendations.find((item) => item.type === "PROGRESSION" && item.exerciseId === selectedExerciseId && latestRecommendationDecision(item.id, recommendationDecisions) !== "dismissed")?.progression;
        const latestSet = [...workouts].sort((a, b) => b.date.localeCompare(a.date)).flatMap((workout) => workout.sets.filter((set) => set.exerciseId === selectedExerciseId).map((set) => ({ ...set, weight: displayWeight(set.weight, workout.unit, preferences.weightUnit), }))).at(0);
        return { weight: String(progression?.weight || latestSet?.weight || 0), reps: String(progression?.repRange.min ?? latestSet?.reps ?? exercise.repRange.min), rir: "", rpe: "", };
    }, [planRecommendations, preferences.weightUnit, recommendationDecisions, selectedExerciseId, workouts]);
    const setInput = setInputOverrides[selectedExerciseId] ?? initialSetInput;
    const selectableExercises = exercises.filter((exercise) => exercise.name.toLowerCase().includes(exerciseSearch.trim().toLowerCase()));
    function updateSetInput(next: Partial<SetInput>) {
        setSetInputOverrides((current) => ({ ...current, [selectedExerciseId]: { ...(current[selectedExerciseId] ?? initialSetInput), ...next }, }));
    }
    function selectLoggerExercise(nextId: string) {
        setSelectedExerciseId(nextId);
        setExerciseSearch("");
        setActiveSession((current) => {
            if (!current || current.plannedExercises?.some((exercise) => exercise.exerciseId === nextId)) return current;
            return { ...current, plannedExercises: [...(current.plannedExercises ?? []), createPlannedExercise(nextId, current.plannedExercises?.length ?? 0, exercises.find((exercise) => exercise.id === nextId))] };
        });
    }
    function updateTodaysContext(next: TodaysContext) {
        setTodaysContext(saveTodaysContext(next));
    }
    function updateSessionSets(update: (current: LoggedSet[]) => LoggedSet[]) {
        setActiveSession((current) => current ? { ...current, sets: update(current.sets) } : current);
    }
    function addSet() {
        const parsedWeight = Number(setInput.weight);
        const parsedReps = Number(setInput.reps);
        const parsedRir = setInput.rir.trim() === "" ? undefined : Number(setInput.rir);
        const parsedRpe = setInput.rpe.trim() === "" ? undefined : Number(setInput.rpe);
        if (!Number.isFinite(parsedWeight) || !Number.isFinite(parsedReps) || parsedReps <= 0 || (parsedRir !== undefined && (!Number.isFinite(parsedRir) || parsedRir < 0 || parsedRir > 5)) || (parsedRpe !== undefined && (!Number.isFinite(parsedRpe) || parsedRpe < 1 || parsedRpe > 10)))
            return;
        const target = loggerSetTargets.get(selectedExerciseId) ?? 0;
        const setType = activeSession?.plannedExercises?.find((exercise) => exercise.exerciseId === selectedExerciseId)?.setType ?? "working";
        const completedSets = sessionSets.filter((set) => set.exerciseId === selectedExerciseId).length;
        updateSessionSets((current) => [...current, { id: crypto.randomUUID(), exerciseId: selectedExerciseId, setType, weight: parsedWeight, reps: parsedReps, ...(parsedRir === undefined ? {} : { rir: parsedRir }), ...(parsedRpe === undefined ? {} : { rpe: parsedRpe }), },]);
        if (completedSets + 1 === target) {
            const currentIndex = workoutExerciseIds.indexOf(selectedExerciseId);
            const nextExerciseId = workoutExerciseIds.slice(currentIndex + 1).find((id) => sessionSets.filter((set) => set.exerciseId === id).length < (loggerSetTargets.get(id) ?? 0));
            if (nextExerciseId)
                setSelectedExerciseId(nextExerciseId);
        }
    }
    function finishWorkout() {
        if (!activeSession || sessionSets.length === 0)
            return;
        const workout = { ...completeWorkoutSession(activeSession), unit: preferences.weightUnit };
        setWorkouts(saveWorkout(workout, workouts));
        setActiveSession(null);
        setShowLogger(false);
        setView("history");
    }
    function startPlan(plan: WorkoutTemplate) {
        const planGoalCriticalIds = planExerciseIds(plan).filter((id) => {
            const exercise = exercises.find((item) => item.id === id);
            return exercise?.primaryMuscles.some((muscle) => preferences.priorities.some((priority) => priority.toLowerCase() === muscle.toLowerCase())) ?? false;
        });
        const contextRecommendations = adaptWorkout(plan, exercises, todaysContext, preferences);
        const shortenedExerciseIds = planExerciseIds(plan).map((id) => contextRecommendations.find((item) => item.type === "REPLACE" && item.exerciseId === id)?.alternativeExerciseId ?? id).filter((id) => !adaptWorkoutForTime(plan, exercises, todaysContext.availableMinutes, planGoalCriticalIds).some((item) => item.type === "REMOVE" && item.exerciseId === id));
        const initialExerciseIds = shortenedExerciseIds.length ? shortenedExerciseIds : plan.id === "empty-workout" ? [exercises[0].id] : [];
        setActivePlan(plan);
        setSelectedExerciseId(initialExerciseIds[0] ?? exercises[0].id);
        setSetInputOverrides({});
        setActiveSession(createWorkoutSession(plan, initialExerciseIds.map((id, order) => createPlannedExercise(id, order, exercises.find((exercise) => exercise.id === id)))));
        setShowLogger(true);
    }
    function startRecommendedWorkout() {
        if (workoutExerciseIds.length === 0) {
            setView("plans");
            return;
        }
        setSelectedExerciseId(workoutExerciseIds[0] ?? exercises[0].id);
        setSetInputOverrides({});
        setActiveSession(createWorkoutSession(activePlan, sessionPlannedExercises));
        setShowLogger(true);
    }
    function handleRecommendationDecision(recommendation: PlanRecommendation, decision: "accepted" | "rejected" | "dismissed") {
        setRecommendationDecisions(saveRecommendationDecision(recommendation, decision));
        if (decision !== "accepted")
            return;
        const updatedPlan = applyAcceptedRecommendation(activePlan, recommendation);
        if (planExerciseIds(updatedPlan).join("|") === activePlanExerciseIds.join("|"))
            return;
        setActivePlan(updatedPlan);
        setPlans(savePlan(updatedPlan));
    }
    return (<div className="app-shell">      <header className="topbar">        <a className="brand" href="#top" onClick={() => setView("today")}>          <span className="brand-mark">B</span>          <span>            <strong>Bobby</strong>            <small>training log</small>          </span>        </a>        <nav className="main-nav" aria-label="Main navigation">          {(["today", "history", "exercises", "plans", "goals"] as View[]).map((item) => (<button key={item} className={view === item ? "nav-link active" : "nav-link"} onClick={() => setView(item)}>                {item === "today" ? "Today" : item === "history" ? "History" : item === "exercises" ? "Exercises" : item === "plans" ? "Plans" : "Goals"}              </button>))}        </nav>        <div className="profile-chip">          <div className="unit-toggle">            <button className={preferences.weightUnit === "kg" ? "selected" : ""} onClick={() => setPreferences(savePreferences({ ...preferences, weightUnit: "kg" }))}>              kg            </button>            <button className={preferences.weightUnit === "lb" ? "selected" : ""} onClick={() => setPreferences(savePreferences({ ...preferences, weightUnit: "lb" }))}>              lb            </button>          </div>          <span className="profile-dot">A</span>          <span>Alex</span>        </div>      </header>      <main id="top">        {view === "today" && (<EvaluatedTodayView plan={activePlan} exerciseIds={workoutExerciseIds} setTargets={setTargets} recommendations={planRecommendations} decisions={recommendationDecisions} workouts={workoutsInCurrentUnit} unit={preferences.weightUnit} gyms={gyms} todaysContext={todaysContext} fatigue={classifyFatigue(workouts)} onContextChange={updateTodaysContext} onLog={startRecommendedWorkout} onChooseSomethingElse={() => setView("plans")} onDecision={handleRecommendationDecision}/>)}        {view === "history" && (<HistoryView workouts={workouts} unit={preferences.weightUnit} onUpdate={(workout) => setWorkouts(updateWorkout(workout, workouts))} onDelete={(workoutId) => setWorkouts(deleteWorkout(workoutId, workouts))}/>)}        {view === "exercises" && <ExercisesView />}        {view === "plans" && (<PlansView plans={plans} onSave={(plan) => setPlans(savePlan(plan))} onStart={startPlan} onDelete={(planId) => setPlans(deletePlan(planId))}/>)}        {view === "goals" && (<GoalsView preferences={preferences} onSave={(next) => {
                setPreferences(savePreferences(next));
                setView("today");
            }}/>)}      </main>      {showLogger && (<div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowLogger(false)}>          <section className="modal" aria-labelledby="logger-title">            <div className="modal-heading">              <div>                <p className="eyebrow">{activePlan.name}</p>                <h2 id="logger-title">Log workout</h2>              </div>              <button className="close-button" onClick={() => setShowLogger(false)} aria-label="Close logger">                ×              </button>            </div>            <div className="plan-preview">              {workoutExerciseIds.map((id, index) => (<span key={id} className={id === selectedExerciseId ? "plan-exercise active" : "plan-exercise"}>                  {index + 1}.{" "}                  {exercises.find((exercise) => exercise.id === id)?.name}                </span>))}            </div>            <div className="logger-exercises">              {workoutExerciseIds.map((id, index) => {
                const exercise = exercises.find((item) => item.id === id);
                const loggedSets = sessionSets.filter((set) => set.exerciseId === id);
                const plannedExercise = activeSession?.plannedExercises?.find((item) => item.exerciseId === id);
                if (!exercise)
                    return null;
                return (<article className={selectedExerciseId === id ? "logger-exercise active" : "logger-exercise"} key={id}>
                    <button className="logger-exercise-heading" onClick={() => setSelectedExerciseId(id)}>
                        <span className="logger-exercise-number">{String(index + 1).padStart(2, "0")}</span>
                        <span><strong>{exercise.name}</strong><small>{loggedSets.length}/{loggerSetTargets.get(id) ?? exercise.defaultSets} planned {plannedExercise?.setType ?? "working"} sets</small></span>
                        <span className="logger-exercise-state">{loggedSets.length === (loggerSetTargets.get(id) ?? exercise.defaultSets) ? "✓" : ""}</span>
                    </button>
                    {selectedExerciseId === id && <div className="logger-set-entry">
                        <div className="logger-exercise-picker">
                            <div className="logger-picker-heading"><strong>Switch exercise</strong><small>Add any movement for this session only.</small></div>
                            <label>Search movements<input type="search" value={exerciseSearch} onChange={(event) => setExerciseSearch(event.target.value)} placeholder="e.g. lat pulldown" /></label>
                            <label>Selected exercise<select value={selectedExerciseId} onChange={(event) => selectLoggerExercise(event.target.value)}>
                                {selectableExercises.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                            </select></label>
                        </div>
                        {loggedSets.map((set, setIndex) => <div className="logged-set" key={set.id}><span>Set {setIndex + 1}</span><strong>{set.weight} {preferences.weightUnit} × {set.reps}</strong><span>RIR {set.rir ?? "-"} · RPE {set.rpe ?? "-"}</span></div>)}
                        <div className="input-row effort-input-row">
                            <label>Weight<input inputMode="decimal" value={setInput.weight} onChange={(event) => updateSetInput({ weight: event.target.value })}/></label>
                            <label>Reps<input inputMode="numeric" value={setInput.reps} onChange={(event) => updateSetInput({ reps: event.target.value })}/></label>
                            <label>RIR<input inputMode="numeric" min="0" max="5" placeholder="Optional" value={setInput.rir} onChange={(event) => updateSetInput({ rir: event.target.value })}/></label>
                            <label>RPE<input inputMode="numeric" min="1" max="10" placeholder="Optional" value={setInput.rpe} onChange={(event) => updateSetInput({ rpe: event.target.value })}/></label>
                        </div>
                        <button className="secondary-button full" onClick={addSet}>{loggedSets.length >= (loggerSetTargets.get(id) ?? exercise.defaultSets) ? "＋ Log extra working set" : "✓ Log working set"}</button>
                        {loggedSets.length >= (loggerSetTargets.get(id) ?? exercise.defaultSets) && <p className="extra-set-note">The recommendation is complete. Extra sets are recorded and included in your history.</p>}
                    </div>}
                </article>);
            })}            </div>            <div className="logger-legacy-controls">              <label>                Exercise                <select value={selectedExerciseId} onChange={(event) => setSelectedExerciseId(event.target.value)}>                {(workoutExerciseIds.length ? workoutExerciseIds : exercises.map((exercise) => exercise.id)).map((id) => {
                const exercise = exercises.find((item) => item.id === id);
                return exercise ? (<option key={exercise.id} value={exercise.id}>                      {exercise.name}                    </option>) : null;
            })}              </select>            </label>            </div>            <div className="draft-list">              {sessionSets.length === 0 ? (<p className="empty-state">                  Log sets as you move through the plan.                </p>) : (sessionSets.map((set) => (<div className="draft-set" key={set.id}>                    <span>                      {exercises.find((exercise) => exercise.id === set.exerciseId)?.name}{" "}                      · Set {sessionSets.filter((item) => item.exerciseId === set.exerciseId).findIndex((item) => item.id === set.id) + 1}                    </span>                    <strong>                      {set.weight} {preferences.weightUnit} × {set.reps}                    </strong>                    <button onClick={() => updateSessionSets((current) => current.filter((item) => item.id !== set.id))}>                      Remove                    </button>                  </div>)))}            </div>            <button className="primary-button full" disabled={sessionSets.length === 0} onClick={finishWorkout}>              Finish workout            </button>            <p className="timing-note">              Timing is optional. You can add set and rest tracking later              without changing this flow.            </p>          </section>        </div>)}    </div>);
}
export function LegacyTodayView({ plan, workouts, onLog, }: {
    plan: WorkoutTemplate;
    workouts: Workout[];
    onLog: () => void;
}) {
    const lastWorkout = [...workouts].sort((a, b) => b.date.localeCompare(a.date))[0];
    return (<>      <section className="page-intro">        <div>          <p className="eyebrow">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>          <h1>Make today count.</h1>          <p className="lede">            A complete session, grounded in what you actually did.          </p>        </div>        <button className="primary-button" onClick={onLog}>          ＋ Start workout        </button>      </section>      <section className="dashboard-grid">        <div className="recommendation-panel">          <div className="panel-topline">            <span className="status-dot"></span>            <span>Recommended workout</span>            <span className="confidence">Based on your history</span>          </div>          <div className="recommendation-main">            <div>              <p className="eyebrow warm">NEXT SESSION</p>              <h2>{plan.name}</h2>              <p className="recommendation-sub">                {plan.focus} · {planExerciseIds(plan).length} exercises              </p>            </div>            <div className="weight-callout">              <strong>{planExerciseIds(plan).length}</strong>              <span>movements</span>            </div>          </div>          <div className="plan-exercise-list">            {planExerciseIds(plan).map((id, index) => {
            const exercise = exercises.find((item) => item.id === id);
            return exercise ? (<div className="plan-row" key={id}>                  <span>{String(index + 1).padStart(2, "0")}</span>                  <strong>{exercise.name}</strong>                  <small>                    {exercise.defaultSets} × {exercise.repRange.min}–                    {exercise.repRange.max}                  </small>                </div>) : null;
        })}          </div>          <div className="why-box" id="recommendation-changes">            <div className="why-title">              <span className="why-icon">?</span>              <strong>Why this recommendation?</strong>            </div>            <p>              <span>↳</span>              {plan.description}            </p>            <p>              <span>↳</span>Your last logged work informs progression inside              each movement.            </p>            <p>              <span>↳</span>Keep the session flexible if recovery or equipment              changes.            </p>          </div>          <div className="recommendation-actions">            <button className="primary-button" onClick={onLog}>              Start {plan.name}            </button>            <button className="text-button">Change plan →</button>          </div>        </div>        <aside className="side-column">          <div className="mini-panel">            <div className="panel-title">              <span>Recent momentum</span>              <span className="trend-up">↗ +12%</span>            </div>            <div className="metric-number">              3 <span>sessions</span>            </div>            <div className="mini-bars">              <i style={{ height: "38%" }}></i>              <i style={{ height: "58%" }}></i>              <i style={{ height: "46%" }}></i>              <i style={{ height: "80%" }}></i>              <i style={{ height: "68%" }}></i>              <i className="today-bar" style={{ height: "92%" }}></i>            </div>            <div className="bar-labels">              <span>Aug 28</span>              <span>Today</span>            </div>          </div>          <div className="mini-panel last-session">            <div className="panel-title">              <span>Last session</span>              <span>{lastWorkout ? formatDate(lastWorkout.date) : "—"}</span>            </div>            <strong>{lastWorkout?.title ?? "No sessions yet"}</strong>            <p>              {lastWorkout ? `${lastWorkout.sets.length} sets logged` : "Your first session is waiting."}            </p>            <button className="text-button">View details →</button>          </div>        </aside>      </section>      <section className="focus-strip">        <div>          <span className="eyebrow">This week</span>          <strong>Keep the rhythm</strong>        </div>        <div className="focus-stats">          <span>            <strong>2</strong> workouts          </span>          <span>            <strong>6</strong> exercises          </span>          <span>            <strong>0</strong> skipped          </span>        </div>      </section>    </>);
}
function EvaluatedTodayView({ plan, exerciseIds, setTargets, recommendations, decisions, workouts, unit, gyms, todaysContext, fatigue, onContextChange, onLog, onChooseSomethingElse, onDecision, }: {
    plan: WorkoutTemplate;
    exerciseIds: string[];
    setTargets: Map<string, number>;
    recommendations: PlanRecommendation[];
    decisions: RecommendationDecision[];
    workouts: Workout[];
    unit: WeightUnit;
    gyms: Gym[];
    todaysContext: TodaysContext;
    fatigue: "Low" | "Moderate" | "High";
    onContextChange: (context: TodaysContext) => void;
    onLog: () => void;
    onChooseSomethingElse: () => void;
    onDecision: (recommendation: PlanRecommendation, decision: "accepted" | "rejected" | "dismissed") => void;
}) {
    const lastWorkout = [...workouts].sort((a, b) => b.date.localeCompare(a.date))[0];
    const workoutHealth = evaluateWorkout(plan, exercises, todaysContext);
    const changes = recommendations.filter((recommendation) => recommendation.type !== "KEEP").slice(0, 4);
    useEffect(() => {
        document.querySelectorAll(".fatigue-indicator").forEach((element) => { element.textContent = element.textContent?.replace("Fatigue", "Recent workload") ?? "Recent workload"; });
        document.querySelectorAll(".brief-row span").forEach((element) => { if (element.textContent === "Estimated fatigue") element.textContent = "Recent workload"; });
        const column = document.querySelector(".side-column");
        if (!column) return;
        const panel = document.createElement("section");
        panel.className = "mini-panel workout-health-panel";
        const warnings = workoutHealth.findings.filter((finding) => finding.severity !== "info");
        panel.innerHTML = `<div class="panel-title"><span>Workout focus</span><span>${workoutHealth.plannedSets} sets</span></div><p class="workout-health-coverage">${Object.entries(workoutHealth.primaryMuscleSets).map(([muscle, sets]) => `${muscle} ${sets}`).join(" · ") || "No direct working sets"}</p>${warnings.length ? warnings.map((finding) => `<div class="workout-health-finding ${finding.severity}"><strong>${finding.title}</strong><span>${finding.description}</span></div>`).join("") : "<p class=\"workout-health-ok\">No structural concerns identified.</p>"}`;
        column.insertBefore(panel, column.children[1] ?? null);
        return () => panel.remove();
    }, [workoutHealth]);
    const hasWorkout = exerciseIds.length > 0;
    return (<>      <section className="page-intro">        <div>          <p className="eyebrow">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>          <h1>Today's Recommendation</h1>          <p className="lede">            A focused session based on your plan, recent training, and performance.          </p>        </div>        <button className="primary-button" onClick={hasWorkout ? onLog : onChooseSomethingElse}>          {hasWorkout ? "Start workout" : "Create a plan"}        </button>      </section>      <section className="dashboard-grid">        <div className="recommendation-panel">          <div className="panel-topline">            <span className="status-dot"></span>            <span>Recommended session</span>            <span className="confidence">              {recommendations.length} observations            </span>            <span className="fatigue-indicator">Fatigue {fatigue}</span>          </div>          <div className="recommendation-main">            <div>              <p className="eyebrow warm">YOUR NEXT WORKOUT · LOADS IN {unit}</p>              <h2>{plan.name}</h2>              <p className="recommendation-sub">                Based on your plan, recent training, and performance.              </p>            </div>            <div className="weight-callout">              <strong>{exerciseIds.length}</strong>              <span>movements</span>            </div>          </div>          <div className="today-plan-list">            <div className="today-plan-label">Recommended working sets</div>            {!hasWorkout && <p className="empty-state">Create your first plan to give Bobby a routine to adapt and evaluate.</p>}            {exerciseIds.map((id, index) => {
            const exercise = exercises.find((item) => item.id === id);
            const progression = recommendations.find((item) => item.type === "PROGRESSION" && item.exerciseId === id)?.progression;
            const prescription = plan.plannedExercises?.find((item) => item.exerciseId === id);
            return exercise ? (<div className="today-plan-row" key={id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{exercise.name}</strong><small>{setTargets.get(id) ?? exercise.defaultSets} sets · {prescription?.repRange.min ?? exercise.repRange.min}–{prescription?.repRange.max ?? exercise.repRange.max} reps</small></div>
                <div className="today-progression">
                    <small className="today-load">{progression?.weight ? `${progression.weight} ${unit}` : "Use last session"}</small>
                    {progression?.confidence && <span className={`progression-confidence ${progression.confidence}`}>{progression.confidence} confidence</span>}
                </div>
            </div>) : null;
        })}          </div>          <details className="context-controls">            <summary>              <span>Today's context</span>              <small>{gyms.find((gym) => gym.id === todaysContext.gymId)?.name ?? "Gym not set"}{todaysContext.availableMinutes ? ` · ${todaysContext.availableMinutes} min` : ""}</small>            </summary>            <p className="context-help">Temporary constraints adapt today’s workout only;
 your saved plan stays unchanged.</p>            <label className="context-select">              Gym              <select value={todaysContext.gymId} onChange={(event) => onContextChange({ ...todaysContext, gymId: event.target.value })}>                {gyms.map((gym) => <option key={gym.id} value={gym.id}>{gym.name}</option>)}              </select>            </label>            <label className="context-select">              Available time (minutes)              <input type="number" min="10" max="240" placeholder="Optional" value={todaysContext.availableMinutes ?? ""} onChange={(event) => onContextChange({ ...todaysContext, availableMinutes: event.target.value ? Number(event.target.value) : undefined })}/>            </label>            <fieldset className="equipment-options">              <legend>Equipment unavailable</legend>              {(gyms.find((gym) => gym.id === todaysContext.gymId)?.equipment ?? equipmentOptions).map((equipment) => (<label key={equipment}>                  <input type="checkbox" checked={todaysContext.unavailableEquipment.includes(equipment)} onChange={() => onContextChange({ ...todaysContext, unavailableEquipment: todaysContext.unavailableEquipment.includes(equipment) ? todaysContext.unavailableEquipment.filter((item) => item !== equipment) : [...todaysContext.unavailableEquipment, equipment], })}/>                  {equipment.replace("-", " ")}                </label>))}            </fieldset>          </details>          <div className="why-box" id="recommendation-changes">            <div className="why-title">              <span className="why-icon">i</span>              <strong>Suggestions</strong>            </div>            {changes.length === 0 ? (<p>                <span>↳</span>No changes are strongly supported by the current                history. Keep following your plan.              </p>) : (changes.map((item) => (<RecommendationRow key={item.id} recommendation={item} unit={unit} decision={latestRecommendationDecision(item.id, decisions)} onDecision={onDecision}/>)))}          </div>          <div className="recommendation-actions">            <button className="primary-button" onClick={hasWorkout ? onLog : onChooseSomethingElse}>              {hasWorkout ? "Start workout" : "Create a plan"}            </button>            <button className="text-button" onClick={onChooseSomethingElse}>Choose something else</button>          </div>        </div>        <aside className="side-column">          <div className="mini-panel session-brief">            <div className="panel-title">              <span>Session brief</span>            </div>            <div className="brief-row">              <span>Exercises</span>              <strong>{exerciseIds.length}</strong>            </div>            <div className="brief-row">              <span>Planned sets</span>              <strong>{exerciseIds.reduce((total, id) => total + (setTargets.get(id) ?? exercises.find((exercise) => exercise.id === id)?.defaultSets ?? 0), 0)}</strong>            </div>            <div className="brief-row">              <span>Gym</span>              <strong>{gyms.find((gym) => gym.id === todaysContext.gymId)?.name ?? "Not set"}</strong>            </div>            <div className="brief-row">              <span>Estimated fatigue</span>              <strong className={`fatigue-${fatigue.toLowerCase()}`}>{fatigue}</strong>            </div>            <p className="brief-note">Your routine is the baseline. Bobby only proposes changes where today's context or your history gives it a reason.</p>          </div>          <div className="mini-panel last-session">            <div className="panel-title">              <span>Last session</span>              <span>{lastWorkout ? formatDate(lastWorkout.date) : "—"}</span>            </div>            <strong>{lastWorkout?.title ?? "No sessions yet"}</strong>            <p>              {lastWorkout ? `${lastWorkout.sets.length} sets logged` : "Your first session is waiting."}            </p>          </div>        </aside>      </section>    </>);
}
function RecommendationRow({ recommendation, unit = "lb", decision, onDecision, }: {
    recommendation: PlanRecommendation;
    unit?: WeightUnit;
    decision?: string;
    onDecision: (recommendation: PlanRecommendation, decision: "accepted" | "rejected" | "dismissed") => void;
}) {
    const exercise = exercises.find((item) => item.id === recommendation.exerciseId);
    const alternative = recommendation.alternativeExerciseId ? exercises.find((item) => item.id === recommendation.alternativeExerciseId) : undefined;
    const requiredToday = recommendation.trace.ruleId === "adapt-unavailable-equipment";
    return (<div className="recommendation-row">      <div>        <strong>{recommendation.type}</strong>{" "}        <span>          {alternative ? `${exercise?.name} → ${alternative.name}` : exercise?.name}        </span>        {recommendation.progression && (<small>            {recommendation.progression.weight ? `${recommendation.progression.weight} ${unit} · ${recommendation.progression.sets} × ${recommendation.progression.repRange.min}–${recommendation.progression.repRange.max}` : "Start with a manageable load"}          </small>)}        <small>{recommendation.reasons[0]}</small>        <details className="recommendation-details">          <summary>Why</summary>          {recommendation.reasons.slice(1).map((reason) => (<small key={reason}>{reason}</small>))}          <small>{recommendation.trace.principleDescription}</small>          <small className="evidence-badge">            Evidence {recommendation.trace.evidenceLevel} ·{" "}            {recommendation.trace.source.name}          </small>        </details>      </div>      <div className="recommendation-controls">        {requiredToday ? (<span className="recommendation-status applied">Applied today</span>) : decision === "accepted" ? (<>            <span className="recommendation-status accepted">Accepted</span>            <button onClick={() => onDecision(recommendation, "dismissed")}>Keep plan</button>          </>) : decision === "dismissed" ? (<>            <span className="recommendation-status dismissed">Keeping plan</span>            <button onClick={() => onDecision(recommendation, "accepted")}>Accept</button>          </>) : (<>            <button onClick={() => onDecision(recommendation, "accepted")}>Accept</button>            <button onClick={() => onDecision(recommendation, "dismissed")}>Keep plan</button>          </>)}      </div>    </div>);
}
function GoalsForm({ preferences, onSave, }: {
    preferences: UserPreferences;
    onSave: (preferences: UserPreferences) => void;
}) {
    const [goals, setGoals] = useState<TrainingGoal[]>(preferences.goals);
    const [priorities, setPriorities] = useState(preferences.priorities);
    const goalOptions: TrainingGoal[] = ["Build muscle", "Get stronger", "Improve athletic performance", "Improve a specific skill", "General fitness",];
    const priorityOptions = ["Chest", "Upper chest", "Back", "Shoulders", "Arms", "Quads", "Hamstrings", "Glutes", "Side delts",];
    function toggle<T>(items: T[], item: T) {
        return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
    }
    return (<>      <section className="page-intro compact">        <div>          <p className="eyebrow">Personal settings</p>          <h1>What are you training for?</h1>          <p className="lede">            Keep it simple. Bobby uses these priorities to evaluate your            existing plans.          </p>        </div>      </section>      <section className="goals-layout">        <div className="goals-panel">          <p className="eyebrow">Primary goals</p>          <div className="goal-options">            {goalOptions.map((goal) => (<button key={goal} className={goals.includes(goal) ? "goal-option active" : "goal-option"} onClick={() => setGoals(toggle(goals, goal))}>                {goals.includes(goal) ? "✓" : "+"} {goal}              </button>))}          </div>          <p className="eyebrow priority-label">            Anything you particularly want to improve?          </p>          <div className="priority-options">            {priorityOptions.map((priority) => (<button key={priority} className={priorities.includes(priority) ? "filter-chip active" : "filter-chip"} onClick={() => setPriorities(toggle(priorities, priority))}>                {priority}              </button>))}          </div>          <button className="primary-button save-goals" onClick={() => onSave({ ...preferences, goals, priorities })}>            Save preferences          </button>        </div>        <aside className="mini-panel goals-note">          <span className="why-icon">i</span>          <h2>How this helps</h2>          <p>            Your choices become structured evidence for plan evaluation. They            can suggest an addition or support keeping an exercise, but Bobby            will not change your plan automatically.          </p>        </aside>      </section>    </>);
}
function GoalsView({ preferences, onSave, }: {
        preferences: UserPreferences;
        onSave: (preferences: UserPreferences) => void;
}) {
        const [bodyweightLb, setBodyweightLb] = useState(preferences.bodyweightLb?.toString() ?? "");
        return (<>
            <GoalsForm preferences={preferences} onSave={onSave} />
            <section className="goals-layout bodyweight-settings">
                <div className="goals-panel">
                    <p className="eyebrow">Calisthenics</p>
                    <h2>Bodyweight loading</h2>
                    <p className="lede">Bobby uses this to calculate bodyweight, weighted, and assisted pull-up or dip loads.</p>
                    <label className="bodyweight-field">Current bodyweight (lb)
                        <input type="number" min="1" step="0.1" value={bodyweightLb} onChange={(event) => setBodyweightLb(event.target.value)} placeholder="e.g. 175" />
                    </label>
                    <button className="primary-button save-goals" onClick={() => onSave({ ...preferences, bodyweightLb: bodyweightLb.trim() ? Number(bodyweightLb) : undefined })}>Save bodyweight</button>
                </div>
            </section>
        </>);
}
function HistoryView({ workouts, unit, onUpdate, onDelete, }: {
        workouts: Workout[];
        unit: WeightUnit;
        onUpdate?: (workout: Workout) => void;
        onDelete: (workoutId: string) => void;
}) {
        const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
        const [editingSets, setEditingSets] = useState<LoggedSet[]>([]);
        const [newExerciseId, setNewExerciseId] = useState(exercises[0].id);
        const [newWeight, setNewWeight] = useState("");
        const [newReps, setNewReps] = useState("");
        const sortedWorkouts = [...workouts].sort((a, b) => b.date.localeCompare(a.date) || (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
        const selectedWorkout = sortedWorkouts.find((workout) => workout.id === selectedWorkoutId);
        const plannedComparison = selectedWorkout ? comparePlannedVsActual(selectedWorkout) : [];
        function selectWorkout(workout: Workout) {
                setSelectedWorkoutId(workout.id);
                setEditingSets(workout.sets.map((set) => ({ ...set })));
        }
        function saveEdits() {
                if (!selectedWorkout) return;
            const updated = { ...selectedWorkout, sets: editingSets };
            if (onUpdate) onUpdate(updated);
            else {
                updateWorkout(updated);
                window.location.reload();
            }
        }
        function addSet() {
            if (!selectedWorkout) return;
            const weight = Number(newWeight);
            const reps = Number(newReps);
            if (!Number.isFinite(weight) || !Number.isFinite(reps) || reps <= 0) return;
            setEditingSets((current) => [...current, {
                id: crypto.randomUUID(),
                exerciseId: newExerciseId,
                setType: 'working',
                weight: convertWeight(weight, unit, selectedWorkout.unit ?? unit),
                reps,
                completedAt: selectedWorkout.completedAt,
            }]);
            setNewWeight("");
            setNewReps("");
        }
        function displayedWeight(set: LoggedSet, workout: Workout) {
            return displayWeight(effectiveLoad(set, loadPreferences().bodyweightLb), workout.unit, unit);
        }
        return (<>
            <section className="page-intro compact"><div><p className="eyebrow">Your training archive</p><h1>History</h1><p className="lede">Every session is evidence. Open one to inspect or correct what you logged.</p></div><span className="archive-count">{workouts.length} sessions</span></section>
            <div className="history-layout">
                <section className="history-list"><div className="section-heading"><h2>Recent workouts</h2><span className="muted">Newest first</span></div>
                      {sortedWorkouts.map((workout) => <article className={selectedWorkoutId === workout.id ? "workout-row selected" : "workout-row"} key={workout.id} tabIndex={0} onClick={() => selectWorkout(workout)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") selectWorkout(workout); }}>
                        <div className="date-block"><strong>{new Date(`${workout.date}T12:00:00`).toLocaleDateString("en-US", { day: "2-digit" })}</strong><span>{new Date(`${workout.date}T12:00:00`).toLocaleDateString("en-US", { month: "short" })}</span></div>
                        <div className="workout-info"><strong>{workout.title}</strong><span>{new Set(workout.sets.map((set) => set.exerciseId)).size} exercises · {workout.sets.length} sets · {workout.unit ?? unit}</span></div>
                        <button className="delete-button" onClick={(event) => { event.stopPropagation(); if (window.confirm(`Delete ${workout.title} from history?`)) onDelete(workout.id); }} aria-label={`Delete ${workout.title} on ${workout.date}`}>×</button>
                    </article>)}
                </section>
                <aside className="progression-detail history-detail">
                    {selectedWorkout ? <>
                        <div className="section-heading"><div><p className="eyebrow">{formatDate(selectedWorkout.date)}</p><h2>{selectedWorkout.title}</h2></div><span className="muted">{editingSets.length} sets</span></div>
                        {plannedComparison.length > 0 && <div className="history-plan-comparison">{plannedComparison.map((item) => <span key={item.exerciseId}>{exercises.find((exercise) => exercise.id === item.exerciseId)?.name}: {item.completedWorkingSets}/{item.plannedSets} working sets · demonstrated load {item.demonstratedWorkingLoad ?? "—"}</span>)}</div>}
                        <div className="history-set-list">{editingSets.map((set, index) => <div className="history-set-row" key={set.id}><span>{exercises.find((exercise) => exercise.id === set.exerciseId)?.name ?? set.exerciseId}<small>Set {index + 1} · {set.setType}</small></span><input aria-label="Weight" type="number" readOnly={Boolean(set.loadType && set.loadType !== "external")} value={displayedWeight(set, selectedWorkout)} onChange={(event) => setEditingSets((current) => current.map((item) => item.id === set.id ? { ...item, weight: convertWeight(Number(event.target.value), unit, selectedWorkout.unit ?? unit) } : item))} /><input aria-label="Reps" type="number" value={set.reps} onChange={(event) => setEditingSets((current) => current.map((item) => item.id === set.id ? { ...item, reps: Number(event.target.value) } : item))} /><span>{unit}</span></div>)}</div>
                        <div className="history-add-set">
                            <select aria-label="Exercise for new set" value={newExerciseId} onChange={(event) => setNewExerciseId(event.target.value)}>
                                {exercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}
                            </select>
                            <input aria-label="New set weight" type="number" min="0" value={newWeight} onChange={(event) => setNewWeight(event.target.value)} placeholder={`Weight (${unit})`} />
                            <input aria-label="New set reps" type="number" min="1" value={newReps} onChange={(event) => setNewReps(event.target.value)} placeholder="Reps" />
                            <button className="secondary-button" onClick={addSet}>Add set</button>
                        </div>
                        <button className="primary-button full" onClick={saveEdits}>Save changes</button>
                    </> : <p className="empty-state">Select a workout to see every set and edit the logged weight or reps.</p>}
                </aside>
            </div>
        </>);
}

export function LegacyHistoryView({ workouts, unit, onDelete, }: {
    workouts: Workout[];
    unit: WeightUnit;
    onDelete: (workoutId: string) => void;
}) {
    const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
    const selected = exercises.find((exercise) => exercise.id === selectedExerciseId);
    const exerciseSets = workouts.flatMap((workout) => workout.sets.filter((set) => set.exerciseId === selectedExerciseId).map((set) => ({ ...set, weight: displayWeight(set.weight, workout.unit, unit), date: workout.date, })));
    return (<>      <section className="page-intro compact">        <div>          <p className="eyebrow">Your training archive</p>          <h1>History</h1>          <p className="lede">            Every session is evidence. Browse the work, then spot the trend.          </p>        </div>        <span className="archive-count">{workouts.length} sessions</span>      </section>      <div className="history-layout">        <section className="history-list">          <div className="section-heading">            <h2>Recent workouts</h2>            <span className="muted">Newest first</span>          </div>          {workouts.map((workout) => (<article className="workout-row" key={workout.id}>              <div className="date-block">                <strong>                  {new Date(`${workout.date}T12:00:00`).toLocaleDateString("en-US", { day: "2-digit" })}                </strong>                <span>                  {new Date(`${workout.date}T12:00:00`).toLocaleDateString("en-US", { month: "short" })}                </span>              </div>              <div className="workout-info">                <strong>{workout.title}</strong>                <span>                  {new Set(workout.sets.map((set) => set.exerciseId)).size}{" "}                  exercises · {workout.sets.length} sets ·{" "}                  {workout.unit ?? unit}                </span>              </div>              <button className="delete-button" onClick={() => {
                if (window.confirm(`Delete ${workout.title} from history?`)) {
                    onDelete(workout.id);
                }
            }} aria-label={`Delete ${workout.title} on ${workout.date}`}>                ×              </button>            </article>))}        </section>        <aside className="progression-detail">          <div className="section-heading">            <h2>Exercise progression</h2>          </div>          <select value={selectedExerciseId ?? ""} onChange={(event) => setSelectedExerciseId(event.target.value || null)}>            <option value="">Select an exercise</option>            {exercises.map((exercise) => (<option key={exercise.id} value={exercise.id}>                {exercise.name}              </option>))}          </select>          {selected ? (<div className="progression-content">              <p className="eyebrow">{selected.name}</p>              <div className="progression-stat">                <strong>                  {exerciseSets.length ? exerciseSets[0].weight : 0}                </strong>                <span>{unit} latest load</span>              </div>              {exerciseSets.slice(0, 8).map((set) => (<div className="progression-set" key={`${set.id}-${set.date}`}>                  <span>{formatDate(set.date)}</span>                  <strong>                    {set.weight} {unit} × {set.reps}                  </strong>                </div>))}            </div>) : (<p className="empty-state">              Choose an exercise to see its set-by-set progression.            </p>)}        </aside>      </div>    </>);
}
function ExercisesView() {
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState("All");
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const workouts = useMemo(() => loadWorkouts(), []);
    const categories = ["All", ...new Set(exercises.map((exercise) => exercise.category)),];
    const filteredExercises = exercises.filter((exercise) => {
        const haystack = `${exercise.name} ${exercise.category} ${exercise.equipment} ${exercise.primaryMuscles.join(" ")}`.toLowerCase();
        return (haystack.includes(query.toLowerCase()) && (filter === "All" || exercise.category === filter));
    });
    return (<>      <section className="page-intro compact">        <div>          <p className="eyebrow">Exercise database</p>          <h1>Every movement, in one place.</h1>          <p className="lede">            Search by movement, muscle, or equipment. Open an exercise to            inspect its training context.          </p>        </div>      </section>      <div className="library-toolbar">        <label className="search-field">          <span>⌕</span>          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercises, muscles, equipment..." aria-label="Search exercises"/>          {query && (<button onClick={() => setQuery("")} aria-label="Clear search">              ×            </button>)}        </label>        <div className="filter-row">          {categories.map((category) => (<button key={category} className={filter === category ? "filter-chip active" : "filter-chip"} onClick={() => setFilter(category)}>              {category}            </button>))}        </div>      </div>      <div className="result-line">        <span>{filteredExercises.length} movements</span>        <span>Click a row for details</span>      </div>      <div className="exercise-library">        {filteredExercises.map((exercise) => {
            const expanded = expandedId === exercise.id;
            const state = calculateExerciseFeatures(exercise, workouts);
            return (<article className={expanded ? "library-card expanded" : "library-card"} key={exercise.id}>
                <button className="exercise-row-trigger" onClick={() => setExpandedId(expanded ? null : exercise.id)} aria-expanded={expanded}>
                    <span className="library-icon">{exercise.type === "compound" ? "◎" : "◒"}</span>
                    <span className="library-copy"><span className="card-kicker">{exercise.type} · {exercise.category}</span><strong>{exercise.name}</strong><small>{exercise.equipment}</small></span>
                    <span className="expand-mark">{expanded ? "−" : "+"}</span>
                </button>
                {expanded && <div className="exercise-details">
                    <div><span className="detail-label">Primary muscles</span><div className="tag-list">{exercise.primaryMuscles.map((muscle) => <span key={muscle}>{muscle}</span>)}</div></div>
                    <div className="detail-grid">
                        <div><span className="detail-label">Goals</span><strong>{exercise.goals.join(" · ")}</strong></div>
                        <div><span className="detail-label">Working range</span><strong>{exercise.defaultSets} sets · {exercise.repRange.min}–{exercise.repRange.max} reps</strong></div>
                        <div><span className="detail-label">Equipment</span><strong>{exercise.equipment}</strong></div>
                        <div><span className="detail-label">Pattern</span><strong>{exercise.category}</strong></div>
                    </div>
                    <div className="exercise-progress-summary"><span className="detail-label">Your recent performance</span>{state.sessionsPerformed > 0 ? <><strong>{state.progressionState}</strong><span>{state.sessionsPerformed} sessions · best recent working load {state.recentBestWorkingLoad ?? "—"} · {state.historyConfidence} evidence</span></> : <span>No working-set history yet.</span>}</div>
                </div>}
            </article>);
        })}        {filteredExercises.length === 0 && (<div className="no-results">            <strong>No movements found</strong>            <span>Try a different name, muscle, or equipment.</span>          </div>)}      </div>    </>);
}
export function LegacyExercisesView({ onSelect, }: {
    onSelect: (id: string) => void;
}) {
    const [section, setSection] = useState<"exercises" | "workouts">("exercises");
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState("All");
    const [savedIds, setSavedIds] = useState(() => new Set(loadSavedTemplates().map((template) => template.id)));
    const categories = ["All", ...new Set(exercises.map((exercise) => exercise.category)),];
    const filteredExercises = exercises.filter((exercise) => {
        const haystack = `${exercise.name} ${exercise.category} ${exercise.equipment} ${exercise.primaryMuscles.join(" ")}`.toLowerCase();
        return (haystack.includes(query.toLowerCase()) && (filter === "All" || exercise.category === filter));
    });
    function saveTemplate(id: string) {
        const template = workoutTemplates.find((item) => item.id === id);
        if (!template)
            return;
        const next = toggleSavedTemplate(template);
        setSavedIds(new Set(next.map((item) => item.id)));
    }
    return (<>      <section className="page-intro compact">        <div>          <p className="eyebrow">Training library</p>          <h1>Build your session.</h1>          <p className="lede">            Find a movement or start with a ready-made plan.          </p>        </div>      </section>      <div className="library-tabs" role="tablist">        <button className={section === "exercises" ? "library-tab active" : "library-tab"} onClick={() => setSection("exercises")}>          Exercises <span>{exercises.length}</span>        </button>        <button className={section === "workouts" ? "library-tab active" : "library-tab"} onClick={() => setSection("workouts")}>          Premade workouts <span>{workoutTemplates.length}</span>        </button>      </div>      {section === "exercises" ? (<>          <div className="library-toolbar">            <label className="search-field">              <span>⌕</span>              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercises, muscles, equipment..." aria-label="Search exercises"/>              {query && (<button onClick={() => setQuery("")} aria-label="Clear search">                  ×                </button>)}            </label>            <div className="filter-row">              {categories.map((category) => (<button key={category} className={filter === category ? "filter-chip active" : "filter-chip"} onClick={() => setFilter(category)}>                  {category}                </button>))}            </div>          </div>          <div className="result-line">            <span>{filteredExercises.length} movements</span>            <span>Tap a movement to use it today</span>          </div>          <div className="exercise-library">            {filteredExercises.map((exercise) => (<article className="library-card" key={exercise.id}>                <div className="library-icon">                  {exercise.type === "compound" ? "◎" : "◒"}                </div>                <div className="library-copy">                  <div className="card-kicker">                    {exercise.type} · {exercise.category}                  </div>                  <h2>{exercise.name}</h2>                  <p>{exercise.equipment}</p>                  <div className="tag-list">                    {exercise.primaryMuscles.map((muscle) => (<span key={muscle}>{muscle}</span>))}                  </div>                </div>                <button className="outline-button" onClick={() => onSelect(exercise.id)}>                  Use today →                </button>              </article>))}            {filteredExercises.length === 0 && (<div className="no-results">                <strong>No movements found</strong>                <span>Try a different name, muscle, or equipment.</span>              </div>)}          </div>        </>) : (<div className="template-grid">          {workoutTemplates.map((template) => (<article className="template-card" key={template.id}>              <div className="template-art">                <span>{template.name.slice(0, 1)}</span>                <small>{planExerciseIds(template).length} exercises</small>              </div>              <div className="template-body">                <div className="card-kicker">{template.focus}</div>                <h2>{template.name}</h2>                <p>{template.description}</p>                <div className="template-exercises">                  {planExerciseIds(template).slice(0, 4).map((id) => (<span key={id}>                      {exercises.find((exercise) => exercise.id === id)?.name}                    </span>))}                </div>                <div className="template-actions">                  <button className="primary-button">Start workout</button>                  <button className={savedIds.has(template.id) ? "save-button saved" : "save-button"} onClick={() => saveTemplate(template.id)}>                    {savedIds.has(template.id) ? "♥ Saved" : "♡ Save"}                  </button>                </div>              </div>            </article>))}        </div>)}    </>);
}
function PlansView({ plans, onSave, onStart, onDelete, }: {
    plans: WorkoutTemplate[];
    onSave: (plan: WorkoutTemplate) => void;
    onStart: (plan: WorkoutTemplate) => void;
    onDelete: (planId: string) => void;
}) {
    const [name, setName] = useState("");
    const [focus, setFocus] = useState("");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [exerciseToAdd, setExerciseToAdd] = useState(exercises[0].id);
    function addExercise() {
        if (!selectedIds.includes(exerciseToAdd))
            setSelectedIds((current) => [...current, exerciseToAdd]);
    }
    function createPlan() {
        if (!name.trim() || selectedIds.length === 0)
            return;
        onSave({ id: `plan-${crypto.randomUUID()}`, name: name.trim(), description: "A plan built around your current priorities.", focus: focus.trim() || "Personal plan", plannedExercises: selectedIds.map((id, order) => createPlannedExercise(id, order, exercises.find((exercise) => exercise.id === id))), exerciseIds: selectedIds, });
        setName("");
        setFocus("");
        setSelectedIds([]);
    }
    const emptyWorkoutPlan: WorkoutTemplate = { ...emptyPlan, id: "empty-workout", name: "Empty workout", description: "Log any exercises you choose without changing a saved plan.", focus: "Manual logging" };
    const allPlans = [emptyWorkoutPlan, ...plans, ...workoutTemplates.filter((template) => !plans.some((plan) => plan.id === template.id)),];
    return (<>      <section className="page-intro compact">        <div>          <p className="eyebrow">Your training system</p>          <h1>Plans</h1>          <p className="lede">            Create the days you want to repeat. Bobby will keep the history and            progression underneath.          </p>        </div>      </section>      <div className="plan-builder-layout">        <section className="plan-builder">          <div className="section-heading">            <div>              <p className="eyebrow">New plan</p>              <h2>Build your own day</h2>            </div>            <span className="plan-count">{selectedIds.length} exercises</span>          </div>          <div className="input-row">            <label>              Plan name              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Pull day"/>            </label>            <label>              Focus              <input value={focus} onChange={(event) => setFocus(event.target.value)} placeholder="e.g. Back · Biceps"/>            </label>          </div>          <label className="add-exercise-label">            Add an exercise            <select value={exerciseToAdd} onChange={(event) => setExerciseToAdd(event.target.value)}>              {exercises.map((exercise) => (<option key={exercise.id} value={exercise.id}>                  {exercise.name}                </option>))}            </select>          </label>          <button className="secondary-button" onClick={addExercise}>            ＋ Add to plan          </button>          <div className="builder-list">            {selectedIds.length === 0 ? (<p className="empty-state">                Your plan is empty. Add the movements you want to train.              </p>) : (selectedIds.map((id, index) => {
            const exercise = exercises.find((item) => item.id === id);
            return exercise ? (<div className="builder-row" key={id}>                    <span>{String(index + 1).padStart(2, "0")}</span>                    <strong>{exercise.name}</strong>                    <small>                      {exercise.defaultSets} sets · {exercise.repRange.min}–                      {exercise.repRange.max}                    </small>                    <button onClick={() => setSelectedIds((current) => current.filter((item) => item !== id))} aria-label={`Remove ${exercise.name}`}>                      ×                    </button>                  </div>) : null;
        }))}          </div>          <button className="primary-button" disabled={!name.trim() || selectedIds.length === 0} onClick={createPlan}>            Save plan          </button>        </section>        <aside className="saved-plans">          <div className="section-heading">            <div>              <p className="eyebrow">Ready when you are</p>              <h2>Saved plans</h2>            </div>          </div>          {allPlans.map((plan) => (<article className="saved-plan" key={plan.id}>              <div>                <strong>{plan.name}</strong>                <span>                  {plan.focus} · {planExerciseIds(plan).length} exercises                </span>              </div>              <div className="saved-plan-actions">                <button className="text-button" onClick={() => onStart(plan)}>                  Start →                </button>                {plans.some((item) => item.id === plan.id) && (<button className="delete-button" onClick={() => {
                    if (window.confirm(`Delete ${plan.name}?`))
                        onDelete(plan.id);
                }} aria-label={`Delete ${plan.name}`}>                    ×                  </button>)}              </div>            </article>))}        </aside>      </div>    </>);
}
function formatDate(date: string) {
    return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", });
}
export default App;
