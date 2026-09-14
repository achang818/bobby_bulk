export type View = "today" | "history" | "exercises" | "plans" | "goals";

const destinations: { id: View; label: string; path: string }[] = [
    { id: "today", label: "Today", path: "M3 10 12 3l9 7M5 9v11h5v-6h4v6h5V9" },
    { id: "plans", label: "Plans", path: "M8 5H5v16h14V5h-3M8 3h8v4H8zM8 12h8M8 16h5" },
    { id: "history", label: "History", path: "M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2" },
    { id: "exercises", label: "Exercises", path: "m6 6 12 12M4 9l5-5M2 7l5-5M15 20l5-5M17 22l5-5" },
    { id: "goals", label: "Goals", path: "M21 12a9 9 0 1 1-9-9M17 12a5 5 0 1 1-5-5M12 12l9-9M16 3h5v5" },
];

export function Navigation({ view, onNavigate }: { view: View; onNavigate: (view: View) => void }) {
    return <nav className="main-nav" aria-label="Main navigation">
        <p className="nav-caption">YOUR TRAINING</p>
        {destinations.map(({ id, label, path }) => <button key={id} className={view === id ? "nav-link active" : "nav-link"} aria-current={view === id ? "page" : undefined} onClick={() => onNavigate(id)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>
            <span>{label}</span>
        </button>)}
    </nav>;
}
