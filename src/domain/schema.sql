-- SQLite migration target for the local-first MVP.
CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  equipment TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('compound', 'isolation')),
  primary_muscles_json TEXT NOT NULL,
  goals_json TEXT NOT NULL,
  rep_min INTEGER NOT NULL,
  rep_max INTEGER NOT NULL,
  default_sets INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS workouts (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS sets (
  id TEXT PRIMARY KEY,
  workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  weight REAL NOT NULL,
  reps INTEGER NOT NULL,
  rir REAL,
  set_duration_seconds INTEGER,
  rest_duration_seconds INTEGER
);

CREATE INDEX IF NOT EXISTS sets_exercise_date ON sets(exercise_id, workout_id);