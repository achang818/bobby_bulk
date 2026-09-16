# Implementation prompt: post-workout analysis

Add post-workout analysis for Recommended Workout and My Plans, following the
planning-authority and feedback-loop requirements in the master specification.

First, preserve the exact prescribed exercises, sets, rep ranges, set types,
ordering, and planning authority through starting, resuming, and completing a
workout. A workout shortened from three sets to two must remain a two-set
prescription in the logger and history. Completing both counts as full set
completion. Preserve weight units and keep movements added during logging
separate from the original prescription.

Use the existing deterministic performance-comparison and training-state logic
to produce a brief completion summary: what was completed, meaningful progress,
and results worth watching. Distinguish missing work from demonstrated decline,
and inconclusive comparisons from evidence of progress. One weaker session must
not establish a regression trend or trigger a regression-based replacement.

Make the review available in History and recompute it when logged data is
corrected. Completed working sets should feed the existing history, feature,
state, recommendation, and workout-construction paths. Generated workouts must
not modify saved plans; permanent changes to My Plans require user acceptance.

Add focused tests for prescription preservation, restart and persistence,
completion, comparable performance, uncertain evidence, and both feedback
paths. Run the full tests, build, and lint, then verify the finish/review flow at
desktop and phone widths using isolated browser data.
