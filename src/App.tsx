import { ExercisePicker } from './components/ExercisePicker'
import { addSessionExercise, switchSessionExercise, validSessionDate } from './domain/session-editing'
import { findExerciseCandidates } from './domain/exercise-intelligence'
import { deriveCoachingPreferences } from './domain/coaching-preferences'
import { currentCoachingDate } from './domain/coaching-date'
import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import "./styles/interface.css";
import { Navigation, type View } from "./components/Navigation";
import { TodayDashboard } from "./components/TodayDashboard";
import { WorkoutSummary } from "./components/WorkoutSummary";
import { LoadTarget } from "./components/LoadTarget";
import { contextForGym, defaultGym } from "./domain/gyms";
import { exercises } from "./domain/exercises";
import { workoutTemplates } from "./domain/templates";
import { comparePlannedVsActual } from "./domain/features";
import { deriveTrainingState, exerciseTrainingState } from "./domain/training-state";
import { resolveMusclePriorities } from "./domain/muscle-priorities";
import { evaluateSplit } from "./domain/split-evaluator";
import { generateRecommendations, recommendationExerciseId } from "./domain/recommendations";
import { generateRecommendedWorkout, skipRecommendedExercise, type RecommendedWorkout } from "./domain/recommended-workout";
import { loadLocalFileSnapshot, restoreBrowserData, saveLocalFileSnapshot } from "./domain/local-file-sync";
 import { clearActiveWorkoutSession, loadActiveWorkoutSession, loadPlans, loadPreferences, loadWorkouts, loadGyms, loadRecommendationDecisions, loadTodaysContext, deletePlan, deleteWorkout, persistWorkouts, saveActiveWorkoutSession, savePlan, savePreferences, saveRecommendationDecision, saveWorkout, updateWorkout, saveTodaysContext, } from "./domain/storage";
import { affectedExerciseIds, decisionForRecommendation } from "./domain/session-provenance";
import { applyAcceptedRecommendation } from "./domain/plan-actions";
import { captureSessionGym, completeWorkoutSession, createPlannedExercise, createWorkoutSession, createWorkoutSessionForToday, planExerciseIds, plannedExercisesFor, resolveWorkoutForToday, sessionExercises, sessionLoadInput } from "./domain/workout-session";
import { saveGyms } from "./domain/storage";
import { convertWeight, displayWeight, effectiveLoad } from "./domain/units";
import type { TrainingState, LoggedSet, Recommendation, TrainingGoal, UserPreferences, WeightUnit, Workout, WorkoutSession, WorkoutTemplate, Gym, RecommendationDecision, TodaysContext, Split, } from "./domain/models";
type SetInput = {
    weight: string;
    reps: string;
    rir: string;
    rpe: string;
};
const emptyPlan: WorkoutTemplate = { id: "no-plan-selected", name: "No workout selected", description: "Create a plan first, then Bobby can recommend how to perform it today.", focus: "Your training plan", plannedExercises: [], exerciseIds: [], };
function App() {
    const loggerRef = useRef<HTMLElement>(null);
    const [view, setView] = useState<View>("today");
    const [completedWorkoutId, setCompletedWorkoutId] = useState<string>();
    const [startNotice, setStartNotice] = useState('');
    const [workouts, setWorkouts] = useState<Workout[]>(() => loadWorkouts());
    const [selectedExerciseId, setSelectedExerciseId] = useState(() => (loadActiveWorkoutSession() ? sessionExercises(loadActiveWorkoutSession()!)[0]?.exerciseId : undefined) ?? "");
    const [picker, setPicker] = useState<{ mode: 'add' | 'switch'; fromId?: string }>();
    const [confirmCancel, setConfirmCancel] = useState(false);
    const [activeSession, setActiveSession] = useState<WorkoutSession | null>(() => loadActiveWorkoutSession());
    const [setInputOverrides, setSetInputOverrides] = useState<Record<string, SetInput>>({});
    const [showLogger, setShowLogger] = useState(() => Boolean(loadActiveWorkoutSession()));
    const [recommendationDecisions, setRecommendationDecisions] = useState<RecommendationDecision[]>(() => loadRecommendationDecisions());
    const [activePlan, setActivePlan] = useState<WorkoutTemplate>(() => loadPlans()[0] ?? emptyPlan);
    const [plans, setPlans] = useState<WorkoutTemplate[]>(() => loadPlans());
    const [preferences, setPreferences] = useState<UserPreferences>(() => loadPreferences());
    const [gyms, setGyms] = useState<Gym[]>(() => {
        const saved = loadGyms();
        return saved.length > 0 ? saved : [defaultGym];
    });
    const [todaysContext, setTodaysContext] = useState<TodaysContext>(() => loadTodaysContext({ gymId: preferences.defaultGymId ?? defaultGym.id, unavailableEquipment: [] }));
    const [localFileReady, setLocalFileReady] = useState(false);
    useEffect(() => {
        let cancelled = false;
        void loadLocalFileSnapshot().then((snapshot) => {
            if (cancelled || !restoreBrowserData(snapshot))
                return;
            const restoredPreferences = loadPreferences();
            const restoredPlans = loadPlans();
            const restoredGyms = loadGyms();
            const restoredActiveSession = loadActiveWorkoutSession();
            setWorkouts(loadWorkouts());
            setPlans(restoredPlans);
            setActivePlan(restoredPlans[0] ?? emptyPlan);
            setPreferences(restoredPreferences);
            setGyms(restoredGyms.length ? restoredGyms : [defaultGym]);
            setTodaysContext(loadTodaysContext({ gymId: restoredPreferences.defaultGymId ?? defaultGym.id, unavailableEquipment: [] }));
            setRecommendationDecisions(loadRecommendationDecisions());
            setActiveSession(restoredActiveSession);
            setSelectedExerciseId(restoredActiveSession ? sessionExercises(restoredActiveSession)[0]?.exerciseId ?? "" : "");
            setShowLogger(Boolean(restoredActiveSession));
        }).catch(() => {
            // The JSON endpoint exists only during local development; browser storage remains usable without it.
        }).finally(() => {
            if (!cancelled)
                setLocalFileReady(true);
        });
        return () => { cancelled = true; };
    }, []);
    useEffect(() => {
        persistWorkouts(workouts);
    }, [workouts]);
    useEffect(() => {
        if (!localFileReady)
            return;
        void saveLocalFileSnapshot().catch(() => {
            // Keep the app offline-first when the local development server is unavailable.
        });
    }, [activeSession, gyms, localFileReady, plans, preferences, recommendationDecisions, todaysContext, workouts]);
    useEffect(() => {
        if (!localFileReady)
            return;
        const flushLocalFile = () => { void saveLocalFileSnapshot().catch(() => {
            // Browser storage remains available without the development endpoint.
        }); };
        window.addEventListener("beforeunload", flushLocalFile);
        return () => window.removeEventListener("beforeunload", flushLocalFile);
    }, [localFileReady]);
    useEffect(() => {
        if (activeSession)
            saveActiveWorkoutSession(activeSession);
        else
            clearActiveWorkoutSession();
    }, [activeSession]);
    useEffect(() => {
        if (!showLogger) return;
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        loggerRef.current?.focus();
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setShowLogger(false);
            if (event.key !== "Tab") return;
            const focusable = Array.from(loggerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, summary, [tabindex="0"]') ?? []).filter((element) => element.getClientRects().length > 0);
            const first = focusable[0];
            const last = focusable.at(-1);
            if (event.shiftKey && (document.activeElement === first || document.activeElement === loggerRef.current)) {
                event.preventDefault(); last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault(); first?.focus();
            }
        };
        document.addEventListener("keydown", handleKey);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", handleKey);
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, [showLogger]);
    const currentGym = gyms.find((gym) => gym.id === todaysContext.gymId) ?? gyms[0] ?? defaultGym;
    const gymContext = useMemo(() => contextForGym(todaysContext, currentGym), [todaysContext, currentGym]);
    const coachingContext = activeSession?.context ?? gymContext;
    const workoutsInCurrentUnit = useMemo(() => workouts.map((workout) => ({ ...workout, unit: preferences.weightUnit, sets: workout.sets.map((set) => ({ ...set, weight: displayWeight(effectiveLoad(set, preferences.bodyweightLb), workout.unit, preferences.weightUnit), })), })), [preferences.bodyweightLb, preferences.weightUnit, workouts]);
    const [previewDate, setPreviewDate] = useState(currentCoachingDate);
    useEffect(() => {
        const updateDate = () => setPreviewDate(currentCoachingDate());
        const timer = window.setInterval(updateDate, 60_000);
        window.addEventListener('focus', updateDate);
        return () => { window.clearInterval(timer); window.removeEventListener('focus', updateDate); };
    }, []);
    const trainingState = useMemo(() => deriveTrainingState(exercises, workouts, previewDate, preferences.weightUnit, resolveMusclePriorities(preferences).orderedMuscles), [workouts, previewDate, preferences]);
    const recommendedInput = useMemo(() => ({ exercises, history: workouts, preferences, todaysContext: gymContext, asOf: previewDate, trainingState, decisions: recommendationDecisions }), [workouts, preferences, gymContext, previewDate, trainingState, recommendationDecisions]);
    const basePreview = useMemo(() => generateRecommendedWorkout(recommendedInput), [recommendedInput]);
    const [exerciseChoices, setExerciseChoices] = useState<{ base: RecommendedWorkout; skippedIds: string[] }>();
    const skippedIds = exerciseChoices?.base === basePreview ? exerciseChoices.skippedIds : [];
    const previewChanges = useMemo(() => {
        let result = { recommendation: basePreview, message: '' };
        const skipped: string[] = [];
        for (const id of exerciseChoices?.base === basePreview ? exerciseChoices.skippedIds : []) {
            skipped.push(id);
            result = skipRecommendedExercise(recommendedInput, result.recommendation, id, skipped);
        }
        return result;
    }, [basePreview, recommendedInput, exerciseChoices]);
    const recommendedPreview = previewChanges.recommendation;
    const previewPlan = activeSession ? { ...activePlan, name: activeSession.title, focus: activeSession.title, plannedExercises: sessionExercises(activeSession) } : recommendedPreview.workout;
    const activePlanExerciseIds = planExerciseIds(activePlan);
    const currentSplit = useMemo<Split | undefined>(() => plans.length ? { id: "current-plan-collection", name: "Current plans", workoutIds: plans.map((plan) => plan.id) } : undefined, [plans]);
    const planRecommendations = useMemo(() => generateRecommendations({ plan: activePlan, exercises, history: workouts, trainingState, preferences, todaysContext: coachingContext, decisions: recommendationDecisions, split: currentSplit, splitWorkouts: plans, authority: activePlan.planningAuthority ?? "user-plan" }), [activePlan, currentSplit, plans, preferences, recommendationDecisions, coachingContext, workouts, trainingState]);
    const sessionRecommendations = useMemo(() => planRecommendations.filter((recommendation) => recommendation.trace.ruleId === "adapt-unavailable-equipment" || (recommendation.trace.ruleId === "adapt-available-time" && decisionForRecommendation(recommendation, recommendationDecisions, activePlan.id, preferences.weightUnit)?.decision !== "dismissed") || decisionForRecommendation(recommendation, recommendationDecisions, activePlan.id, preferences.weightUnit)?.decision === "accepted"), [planRecommendations, recommendationDecisions, activePlan.id, preferences.weightUnit]);
    const resolvedPlan = useMemo(() => resolveWorkoutForToday(activePlan, sessionRecommendations, exercises, preferences.weightUnit), [activePlan, sessionRecommendations, preferences.weightUnit]);
    const workoutExerciseIds = useMemo(() => activeSession ? sessionExercises(activeSession).map((exercise) => exercise.exerciseId) : planExerciseIds(resolvedPlan), [activeSession, resolvedPlan]);
    const sessionPlannedExercises = useMemo(() => resolvedPlan.plannedExercises ?? [], [resolvedPlan]);
    const sessionSets = activeSession?.sets ?? [];
    const sessionUnit = activeSession?.unit ?? preferences.weightUnit;
    const loggerSetTargets = useMemo(() => new Map((activeSession ? sessionExercises(activeSession) : sessionPlannedExercises).map((item) => [item.exerciseId, item.sets])), [activeSession, sessionPlannedExercises]);
    const initialSetInput = useMemo<SetInput>(() => {
        const exercise = exercises.find((item) => item.id === selectedExerciseId);
        if (!exercise)
            return { weight: "0", reps: "0", rir: "", rpe: "" };
        const progression = planRecommendations.find((item) => item.type === "PROGRESSION" && recommendationExerciseId(item) === selectedExerciseId && !(["dismissed", "rejected"] as (string | undefined)[]).includes(decisionForRecommendation(item, recommendationDecisions, activePlan.id, preferences.weightUnit)?.decision))?.change;
        const prescription = activeSession ? sessionExercises(activeSession).find((item) => item.exerciseId === selectedExerciseId) : undefined;
        const latestSet = activeSession?.sets.filter((set) => set.exerciseId === selectedExerciseId).at(-1) ?? [...workouts].sort((a, b) => b.date.localeCompare(a.date) || (b.completedAt ?? "").localeCompare(a.completedAt ?? "")).flatMap((workout) => workout.sets.filter((set) => set.exerciseId === selectedExerciseId && set.setType === (prescription?.setType ?? "working")).map((set) => ({ ...set, weight: displayWeight(set.weight, workout.unit, sessionUnit), }))).at(0);
        const repRange = prescription?.repRange ?? exercise.repRange;
        const suggestedLoad = progression?.kind === "progression" && progression.recommendedLoad ? displayWeight(progression.recommendedLoad, preferences.weightUnit, sessionUnit) : undefined;
        const savedInput = activeSession ? sessionLoadInput(activeSession, selectedExerciseId, sessionUnit) : undefined;
        return { weight: savedInput ?? String(suggestedLoad ?? latestSet?.weight ?? 0), reps: String(Math.min(repRange.max, Math.max(repRange.min, latestSet?.reps ?? repRange.min))), rir: "", rpe: "", };
    }, [activeSession, activePlan.id, planRecommendations, preferences.weightUnit, sessionUnit, recommendationDecisions, selectedExerciseId, workouts]);
    const setInput = setInputOverrides[selectedExerciseId] ?? initialSetInput;
    const pickerChoices = exercises.filter((exercise) => !workoutExerciseIds.includes(exercise.id) && (picker?.mode !== 'add' || ![...(activeSession?.plannedExercises ?? []), ...(activeSession?.addedExercises ?? [])].some((slot) => slot.exerciseId === exercise.id)));
    const pickerOriginal = exercises.find((exercise) => exercise.id === picker?.fromId);
    const alternatives = pickerOriginal ? findExerciseCandidates({ exercise: pickerOriginal, exercises, preferences, goals: preferences.goals, constraints: { ...(activeSession?.context ?? gymContext), excludedExerciseIds: workoutExerciseIds, requireSameCategory: true }, coachingPreferences: deriveCoachingPreferences(trainingState, recommendationDecisions) }).slice(0, 3) : [];
    function chooseExercise(exercise: typeof exercises[number]) {
        const replacementState = activeSession ? deriveTrainingState(exercises, workouts, activeSession.date, sessionUnit) : undefined;
        setActiveSession((current) => current ? picker?.mode === 'switch' && picker.fromId ? switchSessionExercise(current, picker.fromId, exercise, replacementState, recommendationDecisions) : addSessionExercise(current, exercise) : current);
        setSelectedExerciseId(exercise.id);
        setPicker(undefined);
        window.setTimeout(() => loggerRef.current?.querySelector<HTMLElement>(".logger-exercise.active .logger-exercise-heading")?.focus(), 0);
    }
    function cancelWorkout() {
        clearActiveWorkoutSession(); setActiveSession(null); setShowLogger(false); setConfirmCancel(false); setPicker(undefined); setSetInputOverrides({});
    }
    function updateSetInput(next: Partial<SetInput>) {
        setSetInputOverrides((current) => ({ ...current, [selectedExerciseId]: { ...(current[selectedExerciseId] ?? initialSetInput), ...next }, }));
    }
    function updateTodaysContext(next: TodaysContext) {
        freezeActiveGym();
        setStartNotice('');
        const gym = gyms.find((item) => item.id === next.gymId) ?? currentGym;
        setTodaysContext(saveTodaysContext(contextForGym({ ...next, unavailableEquipment: next.gymId === todaysContext.gymId ? next.unavailableEquipment : [] }, gym)));
    }
    function freezeActiveGym() {
        setActiveSession((current) => current && !current.gym ? captureSessionGym(current, currentGym, gymContext) : current);
    }
    function updateGym(gym: Gym) {
        freezeActiveGym();
        setStartNotice('');
        setGyms(saveGyms(gyms.some((item) => item.id === gym.id) ? gyms.map((item) => item.id === gym.id ? gym : item) : [...gyms, gym]));
        setTodaysContext(saveTodaysContext(contextForGym(todaysContext, gym)));
    }
    function updateSessionSets(update: (current: LoggedSet[]) => LoggedSet[]) {
        setActiveSession((current) => {
            if (!current)
                return current;
            const next = { ...current, sets: update(current.sets) };
            saveActiveWorkoutSession(next);
            return next;
        });
    }
    function addSet() {
        if (!activeSession || !workoutExerciseIds.includes(selectedExerciseId)) return;
        const parsedWeight = Number(setInput.weight);
        const parsedReps = Number(setInput.reps);
        const parsedRir = setInput.rir.trim() === "" ? undefined : Number(setInput.rir);
        const parsedRpe = setInput.rpe.trim() === "" ? undefined : Number(setInput.rpe);
        if (setInput.weight.trim() === "" || parsedWeight < 0 || !Number.isFinite(parsedWeight) || !Number.isFinite(parsedReps) || parsedReps <= 0 || (parsedRir !== undefined && (!Number.isFinite(parsedRir) || parsedRir < 0 || parsedRir > 5)) || (parsedRpe !== undefined && (!Number.isFinite(parsedRpe) || parsedRpe < 1 || parsedRpe > 10)))
            return;
        const target = loggerSetTargets.get(selectedExerciseId) ?? 0;
        const setType = activeSession ? sessionExercises(activeSession).find((exercise) => exercise.exerciseId === selectedExerciseId)?.setType ?? "working" : "working";
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
        const workout = { ...completeWorkoutSession(activeSession), unit: sessionUnit };
        setWorkouts(saveWorkout(workout, workouts));
        setCompletedWorkoutId(workout.id);
        setActiveSession(null);
        setShowLogger(false);
        setView("history");
    }
    function startPlan(plan: WorkoutTemplate) {
        if (activeSession) {
            setSelectedExerciseId(sessionExercises(activeSession).find((planned) => !activeSession.sets.filter((set) => set.exerciseId === planned.exerciseId).length)?.exerciseId ?? sessionExercises(activeSession)[0]?.exerciseId ?? "");
            setShowLogger(true);
            return;
        }
        const generatedRecommendations = generateRecommendations({ plan, exercises, history: workouts, trainingState, preferences, todaysContext: gymContext, decisions: recommendationDecisions, split: currentSplit, splitWorkouts: plans, authority: "user-plan" });
        const session = captureSessionGym(plan.id === "empty-workout" ? createWorkoutSession(plan, [], preferences.weightUnit) : createWorkoutSessionForToday(plan, generatedRecommendations, exercises, preferences.weightUnit, recommendationDecisions), currentGym, gymContext);
        session.adaptationNotes = generatedRecommendations.filter((recommendation) => recommendation.trace.ruleId === "adapt-unavailable-equipment").map((recommendation) => recommendation.reason);
        if (!session.plannedExercises?.length && plan.id !== "empty-workout") { setStartNotice(`No exercises from ${plan.name} fit today's gym and time settings. Adjust those settings before starting. Your saved plan is unchanged.`); return; }
        setStartNotice('');
        setPicker(undefined); setConfirmCancel(false);
        setActivePlan(plan);
        setSelectedExerciseId(sessionExercises(session)[0]?.exerciseId ?? "");
        setSetInputOverrides({});
        setActiveSession(session);
        setShowLogger(true);
    }
    function startRecommendedWorkout() {
        if (activeSession) {
            setSelectedExerciseId(sessionExercises(activeSession).find((planned) => !activeSession.sets.filter((set) => set.exerciseId === planned.exerciseId).length)?.exerciseId ?? sessionExercises(activeSession)[0]?.exerciseId ?? "");
            setShowLogger(true);
            return;
        }
        setPicker(undefined); setConfirmCancel(false);
        const recommended = recommendedPreview;
        const recommendedExercises = recommended.workout.plannedExercises ?? [];
        setActivePlan(recommended.workout);
        setSelectedExerciseId(recommendedExercises[0]?.exerciseId ?? exercises[0].id);
        setSetInputOverrides({});
        setActiveSession(captureSessionGym({ ...createWorkoutSession(recommended.workout, recommendedExercises, preferences.weightUnit), prescriptionChanges: recommended.prescriptionChanges }, currentGym, gymContext));
        setShowLogger(true);
    }
    function handleRecommendationDecision(recommendation: Recommendation, decision: "accepted" | "rejected" | "dismissed") {
        const affected = affectedExerciseIds(recommendation);
        const before = plannedExercisesFor(activePlan, exercises).filter((slot) => affected.includes(slot.exerciseId));
        const after = decision === "accepted" ? plannedExercisesFor(resolveWorkoutForToday(activePlan, [recommendation], exercises, preferences.weightUnit)).filter((slot) => affected.includes(slot.exerciseId)) : before;
        setRecommendationDecisions(saveRecommendationDecision(recommendation, decision, { coachingDate: previewDate, planId: activePlan.id, unit: preferences.weightUnit, prescriptionBefore: before, prescriptionAfter: after }));
        if (decision !== "accepted")
            return;
        if (recommendation.trace.ruleId === "adapt-unavailable-equipment" || recommendation.trace.ruleId === "adapt-available-time") return;
        if (activePlan.planningAuthority === "recommended")
            return;
        const updatedPlan = applyAcceptedRecommendation(activePlan, recommendation, exercises);
        if (JSON.stringify(updatedPlan) === JSON.stringify(activePlan))
            return;
        setActivePlan(updatedPlan);
        setPlans(savePlan(updatedPlan));
    }
    return (<div className="app-shell">
      <a className="skip-link" href="#top">Skip to content</a>
      <header className="topbar">
        <a className="brand" href="#top" onClick={() => setView("today")}><span className="brand-mark">b<span>.</span></span><span><strong>bobby bulk</strong><small>Small steps. Stronger you.</small></span></a>
        <Navigation view={view} onNavigate={(next) => { setView(next); window.scrollTo({ top: 0 }); }} />
        <div className="sidebar-bottom"><div className="sidebar-note"><span className="status-dot"/><strong>Built around you.</strong><p>Your goals. Your pace.<br/>One session at a time.</p></div>
        <div className="profile-chip"><span>Weight unit</span><div className="unit-toggle" role="group" aria-label="Weight unit">{(["lb", "kg"] as const).map((unit) => <button key={unit} aria-pressed={preferences.weightUnit === unit} className={preferences.weightUnit === unit ? "selected" : ""} onClick={() => setPreferences(savePreferences({ ...preferences, weightUnit: unit }))}>{unit}</button>)}</div></div></div>
      </header>
      <main id="top" tabIndex={-1}>
        {startNotice && <p className="session-size-note" role="alert">{startNotice}</p>}
        {activeSession && !showLogger && <div className="resume-banner"><span><strong>Workout in progress</strong><small>{sessionSets.length} {sessionSets.length === 1 ? "set" : "sets"} logged · saved on this device</small></span><button className="secondary-button" onClick={() => setShowLogger(true)}>Resume workout →</button></div>}
        {view === "today" && <TodayDashboard plan={previewPlan} reasons={recommendedPreview.reasons} sessionNote={recommendedPreview.sessionNote} workouts={workoutsInCurrentUnit} preferences={preferences} gyms={gyms} context={gymContext} inProgress={Boolean(activeSession)} loggedSets={sessionSets.length} asOf={trainingState.asOf} workload={trainingState.workload} onContextChange={updateTodaysContext} onSaveGym={updateGym} exerciseChoiceMessage={previewChanges.message} hasExerciseChoices={skippedIds.length > 0} onResetExerciseChoices={() => setExerciseChoices(undefined)} onSkipExercise={(id) => setExerciseChoices((current) => ({ base: basePreview, skippedIds: [...(current?.base === basePreview ? current.skippedIds : []), id] }))} onStart={startRecommendedWorkout} onPlans={() => setView("plans")} onHistory={() => setView("history")}>
            {activePlan.planningAuthority !== "recommended" && activePlanExerciseIds.length > 0 && <details className="saved-plan-suggestions mini-panel"><summary>Suggestions for {activePlan.name}</summary><p className="brief-note">Equipment and time adjustments apply to today's session. Other accepted changes update your saved plan. Start it from the Plans tab.</p>{planRecommendations.filter((item) => item.type !== "KEEP").map((item) => <RecommendationRow key={item.id} recommendation={item} unit={preferences.weightUnit} decision={decisionForRecommendation(item, recommendationDecisions, activePlan.id, preferences.weightUnit)?.decision} onDecision={handleRecommendationDecision} />)}{planRecommendations.every((item) => item.type === "KEEP") && <p className="brief-note">No changes suggested. Keep following your plan.</p>}</details>}
        </TodayDashboard>}        {view === "history" && (<HistoryView key={completedWorkoutId ?? "history"} initialWorkoutId={completedWorkoutId} trainingState={trainingState} workouts={workouts} unit={preferences.weightUnit} onUpdate={(workout) => setWorkouts(updateWorkout(workout, workouts))} onDelete={(workoutId) => setWorkouts(deleteWorkout(workoutId, workouts))}/>)}        {view === "exercises" && <ExercisesView trainingState={trainingState} />}        {view === "plans" && (<PlansView preferences={preferences} trainingState={trainingState} plans={plans} onSave={(plan) => setPlans(savePlan(plan))} onStart={startPlan} onDelete={(planId) => setPlans(deletePlan(planId))}/>)}        {view === "goals" && (<GoalsView preferences={preferences} onSave={(next) => {
                setPreferences(savePreferences(next));
                setView("today");
            }}/>)}      </main>      {showLogger && (<div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowLogger(false)}>          <section className="modal" role="dialog" aria-modal="true" ref={loggerRef} tabIndex={-1} aria-labelledby="logger-title">            <div className="modal-heading">              <div>                <p className="eyebrow">{activeSession?.title ?? activePlan.name}</p>                <h2 id="logger-title">Log workout</h2>              </div>              <button className="close-button" onClick={() => setShowLogger(false)} aria-label="Close logger">                ×              </button>            </div>            {activeSession?.gym && <p className="brief-note">Training at {activeSession.gym.name}. Gym changes apply to your next workout.</p>}
            {Boolean(activeSession?.adaptationNotes?.length) && <details className="session-explanation"><summary>Adjusted for this gym</summary><ul>{activeSession?.adaptationNotes?.map((note, index) => <li key={index}>{note}</li>)}</ul></details>}
            {activeSession && <label className="session-date">Workout date<input aria-label="Workout date" type="date" max={previewDate} value={activeSession.date} onChange={(event) => { const date = event.target.value; if (validSessionDate(date, previewDate)) setActiveSession((current) => current ? { ...current, date } : current); }} /></label>}
            <div className="logger-toolbar"><button type="button" className="secondary-button" onClick={() => setPicker({ mode: 'add' })}>+ Add exercise</button><small>{workoutExerciseIds.length} {workoutExerciseIds.length === 1 ? "movement" : "movements"}</small></div>
            {picker?.mode === 'add' && <ExercisePicker key={`${picker.mode}-${picker.fromId ?? ''}`} mode={picker.mode} choices={pickerChoices} alternatives={alternatives} onPick={chooseExercise} onClose={() => setPicker(undefined)} />}
            {!workoutExerciseIds.length && <div className="logger-empty"><h3>Your workout, your way</h3><p>Add your first exercise when you're ready.</p></div>}
            <div className="logger-progress"><div><strong>{sessionSets.length} {sessionSets.length === 1 ? "set" : "sets"} logged</strong><span>{Array.from(loggerSetTargets.values()).reduce((total, count) => total + count, 0)} planned</span></div><progress aria-label="Workout sets completed" value={sessionSets.length} max={Math.max(1, Array.from(loggerSetTargets.values()).reduce((total, count) => total + count, 0))}/></div>            <div className="logger-exercises">              {workoutExerciseIds.map((id, index) => {
                const exercise = exercises.find((item) => item.id === id);
                const loggedSets = sessionSets.filter((set) => set.exerciseId === id);
                const plannedExercise = activeSession ? sessionExercises(activeSession).find((item) => item.exerciseId === id) : undefined;
                if (!exercise)
                    return null;
                return (<article className={selectedExerciseId === id ? "logger-exercise active" : "logger-exercise"} key={index}>
                    <button type="button" className="logger-exercise-heading" aria-expanded={selectedExerciseId === id} aria-controls={`logger-content-${id}`} onClick={() => { setSelectedExerciseId((current) => current === id ? "" : id); setPicker(undefined); }}>
                        <span className="logger-exercise-number">{String(index + 1).padStart(2, "0")}</span>
                        <span><strong>{exercise.name}</strong><small>{loggedSets.length}/{loggerSetTargets.get(id) ?? exercise.defaultSets} planned {plannedExercise?.setType ?? "working"} sets</small></span>
                        <span className="logger-exercise-state">{loggedSets.length === (loggerSetTargets.get(id) ?? exercise.defaultSets) ? "✓" : ""}</span>
                    </button>
                    {selectedExerciseId === id && <div id={`logger-content-${id}`} className="logger-set-entry">
                        <LoadTarget recommendation={plannedExercise?.loadRecommendation ?? (activeSession?.exerciseSwaps?.some((swap) => swap.to.exerciseId === id) ? { kind: 'choose-load', unit: sessionUnit, reason: 'Choose a manageable starting load for this replacement and its rep range.' } : undefined)} />
                        {activeSession && plannedExercise?.setType === 'working' && !loggedSets.some((set) => set.setType === 'working') && <label>Skipping this movement? (optional)<select aria-label={`Skip reason for ${exercise.name}`} value={activeSession.exerciseOmissions?.find((item) => item.exerciseId === id)?.reason ?? ''} onChange={(event) => { const reason = event.target.value as 'voluntary' | 'time' | 'equipment' | ''; setActiveSession((current) => current ? { ...current, exerciseOmissions: [...(current.exerciseOmissions ?? []).filter((item) => item.exerciseId !== id), ...(reason ? [{ exerciseId: id, reason }] : [])] } : current) }}><option value="">No reason recorded</option><option value="voluntary">I choose not to do this movement</option><option value="time">Not enough time</option><option value="equipment">Equipment unavailable</option></select></label>}
                        <button type="button" className="text-button switch-exercise" onClick={() => setPicker({ mode: 'switch', fromId: id })}>Switch exercise &rarr;</button>
                        {picker?.mode === 'switch' && picker.fromId === id && <ExercisePicker key={id} mode="switch" choices={pickerChoices} alternatives={alternatives} onPick={chooseExercise} onClose={() => { setPicker(undefined); window.setTimeout(() => loggerRef.current?.querySelector<HTMLElement>(".logger-exercise.active .switch-exercise")?.focus(), 0); }} />}
                        {loggedSets.map((set, setIndex) => <div className="logged-set" key={set.id}><span>Set {setIndex + 1}</span><strong>{set.weight} {sessionUnit} × {set.reps}</strong><span>RIR {set.rir ?? "-"} · RPE {set.rpe ?? "-"}</span></div>)}
                        <div className="input-row effort-input-row">
                            <label>Weight ({sessionUnit})<input inputMode="decimal" placeholder="Choose weight" value={setInput.weight} onChange={(event) => updateSetInput({ weight: event.target.value })}/></label>
                            <label>Reps<input inputMode="numeric" value={setInput.reps} onChange={(event) => updateSetInput({ reps: event.target.value })}/></label>
                            <label title="Reps in reserve: how many more reps you could do">RIR<input inputMode="numeric" min="0" max="5" placeholder="Optional" value={setInput.rir} onChange={(event) => updateSetInput({ rir: event.target.value })}/></label>
                            <label title="Rate of perceived exertion: effort from 1 to 10">RPE<input inputMode="numeric" min="1" max="10" placeholder="Optional" value={setInput.rpe} onChange={(event) => updateSetInput({ rpe: event.target.value })}/></label>
                        </div>
                        <button className="secondary-button full" disabled={setInput.weight.trim() === "" || !Number.isFinite(Number(setInput.weight)) || Number(setInput.weight) < 0} onClick={addSet}>{loggedSets.length >= (loggerSetTargets.get(id) ?? exercise.defaultSets) ? "＋ Log extra working set" : "✓ Log working set"}</button>
                        {loggedSets.length >= (loggerSetTargets.get(id) ?? exercise.defaultSets) && <p className="extra-set-note">The recommendation is complete. Extra sets are recorded and included in your history.</p>}
                    </div>}
                </article>);
            })}            </div>            <div className="draft-list">              {sessionSets.length === 0 ? (<p className="empty-state">                  Log sets as you move through the plan.                </p>) : (sessionSets.map((set) => (<div className="draft-set" key={set.id}>                    <span>                      {exercises.find((exercise) => exercise.id === set.exerciseId)?.name}{" "}                      · Set {sessionSets.filter((item) => item.exerciseId === set.exerciseId).findIndex((item) => item.id === set.id) + 1}                    </span>                    <strong>                      {set.weight} {sessionUnit} × {set.reps}                    </strong>                    <button onClick={() => updateSessionSets((current) => current.filter((item) => item.id !== set.id))}>                      Remove                    </button>                  </div>)))}            </div>            <button className="primary-button full" disabled={sessionSets.length === 0} onClick={finishWorkout}>              Finish workout            </button>            {confirmCancel ? <div className="cancel-confirmation" role="alert"><strong>Discard this workout?</strong><p>Your {sessionSets.length} logged sets will be discarded.</p><button type="button" className="secondary-button" onClick={() => setConfirmCancel(false)}>Keep logging</button><button type="button" className="danger-button" onClick={cancelWorkout}>Discard workout</button></div> : <button type="button" className="text-button cancel-workout" onClick={() => sessionSets.length ? setConfirmCancel(true) : cancelWorkout()}>Cancel workout</button>}
            <p className="timing-note">              Your sets are saved as you go. Close this window to pause and resume later.            </p>          </section>        </div>)}    </div>);
}
function RecommendationRow({ recommendation, unit = "lb", decision, onDecision, }: {
    recommendation: Recommendation;
    unit?: WeightUnit;
    decision?: string;
    onDecision: (recommendation: Recommendation, decision: "accepted" | "rejected" | "dismissed") => void;
}) {
    const exercise = exercises.find((item) => item.id === recommendationExerciseId(recommendation));
    const replacement = recommendation.change.kind === "replace" ? recommendation.change : undefined;
    const alternative = replacement ? exercises.find((item) => item.id === replacement.toExerciseId) : undefined;
    const label = recommendation.change.kind === "split-adjustment" ? `Split alignment · ${recommendation.change.muscle}` : alternative ? `${exercise?.name} → ${alternative.name}` : exercise?.name;
    const requiredToday = recommendation.trace.ruleId === "adapt-unavailable-equipment";
    return (<div className="recommendation-row">      <div>        <strong>{recommendation.type}</strong>{" "}        <span>          {label}        </span>        {recommendation.change.kind === "progression" && (<small>            {recommendation.change.recommendedLoad ? `${recommendation.change.recommendedLoad} ${unit} · ${recommendation.change.repRange.min}–${recommendation.change.repRange.max}` : "Start with a manageable load"}          </small>)}        <small>{recommendation.reason}</small>        <details className="recommendation-details">          <summary>Why</summary>          <small>{recommendation.trace.principleDescription}</small>          <small className="evidence-badge">            Evidence {recommendation.trace.evidenceLevel} ·{" "}            {recommendation.trace.source.name}          </small>        </details>      </div>      <div className="recommendation-controls">        {requiredToday ? (<span className="recommendation-status applied">Applied today</span>) : decision === "accepted" ? (<>            <span className="recommendation-status accepted">Accepted</span>            <button onClick={() => onDecision(recommendation, "dismissed")}>Keep plan</button>          </>) : decision === "dismissed" ? (<>            <span className="recommendation-status dismissed">Keeping plan</span>            <button onClick={() => onDecision(recommendation, "accepted")}>Accept</button>          </>) : (<>            <button onClick={() => onDecision(recommendation, "accepted")}>Accept</button>            <button onClick={() => onDecision(recommendation, "rejected")}>Keep plan</button>          </>)}      </div>    </div>);
}
function GoalsForm({ preferences, onSave, }: {
    preferences: UserPreferences;
    onSave: (preferences: UserPreferences) => void;
}) {
    const [goals, setGoals] = useState<TrainingGoal[]>(preferences.goals);
    const [priorities, setPriorities] = useState(preferences.priorities);
    const goalOptions: TrainingGoal[] = ["Build muscle", "Get stronger", "Improve athletic performance", "Improve a specific skill", "General fitness", "Aesthetic physique",];
    const priorityOptions = ["Abs", "Upper chest", "Lats", "Side delts", "Biceps", "Rear delts", "Mid back", "Chest", "Quads", "Hamstrings", "Glutes",];
    function toggle<T>(items: T[], item: T) {
        return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
    }
    useEffect(() => {
        const options = document.querySelector(".priority-options");
        if (!options)
            return;
        const ranking = document.createElement("section");
        ranking.className = "priority-ranking";
        const heading = document.createElement("p");
        heading.className = "priority-ranking-heading";
        heading.textContent = "Priority order";
        ranking.append(heading);
        if (!priorities.length) {
            const empty = document.createElement("p");
            empty.className = "priority-ranking-empty";
            empty.textContent = "Select muscles above; the order you set here is your ranking.";
            ranking.append(empty);
        }
        priorities.forEach((priority, index) => {
            const row = document.createElement("div");
            row.className = "priority-ranking-row";
            const rank = document.createElement("span");
            rank.textContent = String(index + 1).padStart(2, "0");
            const name = document.createElement("strong");
            name.textContent = priority;
            const controls = document.createElement("div");
            const move = (label: string, offset: number) => {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = label;
                button.disabled = index + offset < 0 || index + offset >= priorities.length;
                button.setAttribute("aria-label", `Move ${priority} ${offset < 0 ? "up" : "down"}`);
                button.addEventListener("click", () => setPriorities((current) => {
                    const destination = index + offset;
                    if (destination < 0 || destination >= current.length)
                        return current;
                    const next = [...current];
                    [next[index], next[destination]] = [next[destination], next[index]];
                    return next;
                }));
                controls.append(button);
            };
            move("↑", -1);
            move("↓", 1);
            row.append(rank, name, controls);
            ranking.append(row);
        });
        options.insertAdjacentElement("afterend", ranking);
        return () => ranking.remove();
    }, [priorities]);
    return (<>      <section className="page-intro compact">        <div>          <p className="eyebrow">Personal settings</p>          <h1>What are you training for?</h1>          <p className="lede">            Keep it simple. Bobby uses these priorities to evaluate your            existing plans.          </p>        </div>      </section>      <section className="goals-layout">        <div className="goals-panel">          <p className="eyebrow">Primary goals</p>          <div className="goal-options">            {goalOptions.map((goal) => (<button key={goal} aria-pressed={goals.includes(goal)} className={goals.includes(goal) ? "goal-option active" : "goal-option"} onClick={() => setGoals(toggle(goals, goal))}>                {goals.includes(goal) ? "✓" : "+"} {goal}              </button>))}          </div>          <p className="eyebrow priority-label">            Anything you particularly want to improve?          </p>          <div className="priority-options">            {priorityOptions.map((priority) => (<button key={priority} aria-pressed={priorities.includes(priority)} className={priorities.includes(priority) ? "filter-chip active" : "filter-chip"} onClick={() => setPriorities(toggle(priorities, priority))}>                {priority}              </button>))}          </div>          <button className="primary-button save-goals" onClick={() => onSave({ ...preferences, goals, priorities })}>            Save preferences          </button>        </div>        <aside className="mini-panel goals-note">          <span className="why-icon">i</span>          <h2>How this helps</h2>          <p>            Your choices become structured evidence for plan evaluation. They            can suggest an addition or support keeping an exercise, but Bobby            will not change your plan automatically.          </p>        </aside>      </section>    </>);
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
function HistoryView({ trainingState, workouts, unit, onUpdate, onDelete, initialWorkoutId, }: {
        trainingState: TrainingState;
    workouts: Workout[];
        unit: WeightUnit;
        onUpdate?: (workout: Workout) => void;
        onDelete: (workoutId: string) => void;
        initialWorkoutId?: string;
}) {
        const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(initialWorkoutId ?? null);
        const [editingSets, setEditingSets] = useState<LoggedSet[]>(() => workouts.find((workout) => workout.id === initialWorkoutId)?.sets.map((set) => ({ ...set })) ?? []);
        const [editingDate, setEditingDate] = useState(() => workouts.find((workout) => workout.id === initialWorkoutId)?.date ?? "");
        const [newExerciseId, setNewExerciseId] = useState(exercises[0].id);
        const [newWeight, setNewWeight] = useState("");
        const [newReps, setNewReps] = useState("");
        const [visibleWorkoutCount, setVisibleWorkoutCount] = useState(20);
        const allWorkouts = [...workouts].sort((a, b) => b.date.localeCompare(a.date) || (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
        const sortedWorkouts = allWorkouts.slice(0, visibleWorkoutCount);
        const selectedWorkout = allWorkouts.find((workout) => workout.id === selectedWorkoutId);
        const sessionAnalysis = selectedWorkout ? trainingState.outcomes.find((outcome) => outcome.sessionId === selectedWorkout.id) : undefined;
        const plannedComparison = selectedWorkout ? comparePlannedVsActual(selectedWorkout) : [];
        function selectWorkout(workout: Workout) {
                setSelectedWorkoutId(workout.id);
                setEditingDate(workout.date);
                setEditingSets(workout.sets.map((set) => ({ ...set })));
        }
        function saveEdits() {
                if (!selectedWorkout || !validSessionDate(editingDate, trainingState.asOf)) return;
            const updated = { ...selectedWorkout, date: editingDate, sets: editingSets };
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
            <section className="page-intro compact"><div><p className="eyebrow">Your training archive</p><h1>History</h1><p className="lede">Look back at your sessions, track your progress, and fine-tune your log.</p></div><span className="archive-count">{workouts.length} sessions</span></section>
            {sessionAnalysis && <WorkoutSummary analysis={sessionAnalysis} justCompleted={selectedWorkoutId === initialWorkoutId} />}
            <div className="history-layout">
                <section className="history-list"><div className="section-heading"><h2>Recent workouts</h2><span className="muted">Newest first</span></div>
                      {sortedWorkouts.map((workout) => <article className={selectedWorkoutId === workout.id ? "workout-row selected" : "workout-row"} key={workout.id} tabIndex={0} onClick={() => selectWorkout(workout)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") selectWorkout(workout); }}>
                        <div className="date-block"><strong>{new Date(`${workout.date}T12:00:00`).toLocaleDateString("en-US", { day: "2-digit" })}</strong><span>{new Date(`${workout.date}T12:00:00`).toLocaleDateString("en-US", { month: "short" })}</span></div>
                        <div className="workout-info"><strong>{workout.title}</strong><span>{new Set(workout.sets.map((set) => set.exerciseId)).size} exercises · {workout.sets.length} sets · {workout.unit ?? unit}</span></div>
                        <button className="delete-button" onClick={(event) => { event.stopPropagation(); if (window.confirm(`Delete ${workout.title} from history?`)) onDelete(workout.id); }} aria-label={`Delete ${workout.title} on ${workout.date}`}>×</button>
                    </article>)}
                    {allWorkouts.length > sortedWorkouts.length && <button className="history-show-more" onClick={() => setVisibleWorkoutCount((current) => current + 20)}>Show 20 more workouts</button>}
                </section>
                <aside className="progression-detail history-detail">
                    {selectedWorkout ? <>
                        <div className="section-heading"><div><p className="eyebrow">{formatDate(selectedWorkout.date)}</p><h2>{selectedWorkout.title}</h2></div><span className="muted">{editingSets.length} sets</span></div>
                        <label className="session-date">Session date<input aria-label="Session date" type="date" max={trainingState.asOf} value={editingDate} onChange={(event) => setEditingDate(event.target.value)} /></label>
                        {plannedComparison.length > 0 && <div className="history-plan-comparison">{plannedComparison.map((item) => <span key={item.exerciseId}>{exercises.find((exercise) => exercise.id === item.exerciseId)?.name}: {item.completedWorkingSets}{item.plannedSets === undefined ? " working sets · additional movement" : `/${item.plannedSets} working sets`}{item.demonstratedWorkingLoad === undefined ? "" : ` · demonstrated load ${displayWeight(item.demonstratedWorkingLoad, selectedWorkout.unit, unit)} ${unit}`}</span>)}</div>}
                        <div className="history-set-list">{editingSets.map((set, index) => <div className="history-set-row" key={set.id}><span>{exercises.find((exercise) => exercise.id === set.exerciseId)?.name ?? set.exerciseId}<small>Set {index + 1} · {set.setType}</small></span><input aria-label="Weight" type="number" readOnly={Boolean(set.loadType && set.loadType !== "external")} value={displayedWeight(set, selectedWorkout)} onChange={(event) => setEditingSets((current) => current.map((item) => item.id === set.id ? { ...item, weight: convertWeight(Number(event.target.value), unit, selectedWorkout.unit ?? unit) } : item))} /><input aria-label="Reps" type="number" value={set.reps} onChange={(event) => setEditingSets((current) => current.map((item) => item.id === set.id ? { ...item, reps: Number(event.target.value) } : item))} /><span>{unit}</span></div>)}</div>
                        <div className="history-add-set">
                            <select aria-label="Exercise for new set" value={newExerciseId} onChange={(event) => setNewExerciseId(event.target.value)}>
                                {exercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}
                            </select>
                            <input aria-label="New set weight" type="number" min="0" value={newWeight} onChange={(event) => setNewWeight(event.target.value)} placeholder={`Weight (${unit})`} />
                            <input aria-label="New set reps" type="number" min="1" value={newReps} onChange={(event) => setNewReps(event.target.value)} placeholder="Reps" />
                            <button className="secondary-button" onClick={addSet}>Add set</button>
                        </div>
                        <button className="primary-button full" disabled={!validSessionDate(editingDate, trainingState.asOf)} onClick={saveEdits}>Save changes</button>
                    </> : <p className="empty-state">Select a workout to see every set and edit the logged weight or reps.</p>}
                </aside>
            </div>
        </>);
}

function ExercisesView({ trainingState }: { trainingState: TrainingState }) {
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState("All");
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const categories = ["All", ...new Set(exercises.map((exercise) => exercise.category))];
    const visible = exercises.filter((exercise) => `${exercise.name} ${exercise.category} ${exercise.equipment} ${exercise.primaryMuscles.join(" ")}`.toLowerCase().includes(query.toLowerCase()) && (filter === "All" || exercise.category === filter));
    return <>
        <section className="page-intro compact"><div><p className="eyebrow">Exercise database</p><h1>Find your next movement.</h1><p className="lede">Search by name, muscle, or equipment. Tap a movement to see details and your progress.</p></div></section>
        <div className="library-toolbar"><label className="search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercises, muscles, equipment..." aria-label="Search exercises" />{query && <button onClick={() => setQuery("")} aria-label="Clear search">×</button>}</label><div className="filter-row">{categories.map((category) => <button key={category} className={filter === category ? "filter-chip active" : "filter-chip"} onClick={() => setFilter(category)}>{category}</button>)}</div></div>
        <div className="result-line"><span>{visible.length} movements</span><span>Click a row for details</span></div>
        <div className="exercise-library">{visible.map((exercise) => {
            const expanded = expandedId === exercise.id;
            const features = exerciseTrainingState(trainingState, exercise.id);
            return <details open={expanded} className={expanded ? "library-card expanded" : "library-card"} key={exercise.id}>
                <summary className="exercise-row-trigger" onClick={(event) => { event.preventDefault(); setExpandedId(expanded ? null : exercise.id); }} aria-expanded={expanded}><span className="library-icon">{exercise.type === "compound" ? "◎" : "◒"}</span><span className="library-copy"><span className="card-kicker">{exercise.type} · {exercise.category}</span><strong>{exercise.name}</strong><small>{exercise.equipment}</small></span><span className="expand-mark">{expanded ? "−" : "+"}</span></summary>
                {expanded && <div className="exercise-details"><div><span className="detail-label">Primary muscles</span><div className="tag-list">{exercise.primaryMuscles.map((muscle) => <span key={muscle}>{muscle}</span>)}</div></div><div className="detail-grid"><div><span className="detail-label">Goals</span><strong>{exercise.goals.join(" · ")}</strong></div><div><span className="detail-label">Working range</span><strong>{exercise.defaultSets} sets · {exercise.repRange.min}–{exercise.repRange.max} reps</strong></div><div><span className="detail-label">Equipment</span><strong>{exercise.equipment}</strong></div><div><span className="detail-label">Pattern</span><strong>{exercise.category}</strong></div></div><ExerciseHistoryEvidence features={features} unit={trainingState.unit} /></div>}
            </details>;
        })}{visible.length === 0 && <div className="no-results"><strong>No movements found</strong><span>Try a different name, muscle, or equipment.</span></div>}</div>
    </>;
}

function ExerciseHistoryEvidence({ features, unit }: { unit: WeightUnit; features: ReturnType<typeof exerciseTrainingState> }) {
    const latest = features.mostRecentPerformance;
    if (!latest) return <div className="exercise-progress-summary"><span className="detail-label">Your training history</span><span>No working-set history yet.</span></div>;
    return <div className="exercise-progress-summary">
        <span className="detail-label">Your training history</span><strong>{features.progressionState}</strong><span>{features.sessionsPerformed} sessions · last trained {formatDate(latest.date)} · {features.historyConfidence} evidence</span>
        <div className="exercise-history-evidence"><span>Last: {latest.completedWorkingSets} working sets · {latest.completion}</span><span>Best: {features.bestWorkingWeight ?? "—"}{features.bestRepsAtBestWeight === undefined ? "" : ` × ${features.bestRepsAtBestWeight}`} · est. 1RM {features.bestEstimatedOneRepMax ?? "—"}</span><span>Recent volume: {features.recentWorkingVolume} · completion {features.averageCompletionRate === undefined ? "—" : `${Math.round(features.averageCompletionRate * 100)}%`}</span>{features.recentPerformances.map((performance) => <div className="exercise-session-sets" key={performance.sessionId}><strong>{formatDate(performance.date)}{performance.plannedSets === undefined ? " · no saved prescription" : ` · planned ${performance.plannedSets} × ${performance.plannedRepRange?.min}–${performance.plannedRepRange?.max}`}</strong><span>{performance.sets.map((set) => `${set.setType}: ${set.weight} ${unit} × ${set.reps}${set.rir === undefined ? set.rpe === undefined ? "" : ` @ RPE ${set.rpe}` : ` @ ${set.rir} RIR`}`).join(" · ")}</span></div>)}</div>
    </div>;
}

function PlansView({ preferences, trainingState, plans, onSave, onStart, onDelete, }: {
    preferences: UserPreferences;
    trainingState: TrainingState;
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
    const splitEvaluation = useMemo(() => evaluateSplit({ id: "current-plan-collection", name: "Current plans", workoutIds: plans.map((plan) => plan.id) }, plans, exercises, preferences, trainingState), [plans, preferences, trainingState]);
    useEffect(() => {
        const container = document.querySelector(".saved-plans");
        if (!container)
            return;
        const panel = document.createElement("section");
        panel.className = "split-summary";
        const assessment = splitEvaluation.overallAssessment;
        const coverage = splitEvaluation.muscleSummary.slice(0, 4).map((item) => `${item.muscle} ${item.plannedWorkingSets}`).join(" · ");
        const headline = planCountLabel(plans.length);
        const observations = splitEvaluation.findings.slice(0, 2);
        const eyebrow = document.createElement("p");
        eyebrow.className = "eyebrow";
        eyebrow.textContent = "Split overview";
        const title = document.createElement("h3");
        title.textContent = headline;
        const copy = document.createElement("p");
        copy.className = "split-summary-copy";
        copy.textContent = coverage || "Save two or more plans to see direct muscle coverage, overlap, and repeated stimuli.";
        const statuses = document.createElement("div");
        statuses.className = "split-statuses";
        [`Distribution: ${assessment.distribution}`, `Recovery: ${assessment.recovery}`, `Variation: ${assessment.redundancy}`].forEach((label) => {
            const status = document.createElement("span");
            status.textContent = label;
            statuses.append(status);
        });
        panel.append(eyebrow, title, copy, statuses);
        if (observations.length) {
            const list = document.createElement("ul");
            observations.forEach((item) => {
                const observation = document.createElement("li");
                observation.textContent = item.title;
                list.append(observation);
            });
            panel.append(list);
        }
        container.insertBefore(panel, container.children[1] ?? null);
        return () => panel.remove();
    }, [plans.length, splitEvaluation]);
    return (<>      <section className="page-intro compact">        <div>          <p className="eyebrow">Your training system</p>          <h1>Plans</h1>          <p className="lede">            Create the days you want to repeat. Bobby will keep the history and            progression underneath.          </p>        </div>      </section>      <div className="plan-builder-layout">        <section className="plan-builder">          <div className="section-heading">            <div>              <p className="eyebrow">New plan</p>              <h2>Build your own day</h2>            </div>            <span className="plan-count">{selectedIds.length} exercises</span>          </div>          <div className="input-row">            <label>              Plan name              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Pull day"/>            </label>            <label>              Focus              <input value={focus} onChange={(event) => setFocus(event.target.value)} placeholder="e.g. Back · Biceps"/>            </label>          </div>          <label className="add-exercise-label">            Add an exercise            <select value={exerciseToAdd} onChange={(event) => setExerciseToAdd(event.target.value)}>              {exercises.map((exercise) => (<option key={exercise.id} value={exercise.id}>                  {exercise.name}                </option>))}            </select>          </label>          <button className="secondary-button" onClick={addExercise}>            ＋ Add to plan          </button>          <div className="builder-list">            {selectedIds.length === 0 ? (<p className="empty-state">                Your plan is empty. Add the movements you want to train.              </p>) : (selectedIds.map((id, index) => {
            const exercise = exercises.find((item) => item.id === id);
            return exercise ? (<div className="builder-row" key={id}>                    <span>{String(index + 1).padStart(2, "0")}</span>                    <strong>{exercise.name}</strong>                    <small>                      {exercise.defaultSets} sets · {exercise.repRange.min}–                      {exercise.repRange.max}                    </small>                    <button onClick={() => setSelectedIds((current) => current.filter((item) => item !== id))} aria-label={`Remove ${exercise.name}`}>                      ×                    </button>                  </div>) : null;
        }))}          </div>          <button className="primary-button" disabled={!name.trim() || selectedIds.length === 0} onClick={createPlan}>            Save plan          </button>        </section>        <aside className="saved-plans">          <div className="section-heading">            <div>              <p className="eyebrow">Ready when you are</p>              <h2>Saved plans</h2>            </div>          </div>          {allPlans.map((plan) => (<article className="saved-plan" key={plan.id}>              <div>                <strong>{plan.name}</strong>                <span>                  {plan.focus} · {planExerciseIds(plan).length} exercises                </span>              </div>              <div className="saved-plan-actions">                <button className="text-button" onClick={() => onStart(plan)}>                  Start →                </button>                {plans.some((item) => item.id === plan.id) && (<button className="delete-button" onClick={() => {
                    if (window.confirm(`Delete ${plan.name}?`))
                        onDelete(plan.id);
                }} aria-label={`Delete ${plan.name}`}>                    ×                  </button>)}              </div>            </article>))}        </aside>      </div>    </>);
}
function planCountLabel(count: number) {
    return count === 0 ? "No saved plans yet" : count === 1 ? "1 saved plan" : `${count} saved plans`;
}
function formatDate(date: string) {
    return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", });
}
export default App;
