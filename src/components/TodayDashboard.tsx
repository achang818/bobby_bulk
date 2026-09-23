import type { ReactNode } from "react";
import { exercises } from "../domain/exercises";
import { LoadTarget } from './LoadTarget';
import { GymProfiles } from './GymProfiles';
import { equipmentLabels } from '../domain/equipment';
import { evaluateWorkout } from "../domain/workout-evaluator";
import type { Gym, TodaysContext, UserPreferences, Workout, WorkoutTemplate } from "../domain/models";

type Props = {
    asOf: string;
    plan: WorkoutTemplate;
    reasons: string[];
    sessionNote?: string;
    workouts: Workout[];
    preferences: UserPreferences;
    gyms: Gym[];
    context: TodaysContext;
    inProgress: boolean;
    loggedSets: number;
    workload: string;
    onContextChange: (context: TodaysContext) => void;
    onSaveGym: (gym: Gym) => void;
    exerciseChoiceMessage: string;
    hasExerciseChoices: boolean;
    onSkipExercise: (exerciseId: string) => void;
    onResetExerciseChoices: () => void;
    onStart: () => void;
    onPlans: () => void;
    onHistory: () => void;
    children?: ReactNode;
};

export function TodayDashboard({ asOf, plan, reasons, sessionNote, workouts, preferences, gyms, context, inProgress, loggedSets, workload, onContextChange, onSaveGym, exerciseChoiceMessage, hasExerciseChoices, onSkipExercise, onResetExerciseChoices, onStart, onPlans, onHistory, children }: Props) {
    const planned = plan.plannedExercises ?? [];
    const totalSets = planned.reduce((total, exercise) => total + exercise.sets, 0);
    const lastWorkout = [...workouts].sort((a, b) => b.date.localeCompare(a.date))[0];
    const gym = gyms.find((item) => item.id === context.gymId) ?? gyms[0];
    const health = evaluateWorkout(plan, exercises, context, preferences);
    const warnings = health.findings.filter((finding) => finding.severity !== "info");
    const startLabel = inProgress ? "Resume workout" : "Start workout";
    return <>
        <section className="page-intro">
            <div><p className="eyebrow">{new Date(`${asOf}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
                <h1>A little stronger, today.</h1><p className="lede">Your next session, with the details taken care of.</p></div>
            <span className="workspace-label"><span className="status-dot" /> Your training space</span>
        </section>
        <section className="dashboard-grid">
            <div className="today-main-column">
                <section className="session-card">
                    <div className="session-hero">
                        <div className="session-hero-top"><span className="session-badge">{inProgress ? "WORKOUT IN PROGRESS" : "BUILT FOR YOU"}</span><span className="session-spark" aria-hidden="true">✳</span></div>
                        <p className="session-kicker">{inProgress ? plan.name : "Your recommended session"}</p>
                        <h2>{plan.focus.replaceAll("Â·", "·") || "Balanced training"}</h2>
                        <p>{inProgress ? "Pick up where you left off. Your logged sets are saved." : "Shaped by your goals, recent training, and available equipment."}</p>
                        <div className="session-metrics"><span><strong>{planned.length}</strong> exercises</span><span><strong>{totalSets}</strong> planned sets</span>{inProgress && <span><strong>{loggedSets}</strong> logged</span>}</div>
                        <div className="session-hero-actions"><button className="primary-button" disabled={!inProgress && !planned.length} onClick={onStart}>{startLabel}<span aria-hidden="true"> →</span></button><button className="hero-secondary" onClick={onPlans}>Browse my plans</button></div>
                    </div>
                    <div className="session-body"><div className="section-heading"><h2>The workout</h2><span className="muted">Working sets</span></div>
                        {!inProgress && <div className="exercise-choice-status"><p role="status">{exerciseChoiceMessage}</p>{hasExerciseChoices && <button className="text-button" onClick={onResetExerciseChoices}>Reset exercise choices</button>}</div>}
                        {!inProgress && sessionNote && <p className="session-size-note">{sessionNote}</p>}
                        {!planned.length && <p className="empty-state">No exercises fit your current context. Check available equipment or choose one of your plans.</p>}
                        <div className="today-plan-list">{planned.map((prescription, index) => {
                            const exercise = exercises.find((item) => item.id === prescription.exerciseId);
                            return exercise && <div className="today-plan-row" key={prescription.order}>
                                <span className="movement-number">{String(index + 1).padStart(2, "0")}</span>
                                <div><strong>{exercise.name}</strong><small>{exercise.primaryMuscles.join(" · ")} · {exercise.equipment}</small></div>
                                <div className="movement-prescription"><strong>{prescription.sets} × {prescription.repRange.min}–{prescription.repRange.max}</strong><small>sets × reps</small></div>
                                <LoadTarget recommendation={prescription.loadRecommendation} />
                                {!inProgress && <button type="button" className="text-button exercise-skip" aria-label={`I can't do ${exercise.name}`} onClick={() => onSkipExercise(exercise.id)}>I can't do this exercise</button>}
                            </div>;
                        })}</div>
                        {!inProgress && reasons.length > 0 && <details className="session-explanation"><summary>Why this session?</summary><ul>{reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul></details>}
                    </div>
                </section>
                {children}
            </div>
            <aside className="side-column">
                <section className="mini-panel context-panel"><div className="panel-title"><span>Make it fit your day</span></div><p className="brief-note">{inProgress ? "Changes apply to your next session." : "Adjust these before you start."}</p>
                    <label className="context-select">Training at<select value={context.gymId} onChange={(event) => onContextChange({ ...context, gymId: event.target.value })}>{gyms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                    <label className="context-select">Time available <span className="optional-label">(minutes)</span><input type="number" min="10" max="240" placeholder="No time limit" value={context.availableMinutes ?? ""} onChange={(event) => onContextChange({ ...context, availableMinutes: event.target.value ? Number(event.target.value) : undefined })} /></label>
                    <details className="equipment-disclosure"><summary>Unavailable equipment{context.unavailableEquipment.length > 0 ? ` (${context.unavailableEquipment.length})` : ""}</summary><fieldset className="equipment-options"><legend className="sr-only">Equipment unavailable today</legend>{[...(gym?.equipment.filter((tag) => tag !== 'bodyweight') ?? []), 'bodyweight' as const].map((equipment) => <label key={equipment}><input type="checkbox" checked={context.unavailableEquipment.includes(equipment)} onChange={() => onContextChange({ ...context, unavailableEquipment: context.unavailableEquipment.includes(equipment) ? context.unavailableEquipment.filter((item) => item !== equipment) : [...context.unavailableEquipment, equipment] })} />{equipmentLabels[equipment]}</label>)}</fieldset></details>
                    <GymProfiles gyms={gyms} selectedId={context.gymId} onSave={onSaveGym} />
                </section>
                <section className="mini-panel workload-panel"><div className="panel-title">Recent workload<span className={`workload-pill workload-${workload.toLowerCase()}`}>{workload}</span></div><p className="brief-note">Completed working sets over the past seven days.</p>
                    <details className="session-explanation"><summary>Workout balance</summary>{warnings.length ? warnings.map((finding) => <div className="workout-health-finding" key={finding.title}><strong>{finding.title}</strong><span>{finding.description}</span></div>) : <p className="brief-note">No structural concerns identified.</p>}</details>
                </section>
                <section className="mini-panel last-session"><div className="panel-title"><span>Last session</span>{lastWorkout && <span>{new Date(`${lastWorkout.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}</div><strong>{lastWorkout?.title ?? "A fresh start"}</strong><p>{lastWorkout ? `${lastWorkout.sets.length} sets · ${new Set(lastWorkout.sets.map((set) => set.exerciseId)).size} exercises` : "Your first workout starts here."}</p><button className="text-button" onClick={onHistory}>View training history <span aria-hidden="true">→</span></button></section>
            </aside>
        </section>
    </>;
}
